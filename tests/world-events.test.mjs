import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldEvents} from '../server/world-events.mjs';
import {createArena} from '../server/arena.mjs';
import {ARENA,WORLD_BOSS_INTERVAL,WORLD_BOSS_DURATION,inArena} from '../src/world-events.ts';
import * as Game from '../src/model.ts';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';

test('scheduled world bosses rotate, announce globally, expire and reject overlapping or unknown summons',t=>{
  let now=1000;const rooms=new Map(),messages=[],spawns=[],dismissals=[];
  const events=createWorldEvents({rooms,peers:new Map([['a',{socket:'a'}],['b',{socket:'b'}]]),send:(socket,value)=>messages.push([socket,value]),combat:{spawnWorldBoss:(room,boss)=>spawns.push(boss),dismissWorldBoss:(room,id)=>dismissals.push(id)},now:()=>now});t.after(()=>events.close());
  assert.equal(events.status().nextAt,now+WORLD_BOSS_INTERVAL);events.tick();assert.equal(spawns.length,0);
  now+=WORLD_BOSS_INTERVAL;events.tick();assert.equal(spawns[0].type,'dragon');assert.equal(messages.length,2);assert.equal(rooms.get('public:lava').worldEvent,true);
  assert.throws(()=>events.summon('mushking'),{status:409});
  now+=WORLD_BOSS_DURATION;events.tick();assert.deepEqual(dismissals,[spawns[0].id]);assert.equal(events.status().active,null);assert.equal(rooms.get('public:lava').worldEvent,false);
  assert.throws(()=>events.summon('unknown'),{status:400});
  events.summon();assert.equal(spawns[1].type,'mushking');events.finish('forged-id',[]);assert.ok(events.status().active);
  events.finish(spawns[1].id,[{id:'a',damage:50}]);assert.equal(events.status().active,null);assert.equal(messages.at(-1)[1].ranking[0].damage,50);
  events.finish(spawns[1].id,[]);assert.equal(messages.filter(([,m])=>m.phase==='defeated').length,2);
});

function arenaFixture(){
  let now=1000;const messages=[],commits=[],peers=new Map(),room={id:'public:lava'},rooms=new Map([[room.id,room]]);
  for(const id of ['a','b','outside'])peers.set(id,{account:{id,profile:Game.newGame(id)},socket:id,room:room.id,planet:'lava',active:true,party:null,visit:null,pose:{x:0,z:9}});
  const arena=createArena({peers,rooms,send:(id,m)=>messages.push([id,m]),broadcast:(_,m)=>messages.push(['room',m]),now:()=>now,commit:async(actor,type,ids,run)=>{commits.push({actor,type,ids});run(new Map([...peers].map(([id,p])=>[id,p.account])));}});
  return {arena,peers,messages,commits,advance:ms=>{now+=ms;}};
}
test('arena is opt-in, protects arrivals, awards one win/loss and never touches inventory or adventure HP',async()=>{
  const f=arenaFixture(),a=f.peers.get('a'),b=f.peers.get('b');const before=structuredClone([a.account.profile,b.account.profile]);
  f.arena.join(a);f.arena.join(b);assert.equal(f.arena.targets(a).length,0);f.advance(3001);
  assert.equal(f.arena.targets(a).length,1);assert.equal(f.arena.targets(f.peers.get('outside')).length,0);
  const target=f.arena.targets(a)[0];f.arena.hit(a,target,{amount:1e9});f.arena.hit(a,target,{amount:1e9});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.commits.length,1);assert.deepEqual(a.account.arenaStats,{wins:1,losses:0});assert.deepEqual(b.account.arenaStats,{wins:0,losses:1});assert.equal(f.arena.has(b),false);
  assert.deepEqual([a.account.profile,b.account.profile],before);
});
test('leaving the boundary, switching rooms, visiting or disconnecting removes PvP targets',()=>{
  const f=arenaFixture(),a=f.peers.get('a'),b=f.peers.get('b');
  a.planet='home';assert.throws(()=>f.arena.join(a),{status:400});a.planet='lava';a.party='PARTY';assert.throws(()=>f.arena.join(a),{status:400});a.party=null;
  f.arena.join(a);f.arena.join(b);f.advance(3001);a.pose.x=ARENA.x+ARENA.radius+1;assert.equal(inArena('lava',a.pose),false);assert.equal(f.arena.targets(b).length,0);f.arena.tick();assert.equal(f.arena.has(a),false);
  f.peers.delete('b');f.arena.tick();assert.equal(f.arena.has(b),false);
});
test('arena healing restores only the separate arena HP pool',()=>{
  const f=arenaFixture(),a=f.peers.get('a'),b=f.peers.get('b');f.arena.join(a);f.arena.join(b);f.advance(3001);
  const hp=b.account.profile.hp;f.arena.hit(a,f.arena.targets(a)[0],{amount:20});assert.ok(f.arena.targets(a)[0].hp<hp);f.arena.heal(b,1);assert.equal(f.arena.targets(a)[0].hp,hp);assert.equal(b.account.profile.hp,hp);
});
test('arena crowd control is capped and cannot damage or control spectators',()=>{
  const f=arenaFixture(),a=f.peers.get('a'),b=f.peers.get('b');f.arena.join(a);f.arena.join(b);f.advance(3001);
  f.arena.control(a,f.arena.targets(a)[0],'sheep',8);assert.equal(f.arena.canAct(b),false);assert.equal(f.arena.hit(b,{id:'arena:a'},{amount:100}),0);
  f.advance(2001);assert.equal(f.arena.canAct(b),true);f.arena.control(a,{id:'arena:outside'},'stun',3);assert.equal(f.arena.canAct(f.peers.get('outside')),true);
});

