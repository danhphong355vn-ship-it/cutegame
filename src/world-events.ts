export const WORLD_BOSS_INTERVAL=150*60*1000;
export const WORLD_BOSS_DURATION=30*60*1000;
export const WORLD_BOSSES=[
  {type:'dragon',planet:'lava',name:'Rồng Lửa',x:48,z:-50},
  {type:'mushking',planet:'home',name:'Vua Nấm Titan',x:36,z:36},
  {type:'titan_kraken',planet:'ocean',name:'Kraken Biển Sâu',x:36,z:36},
] as const;
export const ARENA={planet:'arena',x:0,z:0,radius:14,spawnX:0,spawnZ:0} as const;
export function inArena(planet:string,point:{x:number;z:number;y?:number}){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||(point.y??0)>=10)return false;
  if(planet===ARENA.planet)return Math.hypot(point.x-ARENA.x,point.z-ARENA.z)<=ARENA.radius;
  if(planet==='lava')return Math.hypot(point.x-0,point.z-(-48))<=14;
  return false;
}
