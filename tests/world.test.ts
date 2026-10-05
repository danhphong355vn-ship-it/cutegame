import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,HERO_SCALE} from '../src/world.ts';
import {RefinedAssetLibrary} from '../src/assets.ts';
import {attackRange} from '../src/combat.ts';
import {claimGift,newGame,plant,weaponStats} from '../src/model.ts';
import * as M from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout,zoneAt} from '../src/environments.ts';
import {lavaEvent} from '../src/lava-weather.ts';
import {beginTitanAttack,titanTelegraphs} from '../src/titan-patterns.ts';
import {FOREST_RAPTOR_COUNT} from '../src/enemy-types.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {t} from '../src/i18n.ts';

// Exercise actual world behavior with real Three objects; only WebGL is omitted.
function world() {
  return Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
}

test('home creatures spawn in their roster zone',()=>{
 const w=world();w.build('home');
 const roster=new Map(enemyRoster('home').map(e=>[e.id,e]));
 for(const e of w.enemies){
  assert.equal(zoneAt({x:e.homeX,z:e.homeZ}),roster.get(e.id)?.zone,e.id);
  assert.ok(Math.hypot(e.homeX,e.homeZ)>=22,e.id);
 }
});

test('world movement reaches a fractional goal beside a tree without corner cutting',()=>{
  const w=world();w.build('home');w.position.set(23.364043668843806,0,-23.966000208165497);
  const target=new T.Vector3(-25.25037911720574,0,43.94605067325756);
  w.walkTo(target.x,target.z);assert.ok(w.route.length>0);
  for(let i=0;i<3000&&w.route.length;i++){w.update(.025,true,false);assert.equal(w.blocked(w.position.x,w.position.z),false);}
  assert.equal(w.route.length,0);assert.ok(w.position.distanceTo(target)<.001);
});

test('clicking a stunned boss moves inside the same reach accepted by the attack',()=>{
  const w=world();w.spawnEnemy(3,0,1,'Boss',false,true);
  const enemy=w.enemies[0];enemy.stun=999;let attacks=0;
  w.onAttackEnemy=e=>{if(Math.hypot(e.x-w.position.x,e.z-w.position.z)<=attackRange(weaponStats(w.state),e.radius))attacks++;};
  w.select(enemy);assert.ok(w.route.length>0);assert.equal(attacks,0);
  for(let i=0;i<60&&!attacks;i++)w.update(.025,true,false);
  assert.ok(attacks>0);assert.ok(Math.hypot(enemy.x-w.position.x,enemy.z-w.position.z)<=attackRange(weaponStats(w.state),enemy.radius));
});

test('a blaster click attacks at range without first walking into melee distance',()=>{
  const w=world();w.state.gear.weapon='gun_bubble';w.spawnEnemy(6,0,1,'Sprout');let attacks=0;
  w.onAttackEnemy=()=>attacks++;w.select(w.enemies[0]);
  assert.equal(attacks,1);assert.equal(w.destination,null);assert.equal(w.route.length,0);assert.equal(w.position.x,0);
});

test('hidden or removed presents do not intercept a click on the ground',()=>{
  Object.assign(globalThis,{innerWidth:800,innerHeight:600});
  for(const removed of [false,true]){
    const w=world();w.position.set(0,0,4);
    const model=new T.Group();model.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial()));model.children[0].position.y=.5;
    const present=w.addEntity('gift','Present','',model,0,0,1);
    if(removed)w.entities=[];else present.mesh.visible=false;
    w.root.updateMatrixWorld(true);w.camera.position.set(0,8,0);w.camera.up.set(0,0,-1);w.camera.lookAt(0,0,0);w.camera.updateMatrixWorld(true);
    w.pointer(400,300);
    assert.equal(w.selected,null);assert.ok(w.destination);assert.ok(w.destination!.length()<.001);
  }
});

test('a target removed while walking is cleared before interaction',()=>{
  const w=world(),model=new T.Group();model.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()));
  const entity=w.addEntity('gift','Present','',model,5,0,1);let interactions=0;
  w.onInteract=()=>interactions++;w.select(entity);w.entities=[];w.update(.025,true,false);
  assert.equal(w.selected,null);assert.equal(w.destination,null);assert.equal(w.ring.visible,false);assert.equal(interactions,0);
});

test('refining a planted garden preserves the crop group and target wrapper, and instances the beds',async()=>{
  const w=world();w.makePlot(0);plant(w.state,0,'carrot',Date.now()-30000);w.syncCrops();
  const plot=w.entities.find(e=>e.kind==='plot'&&e.index===0)!,crops=w.plotMeshes[0],count=crops.children.length;
  const source=new T.Group();source.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()));
  const assets=new RefinedAssetLibrary(async()=>source);await assets.loadAll();w.applyRefinedAssets(assets);
  assert.equal(plot.mesh.userData.entity,plot);assert.equal(crops.parent,plot.mesh);assert.equal(crops.children.length,count);
  // No renderer here, so the 3D fallback draws ONE crop per bed (G2D-2), which never casts.
  assert.equal(count,1);crops.traverse(o=>assert.equal(o.castShadow,false));
  // The refined bed is drawn by the instanced bed meshes, not inside the entity (G2D-5).
  assert.equal(plot.mesh.getObjectByName('refined-garden'),undefined);
  const beds=w.scene.getObjectByName('garden-beds')!;assert.ok(beds.children.length>0);
  for(const m of beds.children as T.InstancedMesh[]){assert.ok(m instanceof T.InstancedMesh);assert.equal(m.count,w.state.plots.length);assert.equal(m.castShadow,false);assert.equal(m.receiveShadow,true);}
});

test('a tap ray through a bed still finds the plot entity through its invisible pick box',()=>{
  const w=world();w.build('home');const plot=w.entities.find(e=>e.kind==='plot')!;
  w.raycaster.set(new T.Vector3(plot.x,10,plot.z+.3),new T.Vector3(0,-1,0));
  assert.equal((w as unknown as {raycastEntity(m:T.Object3D[]):unknown}).raycastEntity([plot.mesh]),plot);
});

