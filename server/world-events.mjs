import {WORLD_BOSSES,WORLD_BOSS_INTERVAL,WORLD_BOSS_DURATION} from '../src/world-events.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {PLANETS} from '../src/model.ts';

export function createWorldEvents({rooms,peers,combat,send,now=Date.now}){
  let nextAt=now()+WORLD_BOSS_INTERVAL,serial=0,active=null;
  const announce=event=>{for(const peer of peers.values())send(peer.socket,{type:'worldEvent',...event,nextAt});};
  function status(){return {active:active&&{...active},nextAt};}
  function summon(options=WORLD_BOSSES[serial%WORLD_BOSSES.length].type){
    if(active)throw Object.assign(new Error('Một boss thế giới đang hoạt động. Hãy hoàn thành sự kiện trước.'),{status:409});
    const type=typeof options==='object'?options.type:options;
    const baseConfig=WORLD_BOSSES.find(b=>b.type===type)||{type,planet:'lava',name:'Boss Thế Giới',x:36,z:36};
    const config={...baseConfig,...(typeof options==='object'?options:{})};
    if(!ENEMY_TYPES[config.type]?.boss||!Object.hasOwn(PLANETS,config.planet)||![config.x,config.z].every(Number.isFinite)||Math.hypot(config.x,config.z)>140||config.hp!==undefined&&(!Number.isFinite(Number(config.hp))||Number(config.hp)<=0||Number(config.hp)>2e9))throw Object.assign(new Error('Boss, hành tinh hoặc vị trí không hợp lệ.'),{status:400});
    config.name=String(config.name).slice(0,80);
    const key=`public:${config.planet}`;
    let room=rooms.get(key);
    if(!room){room={id:key,members:new Set(),host:null,enemies:[],environment:null,requests:new Map(),epoch:0,killed:new Set(),contributors:new Map(),lastSnapshot:0};rooms.set(key,room);}
    const id=`${config.planet}:worldboss:${now()}:${++serial}`;
    active={...config,id,expiresAt:now()+WORLD_BOSS_DURATION};room.worldEvent=true;
    combat.spawnWorldBoss(room,active);nextAt=now()+WORLD_BOSS_INTERVAL;
    const planetName=config.planet==='home'?'Đồng Cỏ Hồ Xanh':config.planet==='lava'?'Đảo Núi Lửa':config.planet==='ocean'?'Đảo Đại Dương':config.planet;
    announce({phase:'spawn',boss:active,message:`📢 Cảnh báo: ${config.name} vừa xuất hiện tại ${planetName}! Cùng đến (${config.x}, ${config.z}) đánh boss và nhận thưởng.`});
    return status();
  }
  function dismiss(){
    if(!active)return status();
    const room=rooms.get(`public:${active.planet}`);if(room){combat.dismissWorldBoss(room,active.id);room.worldEvent=false;}
    announce({phase:'dismissed',boss:active,message:`⚠️ Quản trị viên đã giải tán ${active.name}. Sự kiện đã kết thúc.`});
    active=null;
    return status();
  }
  function finish(id,ranking){
    if(active?.id!==id)return;
    const room=rooms.get(`public:${active.planet}`);if(room)room.worldEvent=false;
    announce({phase:'defeated',boss:active,ranking,message:`🏆 ${active.name} đã bị đánh bại! Phần thưởng của người tham gia đã chuyển vào rương tại nhà.`});active=null;
  }
  function tick(){
    if(active&&now()>=active.expiresAt){const room=rooms.get(`public:${active.planet}`);if(room){combat.dismissWorldBoss(room,active.id);room.worldEvent=false;}announce({phase:'expired',boss:active,message:`${active.name} đã rời hành tinh. Hẹn sự kiện tiếp theo!`});active=null;}
    if(!active&&now()>=nextAt)summon();
  }
  const timer=setInterval(tick,1000);timer.unref();
  return {summon,dismiss,finish,status,tick,close(){clearInterval(timer);}};
}
