import * as T from 'three';
import type { CombatEffect } from './combat.ts';
import type { Effects } from './fx.ts';
import { requestSkillArt, skillArt } from './skill-art.ts';
import { bakeModel } from './assets.ts';

interface Prop { model:T.Group; kind:string; age:number; life:number; scale:number; holder?:T.Object3D; flight?:number; launched?:boolean }
/** Capped, reused GLB props; particles use the existing instanced quality-scaled pools. */
export class CostumeFx {
  readonly root=new T.Group();
  private props:Prop[]=[];
  private free=new Map<string,T.Group[]>();
  private time=0;
  private nextTrail=0;
  private budget=24;
  private scene:T.Scene;
  private explorerAt:(x:number,z:number)=>T.Object3D|null;
  private ground:(x:number,z:number)=>number;
  private localModel?:()=>T.Object3D;
  constructor(scene:T.Scene,explorerAt:(x:number,z:number)=>T.Object3D|null,ground:(x:number,z:number)=>number,localModel?:()=>T.Object3D){this.scene=scene;this.explorerAt=explorerAt;this.ground=ground;this.localModel=localModel;this.root.name='costume-fx';scene.add(this.root);}
  private prop(kind:string,x:number,z:number,scale:number,life:number,y=0,holder?:T.Object3D){
    if(this.props.length>=this.budget)return;
    const spare=this.free.get(kind)?.pop(),model=spare??skillArt.instance(kind);if(!model)return;if(!spare)bakeModel(model);
    model.position.set(x,this.ground(x,z)+y,z);model.rotation.set(0,(x+z)*1.7,0);model.visible=true;this.root.add(model);
    const prop={model,kind,age:0,life,scale,holder};this.props.push(prop);return prop as Prop;
  }
  effect(e:CombatEffect,fx:Effects|null|undefined){
    if(!['flower','roots','hero','heroDive','mountain'].includes(e.look??''))return false;
    this.budget=Math.max(8,Math.round(24*(fx?.density??1)));
    requestSkillArt();
    const y=this.ground(e.x,e.z),at={x:e.x,y,z:e.z},r=Math.max(.4,e.radius);
    if(e.look==='flower'){
      const charm=r<=1.1,hover=r>1.1&&r<3;
      fx?.ring(at,{color:charm?'#ff86c2':'#ffc5e5',from:.3,to:r,life:.65,y:y+.08,thick:.12});
      fx?.burst(at,{n:hover?5:10,color:['#ff82bb','#ffd668','#bbedff'],glow:true,size:.14,speed:hover?1.5:3,up:2,y:.5,life:.8,gravity:2});
      // Healing pulses refresh existing blooms instead of accumulating objects every half-second.
      if(!hover&&!this.props.some(p=>p.kind==='skill_flower'&&Math.hypot(p.model.position.x-e.x,p.model.position.z-e.z)<r+1)){
        for(let i=0;i<(charm?3:5);i++){const a=i*Math.PI*2/(charm?3:5);this.prop('skill_flower',e.x+Math.sin(a)*r*.6,e.z+Math.cos(a)*r*.6,charm?.9:1.3,charm?1.2:1.8);}
      }
      if(!charm&&!hover){const player=this.explorerAt(e.x,e.z);if(player&&Math.hypot(player.position.x-e.x,player.position.z-e.z)<r){const dest=new T.Vector3();fx?.orbs(at,3,['#ffb9dc','#ffd668'],()=>{player.getWorldPosition(dest);dest.y+=1;return dest;},undefined,.22);}}
      return true;
    }
    if(e.look==='roots'){
      fx?.ring(at,{color:'#8fda75',from:r*.7,to:r,life:.55,y:y+.06,thick:.12});
      fx?.burst(at,{n:7,color:['#55b965','#aceb7b','#ffd668'],size:.15,speed:3,up:3,y:.15,life:.65});
      if(!this.props.some(p=>p.kind==='skill_roots'&&Math.hypot(p.model.position.x-e.x,p.model.position.z-e.z)<r+1)){this.prop('skill_tree',e.x,e.z,1.15,1.4);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;this.prop('skill_roots',e.x+Math.sin(a)*r*.65,e.z+Math.cos(a)*r*.65,1.2,1.4);}}
      return true;
    }
    if(e.look==='hero'&&e.kind==='cast'&&r>=1.8){const holder=this.explorerAt(e.x,e.z)??undefined,remote=holder&&this.localModel&&holder!==this.localModel();const prop=this.prop('skill_mountain',e.x,e.z,.8,remote?.8+14/19:.8,2.2,holder);if(prop&&remote)prop.flight=e.facing??0;}
    if(e.look==='heroDive'||e.look==='mountain'){
      if((e.look as string)==='mountain')for(const p of this.props)if(p.flight!==undefined&&Math.hypot(p.model.position.x-e.x,p.model.position.z-e.z)<r+2)p.life=p.age;
      fx?.ring(at,{color:e.look==='heroDive'?'#89d9ff':'#e9ddc6',from:.3,to:r,life:.5,y:y+.1,thick:.2});
      fx?.flash({x:e.x,y:y+.6,z:e.z},'#fff1cc',Math.min(3,r),.14);
      fx?.burst(at,{n:16,color:['#81798d','#c5bbce','#e9ddc6'],size:.22,speed:6,up:4,y:.2,life:.65});
      fx?.burst(at,{n:12,color:['#ffd668','#89d9ff','#ff82bb'],glow:true,size:.14,speed:6,up:3,y:.3,life:.55});return true;
    }
    return false;
  }
  update(dt:number,fx?:Effects|null,flyers:readonly {model:T.Object3D;fairy:boolean;moving:boolean}[]|(()=>readonly {model:T.Object3D;fairy:boolean;moving:boolean}[])=[]){
    if(this.root.parent!==this.scene)this.scene.add(this.root);
    this.time+=dt;
    if(this.time>=this.nextTrail){this.nextTrail=this.time+.14;for(const flyer of (typeof flyers==='function'?flyers():flyers).slice(0,Math.max(2,Math.round(8*(fx?.density??1)))))if(flyer.moving)fx?.burst(flyer.model.position,{n:2,color:flyer.fairy?['#ff82bb','#ffd668']:['#89d9ff','#fff1cc'],glow:true,size:.1,speed:.5,up:.5,y:.6,life:.45,gravity:0});}
    for(let i=this.props.length-1;i>=0;i--){const p=this.props[i];p.age+=dt;
      if(p.holder&&p.age<.8){p.holder.updateWorldMatrix(true,false);p.model.position.set(0,2.4,.25).applyMatrix4(p.holder.matrixWorld);}
      if(p.flight!==undefined&&p.age>=.8){
        if(!p.launched){const holder=p.holder;p.model.position.set((holder?.position.x??p.model.position.x)+Math.sin(p.flight)*.6,0,(holder?.position.z??p.model.position.z)+Math.cos(p.flight)*.6);p.launched=true;}
        const travel=Math.min(dt,p.age-.8)*19;p.model.position.x+=Math.sin(p.flight)*travel;p.model.position.z+=Math.cos(p.flight)*travel;p.model.position.y=this.ground(p.model.position.x,p.model.position.z)+.35;
        p.model.rotation.x+=dt*4;p.model.rotation.y+=dt*5;p.model.rotation.z+=dt*6;
      }
      const grow=Math.min(1,p.age/.18),fade=Math.min(1,Math.max(0,(p.life-p.age)/.25));p.model.scale.setScalar(p.scale*grow*fade);
      if(p.kind==='skill_flower')p.model.rotation.z=Math.sin(this.time*3+p.model.position.x)*.08;
      if(p.age>=p.life){p.model.removeFromParent();const list=this.free.get(p.kind)??[];list.push(p.model);this.free.set(p.kind,list);this.props.splice(i,1);}
    }
  }
  clear(){for(const p of this.props){p.model.removeFromParent();const list=this.free.get(p.kind)??[];list.push(p.model);this.free.set(p.kind,list);}this.props=[];}
}