test('a full 24-bed garden keeps every bed off buildings, props, trees, the pond, the trails and other beds',()=>{
  const w=world();w.state.energy=1e7;while(M.expandGarden(w.state));assert.equal(w.state.plots.length,24);
  w.build('home');const beds=w.entities.filter(e=>e.kind==='plot');assert.equal(beds.length,24);
  const square=(b:{x:number;z:number},x:number,z:number)=>Math.hypot(Math.max(0,Math.abs(b.x-x)-M.BED_HALF),Math.max(0,Math.abs(b.z-z)-M.BED_HALF));
  for(const b of beds){
    for(const o of w.obstacles)assert.ok(square(b,o.x,o.z)>=o.r-1e-9,`bed ${b.index} at ${b.x},${b.z} overlaps obstacle ${o.x},${o.z}`);
    for(const e of w.entities)if(e.kind!=='plot'&&e.kind!=='enemy')assert.ok(square(b,e.x,e.z)>=Math.min(e.radius,3.6)-1e-9,`bed ${b.index} overlaps ${e.kind}`);
    for(const o of beds)if(o!==b)assert.ok(Math.max(Math.abs(o.x-b.x),Math.abs(o.z-b.z))>=M.BED_GAP);
    assert.ok(M.clearOfPen(b.x,b.z,M.BED_HALF),'beds keep off the animal pen and the path around it');
    // Every bed, the starting garden too since layout 3, keeps off the stepping-stone trails.
    assert.ok(Math.abs(b.x)>=M.BED_HALF+M.TRAIL_HALF&&Math.abs(b.z)>=M.BED_HALF+M.TRAIL_HALF,`bed ${b.index} stays off the stepping-stone trails`);
  }
  assert.equal(w.bedDraws>0,true);
});

test('toy gifts retain stable IDs and positions across a cooldown and rebuild',()=>{
  const w=world();w.state.planet='toy';w.build('toy');
  const positions=new Map(w.entities.filter(e=>e.kind==='gift').map(e=>[e.index,[e.x,e.z]]));
  const obstacles=w.obstacles.map(o=>({...o}));
  assert.ok(claimGift(w.state,2));w.build('toy');
  const gifts=w.entities.filter(e=>e.kind==='gift');assert.equal(gifts.length,26);
  assert.equal(gifts.find(e=>e.index===2)!.mesh.visible,false);
  gifts.forEach(e=>assert.deepEqual([e.x,e.z],positions.get(e.index)));
  assert.deepEqual(w.obstacles,obstacles);
  assert.deepEqual(w.entities.filter(e=>e.kind==='mine').map(e=>[e.id,e.index]),[['toy:mine:0',0],['toy:mine:1',1]]);
  w.state.worldRewards.giftReadyAt.toy![2]=Date.now()-1;w.update(.02,true,false);assert.equal(gifts.find(e=>e.index===2)!.mesh.visible,true);
});

test('creatures route around scenery without penetrating their radius',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(29,0,0);w.obstacles=[{x:25,z:0,r:1.2}];
  const enemy=w.spawnSpecies('wolf',21,0,0)!;let attacked=false;w.onDamage=()=>{attacked=true;};
  for(let frame=0;frame<700&&!attacked;frame++){w.update(.025,true,false);assert.ok(Math.hypot(enemy.x-25,enemy.z)>=1.2+enemy.radius-.001);}
  assert.ok(attacked,'wolf should eventually go around the rock and attack');
});

test('peers retain local movement while only hosts simulate creatures behind a modal',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));w.position.set(36,0,0);const enemy=w.spawnSpecies('gummy',30,0,0)!;
  w.setNetworkRole('peer');w.keys.add('ArrowDown');w.update(.1,true,false);assert.equal(enemy.x,30);assert.ok(w.position.z>0);
  w.setNetworkRole('host');const oldZ=w.position.z;w.update(.1,false,false);assert.ok(enemy.x>30);assert.equal(w.position.z,oldZ);
});

test('enemy and hazard snapshots preserve host migration combat state',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('shadow'));const e=w.spawnSpecies('spider',30,1,0)!;
  Object.assign(e,{phase:'windup',phaseTime:.3,stun:2,statuses:{slow:4},cooldown:.7});w.environment.time=40;w.environment.lightPillar(2);
  const copy=world();copy.environment=new EnvironmentSimulation(createEnvironmentLayout('shadow'));copy.applyEnemySnapshots(w.enemySnapshots());copy.applyEnvironmentSnapshot(w.environmentSnapshot());
  assert.equal(copy.enemies[0].phase,'windup');assert.equal(copy.enemies[0].phaseTime,.3);assert.equal(copy.enemies[0].statuses!.slow,4);assert.equal(copy.environment.time,40);assert.equal(copy.environment.lamps.get(2),190);
});

test('remote avatars are separate from obstacles and refresh equipment without duplicates',()=>{
  const w=world();w.addRemotePlayer('friend',{x:3,z:4,color:'#abcdff',gear:{weapon:'gun_bubble',pet:'pet_bunny'}});const first=w.remotePlayers.get('friend')!.mesh;
  w.updateRemotePlayer('friend',{x:5,z:6,gear:{weapon:'sword_lava',disguise:'dz_mecha'}});assert.notEqual(w.remotePlayers.get('friend')!.mesh,first);assert.equal(w.remoteRoot.children.length,1);assert.equal(w.obstacles.length,0);
  w.clearRemotePlayers();assert.equal(w.remotePlayers.size,0);assert.equal(w.remoteRoot.children.length,0);
});

