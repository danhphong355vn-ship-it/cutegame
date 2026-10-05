import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';
import { createAccountStore } from '../server/account-store.mjs';

function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } });
    const queue = [], waiters = [];
    socket.on('message', raw => {
      const item = JSON.parse(raw);
      const waiter = waiters.find(w => w.predicate(item));
      if (waiter) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(item);
      } else queue.push(item);
    });
    socket.once('error', reject);
    socket.once('open', () => resolve({
      socket,
      send: value => socket.send(JSON.stringify(value)),
      next(predicate, timeout = 4000) {
        const i = queue.findIndex(predicate);
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const waiter = {
            predicate,
            resolve: res,
            timer: setTimeout(() => {
              waiters.splice(waiters.indexOf(waiter), 1);
              rej(new Error('Missing socket event'));
            }, timeout)
          };
          waiters.push(waiter);
        });
      }
    }));
  });
}

test('1v1 Wager Duel: challenge, bet deduction, colosseum teleport, 1v1 lock, and winner pot claim', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-garden-duel-test-'));
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const game = await createGameServer({ port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  const clients = [];
  t.after(async () => {
    for (const c of clients) c.socket.terminate();
    await game.close();
  });

  async function registerExplorer(username, initialEnergy = 1000, level = 100) {
    const res = await fetch(game.url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password-123', name: username.toUpperCase() })
    });
    assert.equal(res.status, 200);
    const session = await res.json();
    const cookie = res.headers.get('set-cookie').split(';')[0];

    await store.command({
      actorId: session.account.id,
      requestId: randomUUID(),
      hash: 'a'.repeat(64),
      expectedRevision: session.revision,
      actionType: 'testFixture',
      run: records => {
        const profile = records.get(session.account.id).profile;
        profile.energy = initialEnergy;
        profile.level = level;
        return true;
      }
    });

    const client = await connect(game.url, cookie);
    clients.push(client);
    const joined = await client.next(m => m.type === 'joined');
    return Object.assign(client, { id: session.account.id, cookie, session, joined });
  }

  const host = await registerExplorer('alice_duel', 1000, 1000);
  const peer = await registerExplorer('bob_duel', 1000, 1);

  // 1. Alice sends duel challenge to Bob with bet = 500
  host.send({ type: 'duelChallenge', targetId: peer.id, bet: 500 });

  // 2. Bob receives duelInvite
  const invite = await peer.next(m => m.type === 'duelInvite');
  assert.equal(invite.fromId, host.id);
  assert.equal(invite.bet, 500);

  // 3. Bob accepts duel
  peer.send({ type: 'duelAccept', fromId: host.id });

  // 4. Both should receive profile updates showing 500 energy deducted (1000 -> 500)
  const aProfile = await host.next(m => m.type === 'profile' && m.profile.energy === 500);
  const bProfile = await peer.next(m => m.type === 'profile' && m.profile.energy === 500);
  assert.equal(aProfile.profile.energy, 500);
  assert.equal(bProfile.profile.energy, 500);

  // 5. Both receive arenaJoined with isDuel: true, bet: 500, pot: 1000
  const aArena = await host.next(m => m.type === 'arenaJoined');
  const bArena = await peer.next(m => m.type === 'arenaJoined');
  assert.equal(aArena.isDuel, true);
  assert.equal(aArena.bet, 500);
  assert.equal(aArena.pot, 1000);
  assert.equal(bArena.isDuel, true);
  assert.equal(bArena.bet, 500);
  assert.equal(bArena.pot, 1000);

  // 6. Spawn positions are symmetric on Colosseum (-7, 0) and (7, 0)
  assert.equal(aArena.spawnX, -7);
  assert.equal(bArena.spawnX, 7);

  // 7. Wait 3.5s immunity countdown, then Alice approaches Bob and attacks
  await new Promise(res => setTimeout(res, 3600));
  host.send({ type: 'pose', x: 6.5, z: 0 });
  await new Promise(res => setTimeout(res, 100));
  host.send({ type: 'basic' });

  // 8. Result: Alice wins pot 1000, Bob loses and keeps bag
  const aResult = await host.next(m => m.type === 'arenaResult' && m.won);
  const bResult = await peer.next(m => m.type === 'arenaResult' && !m.won);
  assert.equal(aResult.won, true);
  assert.equal(aResult.isDuel, true);
  assert.equal(aResult.pot, 1000);

  assert.equal(bResult.won, false);
  assert.equal(bResult.isDuel, true);
  assert.equal(bResult.bet, 500);

  // 9. Alice received pot (500 remaining + 1000 pot = 1500)
  const finalAlice = await store.get(host.id);
  const finalBob = await store.get(peer.id);
  assert.equal(finalAlice.profile.energy, 1500);
  assert.equal(finalBob.profile.energy, 500);
  assert.equal(finalAlice.arenaStats.wins, 1);
  assert.equal(finalBob.arenaStats.losses, 1);
});
