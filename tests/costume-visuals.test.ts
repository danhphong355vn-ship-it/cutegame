import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KitLibrary} from '../src/assets.ts';
import {skillArt,mountainArt} from '../src/skill-art.ts';
import {poseCostume,poseFlight,animateCostume,motionDuration} from '../src/costume-motion.ts';
import {CostumeFx} from '../src/costume-fx.ts';

async function load(){const b=await readFile(new URL('../public/assets/models/skill-art.glb',import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}
const limbs=()=>({armL:new T.Group(),armR:new T.Group(),legL:new T.Group(),legR:new T.Group(),head:new T.Group()});

test('Blender skill props load through the runtime kit, with bounded geometry and safe projectile disposal',async()=>{
  const scene=await load(),kit=new KitLibrary(['test'],async()=>scene);await kit.load();
  for(const id of ['skill_mountain','skill_flower','skill_roots','skill_tree','skill_wing']){
    const model=kit.instance(id);assert.ok(model,id);const box=new T.Box3().setFromObject(model);assert.ok(box.getSize(new T.Vector3()).length()<5,id);
  }
  // Ingest real GLB into the global kit using its public loader contract.
  const original=(skillArt as unknown as {loadScene:unknown}).loadScene;
  (skillArt as unknown as {loadScene:unknown}).loadScene=async()=>scene;
  try{await skillArt.load();}finally{(skillArt as unknown as {loadScene:unknown}).loadScene=original;}
  const a=mountainArt(1),b=mountainArt(1);assert.ok(a&&b);assert.equal(a.name,'blender-skill-mountain');assert.notEqual(a.geometry,b.geometry);assert.notEqual(a.material,b.material);
  a.geometry.dispose();(a.material as T.Material).dispose();assert.ok(b.geometry.getAttribute('position').count>0);
});

test('all upgraded actions produce matching local and remote poses throughout release and recovery',()=>{
  for(const motion of ['dive','throw','bless','gaze','charm','roots'] as const)for(const fraction of [.01,.25,.6,.9]){
    const a=limbs(),b=limbs(),remaining=motionDuration(motion)*(1-fraction);
    assert.deepEqual(poseCostume(a,motion,remaining),poseCostume(b,motion,remaining));
    for(const key of Object.keys(a) as (keyof typeof a)[])assert.deepEqual(a[key].rotation.toArray(),b[key].rotation.toArray());
  }
  const heal=limbs(),charm=limbs(),roots=limbs();poseCostume(heal,'bless',.35);poseCostume(charm,'charm',.35);poseCostume(roots,'roots',.35);
  assert.notEqual(heal.armR.rotation.z,charm.armR.rotation.z);assert.notEqual(roots.armR.rotation.x,charm.armR.rotation.x);
});

test('hero hover is upright, moving flight tilts 30 degrees, and fairy flight has its own relaxed pose',()=>{
  const hero=limbs();assert.equal(poseFlight(hero,false,false,1).lean,0);assert.equal(poseFlight(hero,false,true,1).lean,Math.PI/6);assert.ok(hero.armL.rotation.x<-1.5);
  const fairy=limbs();assert.ok(poseFlight(fairy,true,true,1).lean<.2);assert.ok(fairy.armL.rotation.z<-.5);
});

test('fairy wings flap independently without changing the shared model',()=>{
  const model=new T.Group(),body=new T.Group();body.name='body';model.add(body);
  animateCostume(model,'dz_fairy',true,true,0);const wing=model.getObjectByName('fairy-flight-wing--1');assert.ok(wing);
  const before=wing.rotation.y;animateCostume(model,'dz_fairy',true,true,.1);assert.notEqual(wing.rotation.y,before);
});

test('repeated healing/root pulses keep props capped, expire, recycle and clear on world changes',()=>{
  const scene=new T.Scene(),fx=new CostumeFx(scene,()=>null,()=>2);
  for(let i=0;i<100;i++)fx.effect({kind:'ring',x:0,z:0,radius:4,color:'#fff',look:'flower'},null);
  assert.equal(fx.root.children.length,5);assert.ok(fx.root.children.every(p=>p.position.y===2));
  fx.update(2);assert.equal(fx.root.children.length,0);
  fx.effect({kind:'ring',x:0,z:0,radius:6,color:'#fff',look:'roots'},null);assert.equal(fx.root.children.length,6);
  fx.clear();assert.equal(fx.root.children.length,0);
});

test('remote mountain leaves its holder after windup, travels visually and disappears on a confirmed impact',()=>{
  const scene=new T.Scene(),local=new T.Group(),remote=new T.Group();remote.position.set(3,0,4);scene.add(local,remote);
  const fx=new CostumeFx(scene,()=>remote,()=>0,()=>local);
  fx.effect({kind:'cast',x:3,z:4,radius:2,color:'#fff',look:'hero',facing:0},null);
  fx.update(.4);assert.equal(fx.root.children.length,1);const model=fx.root.children[0];assert.equal(model.position.x,3);
  fx.update(.5);assert.ok(model.position.z>5);assert.ok(model.rotation.x>0);
  fx.effect({kind:'impact',x:model.position.x,z:model.position.z,radius:4,color:'#fff',look:'mountain' as never},null);fx.update(.01);assert.equal(fx.root.children.length,0);
});
