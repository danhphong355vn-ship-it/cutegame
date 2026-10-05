import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareCostume,animateCostume,smoothFlight} from '../src/costume-motion.ts';
import {addOutlines} from '../src/outline.ts';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

test('the installed superhero GLB keeps both red cape materials together',async()=>{
  const b=await readFile(new URL('../public/assets/models/disguises.glb',import.meta.url));
  const scene=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;
  const model=scene.getObjectByName('dz_superhero')!;assert.ok(model);
  prepareCostume(model);const hinge=model.getObjectByName('cape-hinge')!;assert.ok(hinge);
  const cloth=hinge.children as T.Mesh[];assert.equal(cloth.length,2);
  assert.deepEqual(cloth.map(m=>(m.material as T.MeshStandardMaterial).color.getHexString()).sort(),['b51e36','f0303a']);
  addOutlines(model,{merge:true});assert.ok(cloth.every(m=>m.userData.noOutline&&m.children.length===0));
});

test('both red cape surfaces share motion and cannot enter the ink hull',()=>{
  const avatar=new T.Group(),body=new T.Group();avatar.add(body);
  const cloth=[1,2].map(i=>{const mesh=new T.Mesh(new T.BoxGeometry(.5,.9,.012),new T.MeshToonMaterial({color:i===1?'#f0303a':'#b51e36'}));mesh.name=`cape_${i}`;mesh.position.set(0,.2,-.3);body.add(mesh);return mesh;});
  const before=cloth.map(m=>m.getWorldPosition(new T.Vector3()).clone());
  prepareCostume(avatar);const hinge=avatar.getObjectByName('cape-hinge')!;
  assert.equal(hinge.children.length,2);assert.equal(addOutlines(avatar,{merge:true}).length,0);
  cloth.forEach((m,i)=>assert.ok(m.getWorldPosition(new T.Vector3()).distanceTo(before[i])<1e-8));
  animateCostume(avatar,'dz_superhero',true,true,1);
  assert.ok(hinge.rotation.x>0);assert.equal(cloth[0].rotation.x,cloth[1].rotation.x);
  assert.equal((cloth[0].material as T.MeshToonMaterial).color.getHexString(),'f0303a');
});
test('flight transitions remain bounded, recover upright and match frame rates',()=>{
  function run(step:number){const model=new T.Group(),l={armL:new T.Group(),armR:new T.Group(),legL:new T.Group(),legR:new T.Group()};let pose={lean:0,lift:0};
    for(let i=0;i<Math.round(1/step);i++)pose=smoothFlight(model,l,false,true,true,i*step,step);
    assert.ok(Math.abs(pose.lean-50*Math.PI/180)<.001);
    const moving=pose.lean;pose=smoothFlight(model,l,false,true,false,1,step);assert.ok(pose.lean>0&&pose.lean<moving);
    for(let i=0;i<Math.round(1/step);i++)pose=smoothFlight(model,l,false,true,false,1+i*step,step);
    assert.ok(pose.lean<.001);return moving;
  }
  assert.ok(Math.abs(run(1/30)-run(1/120))<1e-8);
});
