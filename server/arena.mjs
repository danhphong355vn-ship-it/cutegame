import {ARENA,inArena} from '../src/world-events.ts';
import * as Game from '../src/model.ts';

export function createArena({peers,send,broadcast,rooms,commit,onLeave=()=>{},immune=()=>false,now=Date.now}){
  const members=new Map();
  const activeDuels=new Map();
  const eligible=peer=>peer&&peer.active&&!peer.visit&&peer.party==null&&inArena(peer.planet,peer.pose);
  function publish(room){if(room)broadcast(room,{type:'arena',players:[...members.values()].filter(m=>m.peer.room===room.id).map(m=>({id:m.peer.account.id,name:m.peer.account.profile.name,hp:m.hp,maxHp:m.maxHp,x:m.peer.pose.x,z:m.peer.pose.z,protectedUntil:m.protectedUntil,wins:m.peer.account.arenaStats?.wins||0,losses:m.peer.account.arenaStats?.losses||0,isDuel:activeDuels.has(m.peer.account.id)}))});}
  let enabled = true, goldenHour = false;
  function leave(peer){
    if(activeDuels.has(peer.account.id)){
      const duel=activeDuels.get(peer.account.id);
      activeDuels.delete(peer.account.id);
      activeDuels.delete(duel.opponentId);
      const oppPeer=peers.get(duel.opponentId);
      if(oppPeer){
        commit(duel.opponentId,'arenaWin',[peer.account.id],records=>{
          const a=records.get(duel.opponentId),b=records.get(peer.account.id);
          if(a){a.arenaStats={wins:(a.arenaStats?.wins||0)+1,losses:a.arenaStats?.losses||0};if(duel.pot>0)a.profile.energy=(a.profile.energy||0)+duel.pot;}
          if(b){b.arenaStats={wins:b.arenaStats?.wins||0,losses:(b.arenaStats?.losses||0)+1};}
          return {winner:duel.opponentId,loser:peer.account.id};
        }).then(()=>{
          send(oppPeer.socket,{type:'arenaResult',won:true,isDuel:true,forfeit:true,bet:duel.bet,pot:duel.pot,loser:peer.account.profile.name,opponent:peer.account.profile.name});
          send(peer.socket,{type:'arenaResult',won:false,isDuel:true,forfeit:true,bet:duel.bet,pot:duel.pot,winner:oppPeer.account.profile.name,opponent:oppPeer.account.profile.name});
          members.delete(oppPeer.account.id);
          onLeave(oppPeer);
          send(oppPeer.socket,{type:'arenaLeft'});
          publish(rooms.get(oppPeer.room));
        }).catch(()=>{});
      }
    }
    if(members.delete(peer.account.id)){onLeave(peer);send(peer.socket,{type:'arenaLeft'});publish(rooms.get(peer.room));}
  }
  function join(peer){
    if(!enabled)throw Object.assign(new Error('Đấu trường PvP hiện đang tạm đóng cửa bởi Quản trị viên.'),{status:400});
    if((peer.planet!==ARENA.planet&&peer.planet!=='lava')||peer.visit||peer.party||!peer.active||peer.account.profile.hp<=0)throw Object.assign(new Error('Hãy đến Đấu Trường ở thế giới công cộng để tham gia võ đài.'),{status:400});
    if(members.has(peer.account.id))return;
    const maxHp=Game.maxHp(peer.account.profile);
    const spawnX = peer.planet === 'lava' ? 0 : ARENA.spawnX;
    const spawnZ = peer.planet === 'lava' ? -48 : ARENA.spawnZ;
    peer.pose={...peer.pose,x:spawnX,z:spawnZ};
    members.set(peer.account.id,{peer,hp:maxHp,maxHp,protectedUntil:now()+3000,stunUntil:0,pending:false});
    send(peer.socket,{type:'arenaJoined',planet:peer.planet,x:spawnX,z:spawnZ,radius:ARENA.radius,spawnX,spawnZ,hp:maxHp,maxHp});publish(rooms.get(peer.room));
  }
  function startDuel(peerA,peerB,bet=0,pot=0){
    if(!enabled)throw Object.assign(new Error('Đấu trường PvP hiện đang tạm đóng cửa.'),{status:400});
    const maxHpA=Game.maxHp(peerA.account.profile);
    const maxHpB=Game.maxHp(peerB.account.profile);
    peerA.pose={...peerA.pose,x:-7,z:0};
    peerB.pose={...peerB.pose,x:7,z:0};
    members.set(peerA.account.id,{peer:peerA,hp:maxHpA,maxHp:maxHpA,protectedUntil:now()+3500,stunUntil:0,pending:false,isDuel:true});
    members.set(peerB.account.id,{peer:peerB,hp:maxHpB,maxHp:maxHpB,protectedUntil:now()+3500,stunUntil:0,pending:false,isDuel:true});
    activeDuels.set(peerA.account.id,{opponentId:peerB.account.id,opponentName:peerB.account.profile.name,bet,pot});
    activeDuels.set(peerB.account.id,{opponentId:peerA.account.id,opponentName:peerA.account.profile.name,bet,pot});
    send(peerA.socket,{type:'arenaJoined',planet:peerA.planet,x:-7,z:0,radius:ARENA.radius,spawnX:-7,spawnZ:0,hp:maxHpA,maxHp:maxHpA,isDuel:true,bet,pot,opponentId:peerB.account.id,opponentName:peerB.account.profile.name});
    send(peerB.socket,{type:'arenaJoined',planet:peerB.planet,x:7,z:0,radius:ARENA.radius,spawnX:7,spawnZ:0,hp:maxHpB,maxHp:maxHpB,isDuel:true,bet,pot,opponentId:peerA.account.id,opponentName:peerA.account.profile.name});
    publish(rooms.get(peerA.room));
    if(peerB.room!==peerA.room)publish(rooms.get(peerB.room));
  }
  function targets(peer){const member=members.get(peer.account.id);if(!member||member.pending||member.protectedUntil>now()||!eligible(peer))return [];
    const duel=activeDuels.get(peer.account.id);
    if(duel){
      return [...members.values()].filter(m=>m.peer.account.id===duel.opponentId&&!m.pending&&m.protectedUntil<=now()&&eligible(m.peer)).map(m=>({id:`arena:${m.peer.account.id}`,x:m.peer.pose.x,z:m.peer.pose.z,hp:m.hp,maxHp:m.maxHp,radius:.65,boss:false}));
    }
    return [...members.values()].filter(m=>m.peer!==peer&&!activeDuels.has(m.peer.account.id)&&!m.pending&&m.protectedUntil<=now()&&eligible(m.peer)&&m.peer.room===peer.room).map(m=>({id:`arena:${m.peer.account.id}`,x:m.peer.pose.x,z:m.peer.pose.z,hp:m.hp,maxHp:m.maxHp,radius:.65,boss:false}));
  }
  function hit(peer,target,impact){
    const id=target.id.slice(6),victim=members.get(id);
    if(!canAct(peer)||!targets(peer).some(t=>t.id===target.id)||!victim||immune(victim.peer))return 0;
    const damage=Math.min(victim.hp,Math.max(1,Math.round(impact.amount*60/(Game.defense(victim.peer.account.profile)+60))));victim.hp-=damage;
    if(victim.hp>0&&impact.stun>0)control(peer,target,'stun',impact.stun);
    send(victim.peer.socket,{type:'arenaHit',damage,hp:victim.hp,maxHp:victim.maxHp});publish(rooms.get(peer.room));
    if(victim.hp<=0){victim.pending=true;const loser=victim.peer,winner=peer.account.id;
      const duel=activeDuels.get(winner);
      if(duel){activeDuels.delete(winner);activeDuels.delete(id);}
      commit(winner,'arenaWin',[id],records=>{
        const a=records.get(winner),b=records.get(id);
        a.arenaStats={wins:(a.arenaStats?.wins||0)+1,losses:a.arenaStats?.losses||0};
        b.arenaStats={wins:b.arenaStats?.wins||0,losses:(b.arenaStats?.losses||0)+1};
        if(duel&&duel.pot>0){a.profile.energy=(a.profile.energy||0)+duel.pot;}
        return {winner,loser:id};
      }).then(()=>{
        if(members.get(id)!==victim)return;
        leave(loser);
        if(duel){
          loser.pose={...loser.pose,x:0,z:20};
          send(loser.socket,{type:'arenaResult',won:false,isDuel:true,bet:duel.bet,pot:duel.pot,winner:peer.account.profile.name,opponent:peer.account.profile.name});
          send(peer.socket,{type:'arenaResult',won:true,isDuel:true,bet:duel.bet,pot:duel.pot,loser:loser.account.profile.name,opponent:loser.account.profile.name});
        }else{
          send(loser.socket,{type:'arenaResult',won:false,winner:peer.account.profile.name});
          send(peer.socket,{type:'arenaResult',won:true,loser:loser.account.profile.name});
        }
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
    join,leave,startDuel,targets,hit,tick,heal,control,canAct,has:peer=>members.has(peer.account.id),isDueled:id=>activeDuels.has(id),publish,
    get enabled(){ return enabled; },
    set enabled(v){ enabled = Boolean(v); },
    get goldenHour(){ return goldenHour; },
    set goldenHour(v){ goldenHour = Boolean(v); }
  };
}