test('late asset refresh rebuilds each remote avatar once and preserves its transformation',()=>{
 const w=world();w.addRemotePlayer('giant',{x:3,z:4,visual:{size:2,shield:true}});w.addRemotePlayer('stealth',{x:-3,z:5,visual:{stealth:true}});
 const previous=[...w.remotePlayers.values()].map(p=>p.mesh);let rebuilt=0;
 const add=w.addRemotePlayer.bind(w);w.addRemotePlayer=(id,pose)=>{assert.ok(++rebuilt<=2,'refresh must not revisit Map entries that it re-adds');add(id,pose);};
 w.refreshAvatars();assert.equal(rebuilt,2);assert.equal(w.remotePlayers.size,2);assert.equal(w.remoteRoot.children.length,2);
 assert.notEqual(w.remotePlayers.get('giant')!.mesh,previous[0]);assert.notEqual(w.remotePlayers.get('stealth')!.mesh,previous[1]);
 assert.equal(w.remotePlayers.get('giant')!.mesh.scale.x,HERO_SCALE*2);assert.equal(w.remotePlayers.get('giant')!.mesh.getObjectByName('status-shield')!.visible,true);
 assert.equal(w.remotePlayers.get('stealth')!.mesh.userData.statusOpacity,.25);
});

test('a farm animal tap carries only its own UID while the pen remains a separate interaction',t=>{
 const oldWidth=Object.getOwnPropertyDescriptor(globalThis,'innerWidth'),oldHeight=Object.getOwnPropertyDescriptor(globalThis,'innerHeight');
 Object.defineProperty(globalThis,'innerWidth',{value:800,configurable:true});Object.defineProperty(globalThis,'innerHeight',{value:600,configurable:true});
 t.after(()=>{if(oldWidth)Object.defineProperty(globalThis,'innerWidth',oldWidth);else Reflect.deleteProperty(globalThis,'innerWidth');if(oldHeight)Object.defineProperty(globalThis,'innerHeight',oldHeight);else Reflect.deleteProperty(globalThis,'innerHeight');});
 const w=world();w.state.level=20;w.state.energy=1000;w.state.farm.built=true;const animal=M.buyAnimal(w.state,'cow',Date.now()-600000)!;M.buyAnimal(w.state,'chicken',Date.now()-600000);w.build('home');
 w.farmView!.update(w.state.farm.animals,.1,1,Date.now());const at=w.farmView!.positionOf(animal.uid)!;
 w.camera.position.set(at.x,20,at.z+12);w.camera.lookAt(at.x,.6,at.z);w.camera.updateMatrixWorld(true);w.root.updateMatrixWorld(true);
 const pixel=new T.Vector3(at.x,.6,at.z).project(w.camera),picked=w.pickEntity((pixel.x+1)*400,(1-pixel.y)*300)!;
 assert.equal(picked.kind,'animal');assert.equal(picked.animalUid,animal.uid);assert.equal(picked.name,'Cow');
 let interaction:typeof picked|null=null;w.onInteract=e=>{interaction=e;};w.position.set(at.x,0,at.z);w.select(picked);assert.equal(interaction,picked);
 const pen=w.entities.find(e=>e.kind==='pen')!;w.position.set(pen.x,0,pen.z);w.select(pen);assert.equal(interaction,pen);w.farmView!.dispose();
});

test('home includes nine plots and exact regional creature populations within full bounds',()=>{
  const w=world();w.build('home');assert.equal(w.plotMeshes.length,9);assert.equal(w.enemies.length,151+FOREST_RAPTOR_COUNT);assert.equal(w.enemies.filter(e=>e.type==='forest_raptor').length,FOREST_RAPTOR_COUNT);assert.equal(w.enemies.filter(e=>e.boss).length,5);assert.equal(w.enemies.filter(e=>e.definition?.titan).length,1);
  assert.ok(w.enemies.some(e=>Math.hypot(e.x,e.z)>100));assert.equal(w.blocked(149,0),true);
  assert.deepEqual(w.entities.filter(e=>e.kind==='plot').slice(0,3).map(e=>[e.x,e.z]),[[-12.23,1.16],[-11,1.16],[-9.77,1.16]]);
});

test('follow-up damage cannot shorten an active crowd-control stun',()=>{
  const w=world();const enemy=w.spawnSpecies('mushroom',3,0,0)!;w.damageEnemy(enemy,1,3);w.damageEnemy(enemy,1,0);assert.equal(enemy.stun,3);
});

test('charmed ranged creatures shoot other enemies without hurting their explorer',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));w.position.set(2,0,0);const shooter=w.spawnSpecies('lollipop',0,0,0)!,target=w.spawnSpecies('jelly',5,0,1)!;
  target.stun=999;w.statusEnemy(shooter,'charm',10);let playerDamage=0;w.onDamage=()=>playerDamage++;
  for(let i=0;i<120&&target.hp===target.maxHp;i++)w.update(.025,true,false);
  assert.ok(target.hp<target.maxHp);assert.equal(playerDamage,0);
});

test('boss slam warns before damaging everyone inside its area beyond melee reach',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;let damage=0,remoteDamage=0;
  w.onDamage=n=>{damage+=n;};w.addRemotePlayer('friend',{x:34.4,z:0,hp:100});w.onRemoteDamage=()=>remoteDamage++;
  w.update(.025,true,false);assert.equal(e.skill,'slam');assert.equal(damage,0);assert.equal(e.telegraphs![0].r,4.8);
  w.position.x=34.4;for(let i=0;i<45;i++)w.update(.025,true,false);assert.equal(damage,e.damage*1.6);assert.equal(remoteDamage,1);
});

test('boss quake damages a distant ring only after its delayed outward pulse',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;e.skillCount=2;e.hp=e.maxHp*.2;let hits=0;
  w.onDamage=()=>hits++;w.update(.025,true,false);assert.equal(e.skill,'quake');w.position.x=38.3;
  for(let i=0;i<60;i++)w.update(.025,true,false);assert.equal(hits,0);
  for(let i=0;i<20;i++)w.update(.025,true,false);assert.equal(hits,1);
});

