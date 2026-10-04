// Slow clients retain only the latest state per creature, never a queue of
// obsolete snapshots. Combat and pose packets are sent before pending state.
const pending=new WeakMap();
export function sendSocket(socket,payload){
  if(socket.readyState!==1)return;
  if(payload.type==='joined')pending.delete(socket);
  if(payload.type==='enemyHealth'&&pending.get(socket)?.has(payload.id)){
    const {type,enemyType,impact,impactId,...state}=payload;
    pending.get(socket).set(payload.id,{...state,type:enemyType});
  }
  if(payload.type==='enemies'){
    const updates=pending.get(socket)??new Map();
    for(const enemy of payload.enemies)updates.set(enemy.id,enemy);
    pending.set(socket,updates);
  }else socket.send(JSON.stringify(payload));
  const updates=pending.get(socket);
  if(updates?.size&&socket.bufferedAmount<=16384){
    socket.send(JSON.stringify({type:'enemies',enemies:[...updates.values()]}));
    pending.delete(socket);
  }
}
