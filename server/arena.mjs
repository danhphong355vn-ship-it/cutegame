import {ARENA,inArena} from '../src/world-events.ts';
import * as Game from '../src/model.ts';

export function createArena({peers,send,broadcast,rooms,commit,onLeave=()=>{},immune=()=>false,now=Date.now}){
  const members=new Map();
  const eligible=peer=>peer&&peer.active&&!peer.visit&&peer.party==null&&inArena(peer.planet,peer.pose);
  function publish(room){if(room)broadcast(room,{type:'arena',players:[...members.values()].filter(m=>m.peer.room===room.id).map(m=>({id:m.peer.account.id,name:m.peer.account.profile.name,hp:m.hp,maxHp:m.maxHp,x:m.peer.pose.x,z:m.peer.pose.z,protectedUntil:m.protectedUntil,wins:m.peer.account.arenaStats?.wins||0,losses:m.peer.account.arenaStats?.losses||0}))});}
  let enabled = true, goldenHour = false;
  function leave(peer){if(members.delete(peer.account.id)){onLeave(peer);send(peer.socket,{type:'arenaLeft'});publish(rooms.get(peer.room));}}
  function join(peer){
    if(!enabled)throw Object.assign(new Error('Đấu trường PvP hiện đang tạm đóng cửa bởi Quản trị viên.'),{status:400});
    if(peer.planet!==ARENA.planet||peer.visit||peer.party||!peer.active||peer.account.profile.hp<=0)throw Object.assign(new Error('Hãy đến Đảo Núi Lửa ở thế giới công cộng để tham gia võ đài.'),{status:400});
    if(members.has(peer.account.id))return;
    const maxHp=Game.maxHp(peer.account.profile);
    peer.pose={...peer.pose,x:ARENA.spawnX,z:ARENA.spawnZ};
    members.set(peer.account.id,{peer,hp:maxHp,maxHp,protectedUntil:now()+3000,stunUntil:0,pending:false});
    send(peer.socket,{type:'arenaJoined',...ARENA,hp:maxHp,maxHp});publish(rooms.get(peer.room));
  }
  function targets(peer){const member=members.get(peer.account.id);if(!member||member.pending||member.protectedUntil>now()||!eligible(peer))return [];
    return [...members.values()].filter(m=>m.peer!==peer&&!m.pending&&m.protectedUntil<=now()&&eligible(m.peer)&&m.peer.room===peer.room).map(m=>({id:`arena:${m.peer.account.id}`,x:m.peer.pose.x,z:m.peer.pose.z,hp:m.hp,maxHp:m.maxHp,radius:.65,boss:false}));
  }
  function hit(peer,target,impact){
    const id=target.id.slice(6),victim=members.get(id);
    if(!canAct(peer)||!targets(peer).some(t=>t.id===target.id)||!victim||immune(victim.peer))return 0;
    const damage=Math.min(victim.hp,Math.max(1,Math.round(impact.amount*60/(Game.defense(victim.peer.account.profile)+60))));victim.hp-=damage;
    if(victim.hp>0&&impact.stun>0)control(peer,target,'stun',impact.stun);
    send(victim.peer.socket,{type:'arenaHit',damage,hp:victim.hp,maxHp:victim.maxHp});publish(rooms.get(peer.room));
    if(victim.hp<=0){victim.pending=true;const loser=victim.peer,winner=peer.account.id;
      commit(winner,'arenaWin',[id],records=>{const a=records.get(winner),b=records.get(id);a.arenaStats={wins:(a.arenaStats?.wins||0)+1,losses:a.arenaStats?.losses||0};b.arenaStats={wins:b.arenaStats?.wins||0,losses:(b.arenaStats?.losses||0)+1};return {winner,loser:id};}).then(()=>{
        if(members.get(id)!==victim)return;
        leave(loser);send(loser.socket,{type:'arenaResult',won:false,winner:peer.account.profile.name});send(peer.socket,{type:'arenaResult',won:true,loser:loser.account.profile.name});
      }).catch(()=>{victim.pending=false;victim.hp=victim.maxHp;victim.protectedUntil=now()+3000;publish(rooms.get(loser.room));send(peer.socket,{type:'error',message:'Không lưu được điểm võ đài. Trận đấu được khôi phục.'});});
    }
    return damage;
  }
  function tick(){for(const m of [...members.values()])if(peers.get(m.peer.account.id)!==m.peer||!eligible(m.peer))leave(m.peer);}
  function heal(peer,fraction){const m=members.get(peer.account.id);if(m&&!m.pending&&Number.isFinite(fraction)){m.hp=Math.min(m.maxHp,m.hp+Math.max(0,fraction)*m.maxHp);publish(rooms.get(peer.room));}}
  function canAct(peer){const m=members.get(peer.account.id);return !m||!m.pending&&now()>=m.stunUntil;}
  function control(peer,target,kind,duration){const victim=members.get(target.id.slice(6));if(!victim||!targets(peer).some(t=>t.id===target.id)||immune(victim.peer))return;
    if(['stun','fear','charm','sheep','taunt','blind'].includes(kind)){victim.stunUntil=Math.max(victim.stunUntil,now()+Math.min(2,Math.max(0,duration))*1000);send(victim.peer.socket,{type:'arenaControl',duration:Math.max(0,victim.stunUntil-now())});}
  }
  return {
    join,leave,targets,hit,tick,heal,control,canAct,has:peer=>members.has(peer.account.id),publish,
    get enabled(){ return enabled; },
    set enabled(v){ enabled = Boolean(v); },
    get goldenHour(){ return goldenHour; },
    set goldenHour(v){ goldenHour = Boolean(v); }
  };
}