test('collected shared meteor rewards are authorized once and deduplicated in the save',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.weather.ores.push({id:'lava:meteor:one',kind:'meteor',x:35,z:2,y:0,expiresAt:90});
  const result=w.applyEnvironmentAction({kind:'collect-ore',id:'lava:meteor:one'});assert.ok(result.ok);assert.equal(w.applyEnvironmentAction({kind:'collect-ore',id:'lava:meteor:one'}).ok,false);
  assert.equal(w.grantEnvironmentReward('ack:one',result.rewards!),true);const inventory={...w.state.bag};assert.equal(w.grantEnvironmentReward('ack:one',result.rewards!),false);assert.deepEqual(w.state.bag,inventory);
});

test('magma slime splits into three dormant minions and uses stable entity IDs',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));const slime=w.spawnSpecies('magmaslime',30,30,0)!;
  for(let i=1;i<=3;i++){const minion=w.spawnSpecies('minislime',0,0,i)!;minion.hp=0;minion.respawn=999999;}
  w.damageEnemy(slime,slime.hp);assert.equal(w.enemies.filter(e=>e.type==='minislime'&&e.hp>0).length,3);assert.equal(new Set(w.enemies.map(e=>e.id)).size,4);
});

test('turtle shell armor and its recovery weakness do not modify environmental damage',()=>{
  const w=world(),enemy=w.spawnSpecies('magmaturtle',30,0,0)!;const hp=enemy.hp;
  w.damageEnemy(enemy,100);assert.equal(enemy.hp,hp-12);
  enemy.phase='recover';w.damageEnemy(enemy,10);assert.equal(enemy.hp,hp-32);
  w.damageEnemy(enemy,10,0,true);assert.equal(enemy.hp,hp-42);
});

test('received boss projectiles animate without peer damage and survive host migration',()=>{
  const host=world();host.planet='candy';host.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));host.position.set(32,0,0);
  const boss=host.spawnSpecies('cake',30,0,0)!;boss.attackCount=1;host.update(.01,true,false);assert.equal(boss.skill,'barrage');
  for(let i=0;i<37;i++)host.update(.025,true,false);const snapshots=host.enemySnapshots();assert.ok(snapshots[0].shots!.length>0);snapshots[0].shots=snapshots[0].shots!.slice(0,1);
  const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));peer.setNetworkRole('peer');peer.applyEnemySnapshots(snapshots);
  const shot=peer.enemySnapshots()[0].shots![0];peer.position.set(shot.x+shot.vx*.01,0,shot.z+shot.vz*.01);let hits=0;peer.onDamage=()=>hits++;
  peer.update(.01,true,false);assert.equal(hits,0);const moved=peer.enemySnapshots()[0].shots!.find(s=>s.id===shot.id)!;assert.ok(Math.hypot(moved.x-shot.x,moved.z-shot.z)>0);
  peer.setNetworkRole('host');peer.update(.001,true,false);assert.equal(hits,1);
  snapshots[0].shots=[];peer.applyEnemySnapshots(snapshots);assert.equal(peer.enemySnapshots()[0].shots!.length,0);
});

test('fire crystal and obsidian deposits require their own strike counts and persistent regrowth',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));
  for(const [kind,item,hits] of [['fire-crystal','fcrystal',2],['obsidian-ore','obsidian',4],['magma-ore','mcrystal',3]] as const){
    const entity=w.addEntity(kind,'Ore','',new T.Group(),20,0,1),before=w.state.bag[item]??0;
    for(let hit=1;hit<hits;hit++){assert.equal(w.interactEnvironment(entity)!.message,t('Mining {count}/{total} strikes.',{count:hit,total:hits}));assert.equal(w.state.bag[item]??0,before);}
    w.interactEnvironment(entity);const count=w.state.bag[item]-before;assert.ok(count>=(kind==='magma-ore'?2:1)&&count<=(kind==='magma-ore'?3:2));
    w.interactEnvironment(entity);assert.equal(w.state.bag[item]-before,count);assert.equal(entity.mesh.visible,false);
  }
});

test('chased creatures retain aggro beyond initial sight and return home with healing after the leash',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(38,0,0);const e=w.spawnSpecies('wolf',30,0,0)!;
  w.update(.02,true,false);assert.equal(e.phase,'chase');w.position.x=45;w.update(.02,true,false);assert.equal(e.phase,'chase');
  e.hp=e.maxHp*.5;e.x=61;w.position.x=70;w.update(.1,true,false);assert.equal(e.phase,'return');assert.ok(e.hp>e.maxHp*.5);assert.ok(e.x<61);
});

test('grounded enemies will not chase across lava but burrowing worms can cross',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.time=300;
  const pool=w.environment.layout.pools[0],e=w.spawnSpecies('magmacrab',pool.x-pool.r-1,pool.z-6,0)!;
  w.position.set(pool.x-10,0,pool.z-6);
  for(let i=0;i<30;i++)w.update(.025,true,false);assert.equal(w.environment.lavaAt(e),false);
  const worm=w.spawnSpecies('lavaworm',pool.x-pool.r-1,pool.z-6,1)!;worm.cooldown=999;
  for(let i=0;i<30;i++)w.update(.025,true,false);assert.equal(w.environment.lavaAt(worm),true);assert.equal(worm.hp,worm.maxHp);
});

test('planet landing pads are safe and pursuing creatures remain outside their boundary',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));const enemy=w.spawnSpecies('gummy',13,0,0)!;
  w.position.set(10,0,0);let hits=0;w.onDamage=()=>hits++;
  for(let i=0;i<100;i++)w.update(.025,true,false);assert.equal(hits,0);assert.ok(Math.hypot(enemy.x,enemy.z)>=12.5-.001);
});

