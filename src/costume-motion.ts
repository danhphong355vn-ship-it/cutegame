import * as T from 'three';
import { part } from './part-cache.ts';
import { requestSkillArt, skillArt } from './skill-art.ts';

export type CostumeMotion = 'cast'|'dash'|'slam'|'strike'|'hover'|'gaze'|'throw'|'bless'|'dive'|'charm'|'roots';
export const motionDuration = (motion: CostumeMotion) => motion==='gaze'?1.2:motion==='throw'?1:motion==='dive'?.42:motion==='slam'?.8:motion==='dash'?.35:.7;
interface Limbs { armL?: T.Object3D|null; armR?: T.Object3D|null; legL?: T.Object3D|null; legR?: T.Object3D|null; head?: T.Object3D|null }
const smooth = (x:number) => { const t=Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };

/** Identical local/remote poses, with anticipation, release and a soft recovery. */
export function poseCostume(l:Limbs,motion:CostumeMotion,remaining:number) {
  const t=1-Math.max(0,remaining)/motionDuration(motion), envelope=Math.sin(Math.PI*Math.max(0,Math.min(1,t)));
  let lean=0,lift=0;
  if(motion==='throw') {
    const release=smooth((t-.55)/.22), recover=smooth((t-.82)/.18);
    const arms=(-2.7+release*1.65)*(1-recover*.8);
    l.armL?.rotation.set(arms,0,-.24);l.armR?.rotation.set(arms-.2*release,0,.24);
    l.legL?.rotation.set(-.18*envelope,0,0);l.legR?.rotation.set(.22*envelope,0,0);
    lean=(-.25+release*.65)*(1-recover); 
  } else if(motion==='dive') {
    const air=t<.43, landing=smooth((t-.43)/.57);
    l.armL?.rotation.set(air?-2.5:-1.3*(1-landing),0,-.2);l.armR?.rotation.set(air?-2.5:-1.3*(1-landing),0,.2);
    l.legL?.rotation.set(air?-.45:.65*(1-landing),0,0);l.legR?.rotation.set(air?-.45:.65*(1-landing),0,0);
    lift=air?Math.sin(t/.43*Math.PI)*1.9:0;lean=air?-.18:.55*(1-landing);
  } else if(motion==='bless') {
    l.armL?.rotation.set(-.35-1.25*envelope,0,-.3-.65*envelope);l.armR?.rotation.set(-.35-1.25*envelope,0,.3+.65*envelope);
    lean=-.1*envelope;lift=.08*envelope;
  } else if(motion==='charm') {
    l.armR?.rotation.set(-.35-1.5*envelope,0,.15);l.armL?.rotation.set(-.5-.4*envelope,0,-.55);
    l.head?.rotation.set(0,.15*envelope,-.12*envelope);lean=.12*envelope;
  } else if(motion==='roots') {
    const rise=smooth(t/.35),release=smooth((t-.35)/.35);
    const arms=-.3-2.2*rise+1.65*release;
    l.armL?.rotation.set(arms,0,-.35);l.armR?.rotation.set(arms,0,.35);lean=-.18*envelope;
  } else if(motion==='gaze') {
    l.armL?.rotation.set(-.35,0,-.2);l.armR?.rotation.set(-.35,0,.2);lean=-.1*envelope;
  }
  return {lean,lift};
}

export function poseFlight(l:Limbs,fairy:boolean,moving:boolean,time:number) {
  const tilt=fairy?.14:50*Math.PI/180;
  l.legL?.rotation.set(moving?.18:.12,0,-.1);l.legR?.rotation.set(moving?.22:.12,0,.1);
  l.armL?.rotation.set(moving?(fairy?-.6:-1.65):-.22,0,fairy?-.6:-.26);
  l.armR?.rotation.set(moving?(fairy?-.6:-1.65):-.22,0,fairy?.6:.26);
  return {lean:moving?tilt:0,lift:Math.sin(time*(fairy?3.4:4))*.07};
}

