import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import {sendSocket} from '../server/socket-send.mjs';

test('unchanged host uploads are quiet and final idle/heal states reach peers',async()=>{
  const authority=createCombatAuthority({rooms:new Map(),peers:new Map()});
  try{
    const enemy={id:'home:1',type:'slime',x:25,z:25,hp:10,maxHp:10,phase:'idle',changedAt:1};
    const room={combat:{enemies:new Map([[enemy.id,enemy]])}};
    assert.equal(authority.activeSnapshots(room).length,1);
    enemy.changedAt=Date.now();
    assert.deepEqual(authority.activeSnapshots(room),[]);
    enemy.hp=5;enemy.phase='chase';enemy.x=26;
    assert.equal(authority.activeSnapshots(room)[0].hp,5);
    enemy.hp=10;enemy.phase='idle';
    assert.equal(authority.activeSnapshots(room)[0].phase,'idle');
    assert.deepEqual(authority.activeSnapshots(room),[]);
  }finally{await authority.close();}
});

test('slow sockets coalesce creature updates without losing final states or delaying health',()=>{
  const sent=[],socket={readyState:1,bufferedAmount:70000,send:value=>sent.push(JSON.parse(value))};
  sendSocket(socket,{type:'enemies',enemies:[{id:'a',hp:10,x:1},{id:'b',hp:10}]});
  sendSocket(socket,{type:'enemies',enemies:[{id:'a',hp:10,x:2}]});
  assert.equal(sent.length,0);
  sendSocket(socket,{type:'enemyHealth',id:'a',enemyType:'slime',hp:5,x:2});
  assert.equal(sent[0].type,'enemyHealth');
  socket.bufferedAmount=0;
  sendSocket(socket,{type:'environment',snapshot:{}});
  assert.equal(sent[2].type,'enemies');
  assert.equal(sent[2].enemies.length,2);
  assert.equal(sent[2].enemies.find(e=>e.id==='a').hp,5);
  sendSocket(socket,{type:'enemies',enemies:[{id:'a',hp:0}]});
  assert.equal(sent.at(-1).enemies[0].hp,0);
});