test('dragon later-phase rain creates extra fire warnings that survive environment snapshots',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.time=300;const p=w.environment.layout.nest;w.position.set(p.x+2,0,p.z);
  const dragon=w.spawnSpecies('dragon',p.x,p.z,0)!;dragon.scaled=true;dragon.hp=dragon.maxHp*.6;dragon.attackCount=1;dragon.skillCount=1;w.update(.01,true,false);
  assert.equal(dragon.skill,'rain');assert.equal(dragon.bossStage,2);assert.equal(w.environment.fireRain.length,3);
  const peer=world();peer.planet='lava';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));peer.applyEnvironmentSnapshot(w.environmentSnapshot());assert.deepEqual(peer.environment.fireRain,w.environment.fireRain);assert.equal(peer.environment.nestLevel,w.environment.nestLevel);
});

test('bat-type creatures orbit at five metres, then wind up and dive through the target',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);const bat=w.spawnSpecies('firebat',45,0,0)!;bat.cooldown=10;
  for(let i=0;i<120;i++)w.update(.025,true,false);assert.ok(Math.abs(bat.z)>1);assert.ok(Math.abs(Math.hypot(bat.x-40,bat.z)-5)<.2);
  bat.cooldown=0;w.update(.025,true,false);assert.equal(bat.phase,'windup');let hits=0;w.onDamage=()=>hits++;const from={x:bat.x-40,z:bat.z};
  for(let i=0;i<70;i++)w.update(.025,true,false);assert.equal(hits,1);assert.ok(Math.hypot(bat.x-40,bat.z)>1);
  // The dive is not stopped at the explorer's body: the bat ends well past it, on the far side.
  const along=((bat.x-40)*from.x+bat.z*from.z)/Math.hypot(from.x,from.z);assert.ok(along<-3,`the bat ends ${along.toFixed(2)} m along its approach`);
});

test('a charging boar runs through the explorer and ends on the far side',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);const boar=w.spawnSpecies('boar',46,0,0)!;let hits=0;w.onDamage=()=>hits++;
  let from:{x:number;z:number}|null=null;for(let i=0;i<200&&!from;i++){w.update(.025,true,false);if(boar.phase==='charge')from={x:boar.x-40,z:boar.z};}
  assert.ok(from,'the boar charges');for(let i=0;i<40&&boar.phase==='charge';i++)w.update(.025,true,false);
  assert.equal(hits,1);const along=((boar.x-40)*from!.x+boar.z*from!.z)/Math.hypot(from!.x,from!.z);assert.ok(along<-2,`the boar ends ${along.toFixed(2)} m along its approach`);
});

test('creature separation untangles coincident enemies without moving rooted plants or crossing rocks',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);w.obstacles=[{x:28,z:0,r:1}];
  const wolves=[0,1,2].map(i=>w.spawnSpecies('wolf',26,0,i)!);const plant=w.spawnSpecies('chomper',25.6,0,3)!;const origin={x:plant.x,z:plant.z};
  for(const e of w.enemies)e.stun=999;for(let i=0;i<30;i++)w.update(.025,true,false);
  assert.deepEqual({x:plant.x,z:plant.z},origin);for(const e of wolves){assert.ok(Math.hypot(e.x-28,e.z)>=1+e.radius-.001);for(const other of w.enemies)if(other!==e)assert.ok(Math.hypot(e.x-other.x,e.z-other.z)>=e.radius+other.radius-.02);}
  w.setNetworkRole('peer');wolves[1].x=wolves[0].x;wolves[1].z=wolves[0].z;w.update(.1,true,false);assert.equal(wolves[1].x,wolves[0].x);assert.equal(wolves[1].z,wolves[0].z);
});

test('ending a dragon event dismisses the boss without defeat rewards',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));let cycle=0;while(lavaEvent(cycle*360).id!=='dragon')cycle++;
  const dragon=w.spawnSpecies('dragon',-96,58,0)!;dragon.hp=0;dragon.respawn=999999;let hazardHits=0;w.onHazardEnemy=()=>hazardHits++;
  w.environment.time=cycle*360+239.9;w.update(.01,true,false);assert.equal(dragon.hp,dragon.maxHp);w.update(.2,true,false);assert.equal(dragon.hp,0);assert.equal(hazardHits,0);assert.equal(dragon.mesh.visible,false);assert.ok(dragon.respawn>999000);
});

test('cloud lightning countdown and warnings survive peer snapshots and host migration',()=>{
  const host=world();host.planet='cloud';host.environment=new EnvironmentSimulation(createEnvironmentLayout('cloud'));host.position.set(0,0,0);host.update(6.1,true,false);assert.equal(host.environment.lightning.bolts.length,1);
  const peer=world();peer.planet='cloud';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('cloud'));peer.applyEnvironmentSnapshot(host.environmentSnapshot());assert.deepEqual(peer.environment.lightning,host.environment.lightning);
  peer.setNetworkRole('peer');peer.position.set(0,0,0);peer.update(.2,true,false);assert.ok(peer.environment.lightning.bolts[0].remaining<1.2);peer.setNetworkRole('host');peer.update(.2,true,false);assert.equal(peer.environment.lightning.sequence,1);
});

test('the camera follows the explorer at 9/s, looks straight at it, and the sun box sits under the camera target',()=>{
  const w=world();w.build('home');
  assert.deepEqual([(w.scene.fog as T.Fog).near,(w.scene.fog as T.Fog).far],[45,110]);
  w.position.set(10,0,0);w.cameraTarget.set(0,0,0);w.update(.1,true,false);
  assert.ok(Math.abs(w.cameraTarget.x-10*(1-Math.exp(-.9)))<1e-6);
  assert.ok(w.camera.position.clone().sub(w.cameraTarget).distanceTo(new T.Vector3(0,17,13.5))<1e-9);
  w.camera.updateMatrixWorld();const look=w.camera.getWorldDirection(new T.Vector3());
  assert.ok(look.distanceTo(new T.Vector3(0,-17,-13.5).normalize())<1e-6);
  const sun=(w as unknown as {sun:T.DirectionalLight}).sun;
  assert.ok(sun.target.position.distanceTo(new T.Vector3(w.cameraTarget.x,0,w.cameraTarget.z))<.05);
  w.build('shadow');assert.deepEqual([(w.scene.fog as T.Fog).near,(w.scene.fog as T.Fog).far],[14,55]);
});