test('world boss rewards both contributors once through durable server transactions, including a departed contributor',async t=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'cute-world-boss-')),store=await createAccountStore({dataDir,databaseUrl:''});
  const peers=new Map(),room={id:'public:home',host:'a',members:new Set(['a','b']),enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]),messages=[],results=[];
  for(const id of ['a','b']){const profile=Game.newGame(id);const account=await store.create({id,username:'actor'+id,hash:'test',salt:'test',profile,friends:[],requests:[],profileRevision:0});peers.set(id,{account,active:true,visit:null,party:null,planet:'home',room:room.id,pose:{x:36,z:36,facing:0},socket:id});}
  const authority=createCombatAuthority({store,peers,rooms,remember:account=>{const peer=peers.get(account.id);if(peer)peer.account=account;return account;},send:(_,m)=>messages.push(m),broadcast:(_,m)=>messages.push(m),onWorldBossDefeat:(id,ranking)=>results.push({id,ranking})});
  t.after(async()=>{await authority.close();await store.close();});
  const event={id:'home:worldboss:test',type:'mushking',x:36,z:36};authority.spawnWorldBoss(room,event);
  const enemy=authority.state(room).enemies.get(event.id);assert.equal(enemy.hp,enemy.maxHp);assert.ok(enemy.worldBoss);
  authority.acceptSnapshots(room,[{id:event.id,type:event.type,x:36,z:36,hp:1,maxHp:1}]);assert.equal(enemy.hp,enemy.maxHp,'host cannot forge boss health');
  authority.bomb(peers.get('b'),5,1);room.members.delete('b');peers.delete('b');
  authority.bomb(peers.get('a'),5,1e6);authority.bomb(peers.get('a'),5,1e6);
  for(let i=0;i<100&&!results.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(results.length,1);assert.equal(results[0].ranking[0].id,'a');
  for(const id of ['a','b']){const account=await store.get(id);assert.equal(account.profile.energy,Game.newGame().energy+1000);assert.ok(account.profile.chest.starshard>=3,'three guaranteed shards plus any randomly rolled loot');assert.ok(account.profile.level>1||account.profile.xp>0);}
  assert.equal(messages.filter(m=>m.type==='defeat'&&m.id===event.id).length,1);
  assert.equal(messages.filter(m=>m.type==='dropSpawn').length,0,'equal rewards go to personal chests');
  authority.dismissWorldBoss(room,event.id);assert.equal(enemy.hp,0);
});
