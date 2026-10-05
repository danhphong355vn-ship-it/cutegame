import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import {newGame,activeStats} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import {createAccountStore} from '../server/account-store.mjs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('a live summoned dragon selects a stationary player, strikes and casts through the real authority loop',async t=>{
 const store=await createAccountStore({dataDir:await mkdtemp(path.join(tmpdir(),'boss-loop-')),databaseUrl:''});
 const profile=newGame();profile.planet='lava';profile.level=100;profile.hp=activeStats(profile).maxHp;const initialHp=profile.hp;
 const account=await store.create({id:'host',username:'host',hash:'test',salt:'test',profile,friends:[],requests:[],profileRevision:0});
 const peer={account,active:true,visit:null,planet:'lava',room:'public:lava',pose:{x:51.5,z:-50,facing:0,moving:false},socket:{}};
 const room={id:peer.room,members:new Set(['host']),host:'host',enemies:[],killed:new Set()},peers=new Map([['host',peer]]),rooms=new Map([[room.id,room]]);
 const w=Object.assign(Object.create(World.prototype),{state:profile,scene:new T.Scene(),camera:new T.PerspectiveCamera(),root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(51.5,0,-50),destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],particles:[],keys:new Set(),facing:0,time:0,planet:'lava',hazardTimer:0,marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),onInteract(){},onAttackEnemy(){},onZone(){},networkRole:'host',authoritativeAction:true,environment:new EnvironmentSimulation(createEnvironmentLayout('lava'))}) as World;
 let strikes=0,casts=0,damageEvents=0;const errors:unknown[]=[];
 const deliver=(m:any)=>{if(m.type==='healthResult'&&m.delta<0)damageEvents++;if(m.type==='enemies')w.applyEnemySnapshots(m.enemies);if(m.type==='enemyHealth')w.applyAuthoritativeEnemyHealth(m);};
 const authority=createCombatAuthority({store,peers,rooms,remember:(a:any)=>{peer.account=a;return a;},send:(_:unknown,m:any)=>deliver(m),broadcast:(_:unknown,m:any)=>deliver(m),onError:(e:unknown)=>errors.push(e)});
 t.after(async()=>{await authority.close();await store.close();});
 w.onDamage=(_,source,id)=>{if(id==='lava:worldboss:loop'){strikes++;authority.damage(peer,id,source);}};
 authority.spawnWorldBoss(room,{id:'lava:worldboss:loop',type:'dragon',x:48,z:-50});
 for(let i=0;i<240;i++){
   w.update(.025,true,false);if(i%6===0)authority.acceptSnapshots(room,w.enemySnapshots());
   casts=Math.max(casts,w.enemies.find(e=>e.id==='lava:worldboss:loop')?.skillCount??0);
   await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.equal(errors.length,0,String(errors));
 const boss=w.enemies.find(e=>e.id==='lava:worldboss:loop');
 assert.ok(boss,'spawn must reach the host');
 assert.ok(strikes>0,JSON.stringify({strikes,casts,phase:boss.phase,attackCount:boss.attackCount,x:boss.x,z:boss.z,cooldown:boss.cooldown}));
 assert.ok(damageEvents>0&&peer.account.profile.hp<initialHp,'the real server must commit player HP loss');
 assert.ok((authority.state(room).enemies.get(boss.id).nextCastAt??0)>0,'server must authorize the observed boss skill');
 assert.ok(casts>0,JSON.stringify({strikes,casts,x:boss.x,z:boss.z,px:w.position.x,pz:w.position.z,arena:w.arenaActive,phase:boss.phase,attackCount:boss.attackCount,skill:boss.skill,stun:boss.stun,cooldown:boss.cooldown,server:authority.state(room).enemies.get(boss.id).phase}));
});