test('explorers are drawn at the reference hero size, online ones too',()=>{
  const w=world();w.update(.025,true,false);assert.ok(Math.abs(w.player.scale.x-HERO_SCALE)<1e-9);
  w.addRemotePlayer('friend',{x:3,z:4});assert.equal(w.remotePlayers.get('friend')!.mesh.scale.x,HERO_SCALE);
});

test('a host message for another planet cannot leave undefeatable creatures on the minimap (wave 4 minimap bug)',()=>{
  // A late 'enemies' message from the home host lands after the explorer built the candy world.
  const home=world();home.planet='home';home.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));home.spawnSpecies('slime',10,0,0);home.spawnSpecies('gummy',12,0,1);
  const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));const own=peer.spawnSpecies('gummy',30,0,0)!;peer.setNetworkRole('peer');
  peer.applyEnemySnapshots(home.enemySnapshots());
  assert.deepEqual(peer.enemies.map(e=>e.id),['candy:enemy:0'],'no home creatures are spawned into the candy world');
  // The candy host's own reports still apply: a defeat hides the creature and its marker.
  peer.applyEnemySnapshots([{...peer.enemySnapshots()[0],hp:0,respawn:20}]);
  assert.equal(own.hp,0);assert.equal(own.dying,.3,'the defeated model briefly dissolves before hiding');
  assert.equal(peer.enemies.filter(e=>e.hp>0).length,0,'nothing alive is left for the minimap to draw');
});

test('the well by the storage chest is scenery only, like the reference: no entity, prompt or label',()=>{
  const w=world();w.build('home');
  let well:T.Object3D|undefined;w.root.traverse(o=>{if(o.userData.prop==='well')well=o;});
  assert.ok(well,'the well is built');assert.equal(well!.userData.entity,undefined);
  assert.ok(!w.entities.some(e=>Math.hypot(e.x-well!.position.x,e.z-well!.position.z)<1.5),'no interactive entity sits on the well');
});

test('Titan summon recalls living mobile creatures, stacks their attack and never creates or revives one',()=>{
 const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));w.time=10;
 const titan=w.spawnSpecies('titan_hydra',40,0,0)!,minion=w.spawnSpecies('minislime',44,0,1)!,dead=w.spawnSpecies('gummy',46,0,2)!,plant=w.spawnSpecies('chomper',45,0,3)!;
 const mobs=Array.from({length:5},(_,i)=>w.spawnSpecies('gummy',50+i,0,4+i)!);const base=mobs[0].damage;dead.hp=0;mobs.forEach(e=>e.hp=1);
 const positions=w.enemies.map(e=>({x:e.x,z:e.z})),ids=w.enemies.map(e=>e.id),cast=()=>{const source={x:titan.x,z:titan.z,radius:titan.radius,facing:0};titan.titanAttacks=[beginTitanAttack('summon',source,titanTelegraphs('summon',source,source),[])];(w as unknown as {updateTitanAttacks(e:typeof titan,dt:number):void}).updateTitanAttacks(titan,.05);};
 cast();cast();assert.deepEqual(w.enemies.map(e=>e.id),ids);for(const e of mobs.slice(0,4)){assert.equal(e.hp,e.maxHp);assert.ok(Math.abs(e.damage-base*1.3*1.3)<1e-9);assert.equal(e.lastHitAt,10);assert.equal(e.phase,'chase');}
 for(const e of [minion,dead,plant,mobs[4]])assert.deepEqual({x:e.x,z:e.z},positions[w.enemies.indexOf(e)]);
 assert.equal(dead.hp,0);assert.equal(mobs[4].hp,1);
 // The online world predicts the ring only. Its canonical summon comes from the server.
 w.authoritativeAction=()=>{};const before=mobs.map(e=>({x:e.x,z:e.z,hp:e.hp,damage:e.damage}));cast();assert.deepEqual(mobs.map(e=>({x:e.x,z:e.z,hp:e.hp,damage:e.damage})),before);
});

test('enemy snapshot migration preserves the remaining summon or hit chase grace across different clocks',()=>{
 const host=world();host.planet='candy';host.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));host.time=100;const e=host.spawnSpecies('gummy',80,0,0)!;e.lastHitAt=98;e.phase='chase';e.homeX=30;e.homeZ=0;
 const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));peer.time=12;peer.spawnSpecies('gummy',30,0,0);peer.applyEnemySnapshots(host.enemySnapshots());
 assert.equal(peer.enemySnapshots()[0].chaseGrace,2);assert.equal(peer.enemies[0].lastHitAt,10);peer.time=13;assert.equal(peer.enemySnapshots()[0].chaseGrace,1);
 peer.applyAuthoritativeEnemyHealth({...peer.enemySnapshots()[0],chaseGrace:4});assert.equal(peer.enemies[0].lastHitAt,13);
});

test('incremental remote pose updates retain transformations until an explicit visual update',()=>{
 const w=world();w.addRemotePlayer('friend',{x:3,z:4,y:2,facing:1,visual:{size:2,stealth:true,shield:true}});w.updateRemotePlayer('friend',{x:4,z:5});const remote=w.remotePlayers.get('friend')!;
 assert.equal(remote.mesh.scale.x,HERO_SCALE*2);assert.equal(remote.mesh.userData.statusOpacity,.25);assert.equal(remote.mesh.getObjectByName('status-shield')!.visible,true);assert.equal(remote.mesh.position.y,2);assert.equal(remote.mesh.rotation.y,1);
 w.updateRemotePlayer('friend',{x:4,z:5,visual:{size:1,stealth:false,shield:false}});assert.equal(remote.mesh.scale.x,HERO_SCALE);assert.equal(remote.mesh.userData.statusOpacity,1);assert.equal(remote.mesh.getObjectByName('status-shield')!.visible,false);
});