/** Keep both solidified cloth surfaces on one hinge, outside the thick ink hull. */
export function prepareCostume(model:T.Object3D) {
  if(model.getObjectByName('cape-hinge'))return;
  const cloth:T.Mesh[]=[];
  model.traverse(o=>{if(o instanceof T.Mesh&&o.name.includes('cape'))cloth.push(o);});
  const parent=cloth[0]?.parent;if(!parent)return;
  model.updateMatrixWorld(true);
  const bounds=new T.Box3();for(const mesh of cloth)bounds.expandByObject(mesh);
  const shoulder=bounds.getCenter(new T.Vector3());shoulder.y=bounds.max.y;
  const hinge=new T.Group();hinge.name='cape-hinge';hinge.position.copy(parent.worldToLocal(shoulder));parent.add(hinge);
  for(const mesh of cloth){mesh.userData.noOutline=true;mesh.castShadow=false;mesh.receiveShadow=false;hinge.attach(mesh);}
}

const flights=new WeakMap<T.Object3D,{move:number;air:number}>();
/** Exponential blends are independent of frame rate and shared by local/remote avatars. */
export function smoothFlight(model:T.Object3D,l:Limbs,fairy:boolean,flying:boolean,moving:boolean,time:number,dt:number,active=true) {
  let state=flights.get(model);if(!state){state={move:0,air:0};flights.set(model,state);}
  const k=1-Math.exp(-Math.max(0,dt)*9);
  state.move+=(Number(flying&&moving)-state.move)*k;state.air+=(Number(flying)-state.air)*k;
  if(!active)return {lean:0,lift:0,air:state.air,weight:0};
  const target=limbTargets(fairy,state.move);
  for(const key of ['armL','armR','legL','legR'] as const){const limb=l[key];if(limb){const blend=flying?1:state.air;limb.rotation.x+=(target[key][0]-limb.rotation.x)*blend;limb.rotation.z+=(target[key][1]-limb.rotation.z)*blend;}}
  return {lean:state.move*(fairy?.14:50*Math.PI/180),lift:Math.sin(time*(fairy?3.4:4))*.07*state.air,air:state.air,weight:state.air};
}
function limbTargets(fairy:boolean,m:number){return {armL:[-.22+m*((fairy?-.6:-1.65)+.22),fairy?-.6:-.26],armR:[-.22+m*((fairy?-.6:-1.65)+.22),fairy?.6:.26],legL:[.12+m*.06,-.1],legR:[.12+m*.1,.1]};}

/** Accessory animation is cached per avatar; shared GLB geometry is never modified. */
const accessories=new WeakMap<T.Object3D,{cape?:T.Object3D; oldWings:T.Object3D[]; wings:T.Group[]}>();
export function animateCostume(model:T.Object3D,id:string|undefined,flying:boolean,moving:boolean,time:number) {
  if(id!=='dz_fairy'&&id!=='dz_superhero')return;
  requestSkillArt();
  let entry=accessories.get(model);
  if(!entry){prepareCostume(model);entry={cape:model.getObjectByName('cape-hinge'),oldWings:[],wings:[]};model.traverse(o=>{if(o.name.includes('wings'))entry!.oldWings.push(o);});accessories.set(model,entry);}
  if(id==='dz_superhero'&&entry.cape){entry.cape.rotation.x=Math.sin(time*4)*.045+(flights.get(model)?.air??Number(flying))*.16;}
  if(id==='dz_fairy'){
    if(!entry.wings.length&&skillArt.ready){const body=part(model,'body')??model;
      for(const side of [-1,1]){const wing=skillArt.instance('skill_wing');if(!wing)continue;wing.name=`fairy-flight-wing-${side}`;wing.position.set(side*.08,.25,-.38);wing.scale.x=side;body.add(wing);entry.wings.push(wing);}
      if(entry.wings.length===2)for(const old of entry.oldWings)old.visible=false;
    }
    for(let i=0;i<entry.wings.length;i++){const side=i===0?-1:1;entry.wings[i].rotation.y=side*(.22+Math.sin(time*(flying?12:5))*(flying?.45:.12));}
  }
}