test('remote explorers move between network poses smoothly, but teleport across distant jumps',()=>{
 const w=world();w.addRemotePlayer('friend',{x:0,z:0,facing:0,moving:true});const remote=w.remotePlayers.get('friend')!;
 w.updateRemotePlayer('friend',{x:2,z:0,facing:Math.PI/2});
 assert.equal(remote.mesh.position.x,0,'a packet must not snap the visible avatar');
 (w as unknown as {animateRemotes(dt:number):void}).animateRemotes(.025);
 assert.ok(remote.mesh.position.x>0&&remote.mesh.position.x<2);
 assert.ok(remote.mesh.rotation.y>0&&remote.mesh.rotation.y<Math.PI/2);
 for(let i=0;i<20;i++)(w as unknown as {animateRemotes(dt:number):void}).animateRemotes(.025);
 assert.ok(Math.abs(remote.mesh.position.x-2)<.01);
 w.updateRemotePlayer('friend',{x:30,z:0});
 assert.equal(remote.mesh.position.x,30,'a teleport should not drift across the map');
});

test('remote interpolation has even frame steps, shortest turns and ignores duplicate roster refreshes',()=>{
 const w=world();w.addRemotePlayer('friend',{x:0,z:0,y:0,facing:Math.PI-.1});const m=w.remotePlayers.get('friend')!.mesh;
 const pose={x:1,z:0,y:1,facing:-Math.PI+.1};w.updateRemotePlayer('friend',pose);
 const animate=(dt:number)=>(w as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 for(let i=1;i<=4;i++){animate(.025);assert.ok(Math.abs(m.position.x-i*.25)<1e-8);assert.ok(Math.abs(m.position.y-i*.25)<1e-8);w.updateRemotePlayer('friend',pose);}
 assert.ok(Math.abs(m.rotation.y-(Math.PI+.1))<1e-8,'turn crosses pi along the short arc');
 animate(.5);assert.equal(m.position.x,1,'lost packets hold the last known position');
 w.updateRemotePlayer('friend',{x:2,z:0,y:40,planet:'home',space:'home:friend'});assert.equal(m.position.x,2);assert.equal(m.position.y,0);
 animate(.025);assert.equal(m.userData.speed,0,'entering a cottage does not generate a walking spike');
});

test('remote spin keeps rotating through pose packets and restores arms after finishing',()=>{
 const w=world();w.addRemotePlayer('friend',{x:0,z:0,facing:0});const m=w.remotePlayers.get('friend')!.mesh;
 w.playRemoteAction('friend','skill',0,{weapon:'sword'});
 const animate=(dt:number)=>(w as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 for(let i=1;i<=8;i++){animate(.05);w.updateRemotePlayer('friend',{x:i*.1,z:0,facing:0});}
 assert.ok(m.rotation.y>8,'movement heading must not pull the spin back');
 animate(2);animate(.01);assert.ok(Math.abs(m.getObjectByName('arm-left')!.rotation.z+.3)<1e-8);assert.ok(Math.abs(m.getObjectByName('arm-right')!.rotation.z-.3)<1e-8);
});

test('remote attacks use their weapon and skill poses, including across an avatar rebuild',()=>{
 const w=world();w.addRemotePlayer('friend',{x:0,z:0});
 const animate=(dt:number)=>(w as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 w.playRemoteAction('friend','basic',undefined,{weapon:'gun'});w.updateRemotePlayer('friend',{x:0,z:0,color:'#ff0000'});animate(.05);
 let m=w.remotePlayers.get('friend')!.mesh;assert.ok(m.getObjectByName('arm-right')!.rotation.x<-1);assert.ok(m.getObjectByName('arm-left')!.rotation.x<-1);
 w.playRemoteAction('friend','skill',1,{pose:'dash',weapon:'fist'});animate(.05);assert.equal(m.getObjectByName('arm-left')!.rotation.x,1.2);
 w.playRemoteAction('friend','skill',2,{pose:'slam',weapon:'fist'});animate(.21);assert.ok(Math.abs(m.getObjectByName('arm-left')!.rotation.x+2.9)<1e-8);
});

test('disguise skills use their own cast, hover and dash poses instead of default whirlwind',()=>{
 const local=world();local.build('home');local.refreshPlayer();local.playDisguiseAction('dz_vampire',0);
 assert.equal(local.spinT??0,0);
 (local as unknown as {animatePlayer(dt:number):void}).animatePlayer(.05);
 assert.ok(local.player.getObjectByName('arm-right')!.rotation.x<-1,'drain casts locally');
 const remote=world();remote.addRemotePlayer('friend',{x:0,z:0});
 const model=remote.remotePlayers.get('friend')!.mesh;
 remote.playRemoteAction('friend','skill',0,{special:'dz_vampire',weapon:'fist'});
 assert.equal(model.userData.spinT??0,0);
 (remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(.05);
 assert.ok(model.getObjectByName('arm-right')!.rotation.x<-1,'drain casts remotely');
 remote.playRemoteAction('friend','skill',1,{special:'dz_mage',weapon:'fist'});
 (remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(.05);
 assert.equal(model.getObjectByName('arm-left')!.rotation.x,1.2,'teleport uses a dash pose');
});

test('ground slam lifts the remote avatar, lands, and leaves the ground pose unchanged',()=>{
 const w=world();w.addRemotePlayer('friend',{x:0,z:0,y:0});const m=w.remotePlayers.get('friend')!.mesh;
 w.playRemoteAction('friend','skill',2,{pose:'slam',weapon:'fist'});
 const animate=(dt:number)=>(w as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 animate(.21);assert.ok(m.position.y>2);assert.equal(w.remotePlayers.get('friend')!.pose.y,0);
 w.updateRemotePlayer('friend',{x:1,z:0,y:0});animate(.1);assert.ok(m.position.y>0&&m.position.y<3,'a pose packet cannot add the jump height twice');
 animate(.12);assert.equal(m.position.y,0,'landing returns to the ground');
});

test('superhero W rises and lands on both local and remote avatars',()=>{
 const local=world();local.build('home');local.refreshPlayer();local.playDisguiseAction('dz_superhero',1);
 const animateLocal=(dt:number)=>(local as unknown as {animatePlayer(dt:number):void}).animatePlayer(dt);
 animateLocal(.08);assert.ok(local.player.position.y>local.position.y+.5);
 local.player.position.copy(local.position);animateLocal(.12);assert.ok(Math.abs(local.player.position.y-local.position.y)<.01);
 const remote=world();remote.addRemotePlayer('friend',{x:0,z:0,y:0});
 const model=remote.remotePlayers.get('friend')!.mesh;
 remote.playRemoteAction('friend','skill',1,{special:'dz_superhero'});
 const animateRemote=(dt:number)=>(remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 animateRemote(.08);assert.ok(model.position.y>.5);
 animateRemote(.12);assert.ok(Math.abs(model.position.y)<.01);
});

test('sustained flight keeps a flying stance instead of the walking cycle locally and remotely',()=>{
 const local=world();local.build('home');local.refreshPlayer();local.playerFlying=true;local.moving=true;local.disguiseT=local.punchT=local.spinT=0;
 (local as unknown as {animatePlayer(dt:number):void}).animatePlayer(.12);
 assert.ok(local.player.getObjectByName('arm-left')!.rotation.x<-1);
 assert.ok(Math.abs(local.player.rotation.x-Math.PI/6)<1e-8);
 assert.ok(Math.abs(local.player.getObjectByName('leg-left')!.rotation.x-.18)<1e-8);
 const remote=world();remote.addRemotePlayer('friend',{x:0,z:0,y:1.7,moving:true,visual:{flight:1.7}});
 const model=remote.remotePlayers.get('friend')!.mesh;
 (remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(.12);
 assert.ok(model.getObjectByName('arm-left')!.rotation.x<-1);
 assert.ok(Math.abs(model.rotation.x-Math.PI/6)<1e-8);
 assert.ok(Math.abs(model.getObjectByName('leg-left')!.rotation.x-.18)<1e-8);
 assert.ok(model.position.y>1.6&&model.position.y<1.8,'flight height is not added twice');
});

test('hovering in place keeps both avatars upright with relaxed arms',()=>{
 const local=world();local.build('home');local.refreshPlayer();local.playerFlying=true;local.moving=false;local.disguiseT=local.punchT=local.spinT=0;
 (local as unknown as {animatePlayer(dt:number):void}).animatePlayer(.12);
 assert.equal(local.player.rotation.x,0);assert.ok(local.player.getObjectByName('arm-left')!.rotation.x>-.5);
 const remote=world();remote.addRemotePlayer('friend',{x:0,z:0,y:1.7,moving:false,visual:{flight:1.7}});
 const model=remote.remotePlayers.get('friend')!.mesh;
 (remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(.12);
 assert.equal(model.rotation.x,0);assert.ok(model.getObjectByName('arm-left')!.rotation.x>-.5);
});

test('a dead enemy snapshot shows the death burst once even before the health packet',()=>{
 const w=world();w.build('home');const e=w.enemies.find(enemy=>enemy.hp>0)!;let bursts=0;
 w.defeatFeedback=()=>{bursts++;};
 const snapshot={id:e.id,x:e.x,z:e.z,hp:0,maxHp:e.maxHp,respawn:25};
 w.applyEnemySnapshots([snapshot]);assert.equal(bursts,1);assert.ok(e.mesh.visible);
 w.applyAuthoritativeEnemyHealth(snapshot);w.applyEnemySnapshots([snapshot]);assert.equal(bursts,1);
});

test('punch flurry animates six alternating strikes locally and on a remote avatar',()=>{
 const local=world();local.build('home');local.startPunchFlurry();
 const animateLocal=(dt:number)=>(local as unknown as {animatePlayer(dt:number):void}).animatePlayer(dt);
 const sides=[local.punchArm];for(let i=1;i<6;i++){animateLocal(.14);sides.push(local.punchArm);}
 assert.equal(local.flurryHits,6);for(let i=1;i<sides.length;i++)assert.notEqual(sides[i],sides[i-1]);
 const remote=world();remote.addRemotePlayer('friend',{x:0,z:0});remote.playRemoteAction('friend','skill',3,{special:'fist',weapon:'fist'});
 const model=remote.remotePlayers.get('friend')!.mesh,animate=(dt:number)=>(remote as unknown as {animateRemotes(dt:number):void}).animateRemotes(dt);
 const remoteSides=[model.userData.punchArm];for(let i=1;i<6;i++){animate(.14);remoteSides.push(model.userData.punchArm);}
 assert.equal(model.userData.flurryHits,6);for(let i=1;i<remoteSides.length;i++)assert.notEqual(remoteSides[i],remoteSides[i-1]);
});

test('monsters do not target or damage players while dueling', () => {
  const w = world();
  w.build('home');
  w.position.set(30, 0, 30);
  w.addRemotePlayer('friend', { x: 32, z: 32, hp: 100 });
  const enemy = w.enemies[0];
  enemy.x = 29; enemy.z = 29;

  // Normal: targets local player (closer than friend)
  const targetNormal = (w as any).enemyTarget(enemy);
  assert.ok(targetNormal);

  // Local player is dueling: monster targets remote friend instead
  w.arenaActive = true;
  const targetWhileLocalDueling = (w as any).enemyTarget(enemy);
  assert.equal(targetWhileLocalDueling?.id, 'friend');

  // Both players are dueling: monster ignores both
  w.isPlayerDueled = id => id === 'friend';
  const targetWhileBothDueling = (w as any).enemyTarget(enemy);
  assert.equal(targetWhileBothDueling, undefined);

  // Duel ends: monsters resume targeting normally
  w.arenaActive = false;
  w.isPlayerDueled = () => false;
  const targetAfterDuel = (w as any).enemyTarget(enemy);
  assert.ok(targetAfterDuel);
});
