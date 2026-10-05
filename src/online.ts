import type { GameBridge, NetworkDrop } from './game-bridge.ts';
import { newGame, maxHp, ITEMS, type SaveState, type PlanetId, type Difficulty } from './model.ts';
import type { LookId } from './looks.ts';
import { INDOOR_Y } from './house.ts';
import './online.css';
import { t, onLanguageChange } from './i18n.ts';
import {gameplayKey} from './gameplay-controls.ts';
import type {GameIntent,ActionReply} from './actions.ts';
import {ARENA,inArena} from './world-events.ts';

type ArenaViewInstance = { group: { parent: unknown }; attach(root: unknown, scene: unknown, world: unknown): void; detach(): void; update(dt: number, active: boolean, world: unknown): void };
let ArenaViewCtor: (new () => ArenaViewInstance) | null = null;
let arenaViewLoading = false;
function loadArenaView() {
  if (!ArenaViewCtor && !arenaViewLoading) {
    arenaViewLoading = true;
    import('./arena-view.ts').then(m => { ArenaViewCtor = m.ArenaView; }).catch(() => {});
  }
  return ArenaViewCtor;
}

interface Explorer { id:string;username?:string;name:string;color:string;level:number;gear:SaveState['gear'];look?:LookId;online?:boolean;x?:number;z?:number;y?:number;facing?:number;moving?:boolean;space?:string;planet?:string;difficulty?:string }
interface Home extends Explorer { discovered?:PlanetId[]; plots:SaveState['plots'];farm?:SaveState['farm'];placed?:unknown[];decorations?:unknown[];helper?:unknown;friends?:unknown[] }
interface EnemyState { id:string;x:number;z:number;hp:number;maxHp:number;[key:string]:unknown }
interface NetworkWorld {
  updateRemotePlayers(players:Explorer[]):void;clearRemotePlayers():void;playRemoteAction(id:string,action:'basic'|'skill',index?:number,details?:{weapon?:string;facing?:number;pose?:string;special?:string}):void;
  setNetworkRole(role:'host'|'peer'|null):void;
  /** The host's difficulty while someone else hosts the room (creature scale, the Settings note); null otherwise. */
  roomDifficulty:Difficulty|null;
  enemySnapshots():EnemyState[];applyEnemySnapshots(enemies:EnemyState[]):void;
  environmentSnapshot():{time:number;lamps:[number,number][]};applyEnvironmentSnapshot(snapshot:{time:number;lamps:[number,number][]}):void;
  onRemoteDamage:(id:string,amount:number,source?:string,enemyId?:string)=>void;
  onEnvironmentAction:(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number})=>void;
  applyEnvironmentAction(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number}):{ok:boolean;rewards?:{id:string;count:number}[]};
  grantEnvironmentReward(eventId:string,rewards:{id:string;count:number}[]):unknown;
}
interface Session { authorityVersion?:number;account:Explorer|null;profile?:SaveState;revision?:number;friends?:Explorer[];requests?:Explorer[] }
interface ActionJob extends GameIntent {requestId:string;expectedRevision:number;rulesVersion:1;submitted?:boolean}
interface ChatAttempt { requestId:string;draft:string;accountId:string;room:string;connection:WebSocket;pending:boolean;timer?:number }
// randomUUID is unavailable on HTTP LAN/IP pages in some mobile browsers;
// getRandomValues is still available there and provides the same random UUID bytes.
function requestId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const el = <K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='') => {const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
const button=(label:string,action:()=>void,className='')=>{const node=el('button',className,t(label));node.type='button';node.addEventListener('click',action);return node;};

function initSoloEdition() {
  const dialog=el('dialog','social-dialog');dialog.id='online-dialog';
  const close=button('✕',()=>dialog.close(),'social-close');
  const header=el('header','social-header'),heading=el('h2');header.append(heading,close);
  const content=el('div','social-content'),intro=el('p','social-intro'),details=el('p','social-small'),keepPlaying=button('Keep playing',()=>dialog.close(),'social-primary');
  content.append(intro,details,keepPlaying);dialog.append(header,content);document.body.append(dialog);
  const slot=document.querySelector('#social-slot');
  const toggle=button('🌱',()=>dialog.showModal(),'social-toggle');toggle.id='online-button';toggle.dataset.staticHost='true';
  if(slot){slot.append(toggle);toggle.classList.add('social-inline-toggle');}else document.body.append(toggle);
  const refresh=()=>{
    dialog.setAttribute('aria-label',t('Solo adventure'));close.setAttribute('aria-label',t('Close solo information'));
    heading.textContent=t('Solo adventure');intro.textContent=t('Explore, grow your garden, and complete every adventure on your own. Your progress saves in this browser.');
    details.textContent=t('This GitHub Pages edition plays solo. Accounts, friends, and shared worlds are available in the multiplayer edition.');
    keepPlaying.textContent=t('Keep playing');toggle.textContent=slot?'🌱':`🌱 ${t('Solo adventure')}`;toggle.title=t('Solo adventure');toggle.setAttribute('aria-label',t('About this solo adventure'));
  };
  refresh();onLanguageChange(refresh);
}

export function initOnline(game:GameBridge) {
  if(import.meta.env.VITE_STATIC_HOST==='true'){
    initSoloEdition();
    return {
      openDialog:()=>{},
      closeDialog:()=>{},
      isLoggedIn:()=>false,
      getAccount:()=>null,
      hasSavedAuth:()=>false,
      onLogin:()=>{},
      autoLoginPromise:Promise.resolve(false)
    };
  }
  const serviceBase=import.meta.env.BASE_URL;
  let account:Explorer|null=null,friends:Explorer[]=[],requests:Explorer[]=[],socket:WebSocket|null=null;
  let host:string|null=null,party:string|null=null,planet='',visiting:string|null=null,offline:SaveState|null=null,roomEpoch=0;
  let reconnect:number|undefined,saveTimer:number|undefined,saving:Promise<void>|null=null,stopped=false,revision=0,sessionEpoch=0;
  let actionQueue:ActionJob[]=[];const waiting=new Map<string,{resolve:(reply:ActionReply)=>void;reject:(error:Error)=>void}>();
  const pendingSave=()=>actionQueue.length>0;
  let poseClock=0,enemyClock=0,tab:'world'|'friends'|'account'='world',register=false,status='Play together',authBusy=false;
  let authSubmit:HTMLButtonElement|null=null;
  const players=new Map<string,Explorer>(),rewardIds=new Set<string>(),chat:{name:string;message:string}[]=[];
  let chatRoom:string|null=null,chatDraft='',chatReady=false,chatAttempt:ChatAttempt|null=null;
  let sharingLoot=false;
  let fpsFrames=0,fpsAccum=0,currentFps=60,currentPing=0,lastPingAt=0,lastSentPose:{x:number;y:number;z:number;facing?:number;moving?:boolean}|null=null;
  const hudPerf = el('div', 'hud-perf-badge');
  hudPerf.id = 'hud-perf';
  hudPerf.innerHTML = '🟢 <b>60 FPS</b> <span style="opacity:0.35">|</span> Ping: <span style="color:#94a3b8">Offline</span>';
  document.body?.append?.(hudPerf);
  const toggle=button(`👥 ${t('Play together')}`,()=>{render();dialog.showModal();},'social-toggle');toggle.id='online-button';const socialSlot=document.querySelector('#social-slot');if(socialSlot){socialSlot.append(toggle);toggle.classList.add('social-inline-toggle');}else document.body.append(toggle);toggle.setAttribute('aria-label',t('Play together'));
  const dialog=el('dialog','social-dialog');dialog.id='online-dialog';dialog.setAttribute('aria-label',t('Play together'));document.body.append(dialog);
  const header=el('header','social-header'),heading=el('h2','',t('Play together')),close=button('✕',()=>dialog.close(),'social-close');close.setAttribute('aria-label',t('Close online menu'));header.append(heading,close);
  const tabs=el('nav','social-tabs'),content=el('div','social-content'),notice=el('p','social-notice');notice.setAttribute('role','status');dialog.append(header,tabs,notice,content);
  dialog.addEventListener('click',event=>{if(event.target===dialog&&event.clientX&&(event.clientX<dialog.getBoundingClientRect().left||event.clientX>dialog.getBoundingClientRect().right))dialog.close();});
  
  // HUD Chat Overlay
  const hudChatLog = el('div');
  hudChatLog.style.cssText = 'position:fixed; bottom:180px; left:16px; width:300px; z-index:100; pointer-events:none; display:flex; flex-direction:column; gap:4px; text-shadow:1px 1px 2px rgba(0,0,0,0.8); font-size:14px; font-weight:bold; color:white; font-family:sans-serif;';
  document.body.append(hudChatLog);

  const hudChatForm = el('form');
  hudChatForm.style.cssText = 'position:fixed; bottom:110px; left:16px; z-index:101; display:none;';
  const hudChatInput = el('input');
  hudChatInput.type = 'text';
  hudChatInput.placeholder = 'Nhập tin nhắn...';
  hudChatInput.autocomplete = 'off';
  hudChatInput.style.cssText = 'width:200px; padding:10px 14px; border-radius:20px; border:none; background:rgba(255,255,255,0.9); pointer-events:auto; outline:none; box-shadow:0 2px 5px rgba(0,0,0,0.2); font-family:sans-serif;';
  hudChatForm.append(hudChatInput);
  document.body.append(hudChatForm);

  const hudChatBtn = el('button');
  hudChatBtn.style.cssText = 'position:fixed; bottom:110px; left:16px; z-index:101; width:44px; height:44px; border-radius:50%; border:none; background:rgba(0,0,0,0.5); color:white; cursor:pointer; pointer-events:auto; font-size:20px; display:flex; justify-content:center; align-items:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);';
  hudChatBtn.innerText = '💬';
  document.body.append(hudChatBtn);
  hudChatBtn.onclick = () => { hudChatBtn.style.display = 'none'; hudChatForm.style.display = 'block'; hudChatInput.focus(); };
  hudChatInput.onblur = () => { setTimeout(() => { hudChatForm.style.display = 'none'; hudChatBtn.style.display = 'flex'; }, 200); };
  hudChatForm.onsubmit = (e) => {
    e.preventDefault();
    const msg = hudChatInput.value.trim();
    if (msg && chatRoom && chatReady && socket?.readyState === WebSocket.OPEN && account) {
      const id=chatAttempt&&chatAttempt.accountId===account.id&&chatAttempt.room===chatRoom&&chatAttempt.draft===msg?chatAttempt.requestId:requestId();
      const attempt:ChatAttempt={requestId:id,draft:msg,accountId:account.id,room:chatRoom,connection:socket,pending:true};
      chatAttempt=attempt;
      socket.send(JSON.stringify({type:'chat',message:msg,requestId:id}));
    }
    hudChatInput.value = '';
    hudChatForm.style.display = 'none';
    hudChatBtn.style.display = 'flex';
  };

  const world=()=>game.getWorld() as ReturnType<GameBridge['getWorld']> & NetworkWorld;
  let noticeSource='',noticeParams:Record<string,string|number>={},saveStatusSource='',actionRetryAt=0,rateNoticeAt=0;
  function setNotice(message:string,params:Record<string,string|number>={}){noticeSource=message;noticeParams=params;notice.textContent=t(message,params);}
  function announce(message:string,params:Record<string,string|number>={}){setNotice(message,params);game.showNotice(t(message,params));}
  function setSaveStatus(message:string){saveStatusSource=message;const label=document.querySelector('#save-status');if(label)label.textContent=t(message);}
  async function api<T>(path:string,data?:unknown,method=data?'POST':'GET'):Promise<T>{
    const response=await fetch(`${serviceBase}api/${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    let value:{error?:string,retryAfterMs?:number};try{value=await response.json();}catch{throw new Error('Online play needs the game server. Your offline adventure is ready to play.');}
    if(!response.ok)throw Object.assign(new Error(value.error||'Connection interrupted. Please try again.'),{status:response.status,retryAfterMs:value.retryAfterMs});return value as T;
  }
  const send=(value:unknown)=>{if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(value));return true;}return false;};
  let eventBoss:{id:string;name:string;planet:string;x:number;z:number;expiresAt:number}|null=null;
  let activitiesClock=0,arenaPlayers:{id:string;name:string;hp:number;maxHp:number;x:number;z:number;protectedUntil:number;wins:number;losses:number;isDuel?:boolean}[]=[];
  const activities=el('div','online-activities'),bossBanner=el('div','world-boss-banner'),arenaInfo=el('div','arena-info');
  const arenaButton=button('⚔ Tham gia võ đài',()=>send({type:world().arenaActive?'arenaLeave':'arenaJoin'}));
  activities.append(bossBanner,arenaInfo,arenaButton);document.body.append(activities);
  let arenaView:ArenaViewInstance|null=null;
  function syncArenaView(){
    const currentWorld=world() as any,presence=game.getPresence();
    const Ctor=loadArenaView();
    const shouldShow=presence.planet===ARENA.planet&&typeof currentWorld?.root?.add==='function'&&typeof Ctor==='function';
    if(shouldShow && Ctor){
      if(!arenaView)arenaView=new Ctor();
      if(arenaView.group.parent!==currentWorld.root){
        arenaView.attach(currentWorld.root,currentWorld.scene,currentWorld);
      }
    }else if(arenaView){
      arenaView.detach();
    }
  }
  function refreshActivities(){
    syncArenaView();
    activities.hidden=!account||socket?.readyState!==WebSocket.OPEN;
    bossBanner.hidden=!eventBoss;
    if(eventBoss){const minutes=Math.max(0,Math.ceil((eventBoss.expiresAt-Date.now())/60000));bossBanner.textContent=`🐲 ${eventBoss.name} · ${eventBoss.planet} (${eventBoss.x}, ${eventBoss.z}) · còn ${minutes} phút · thế giới công cộng`;}
    const current=world(),presence=game.getPresence();arenaButton.hidden=presence.planet!==ARENA.planet||!!party||!!visiting;
    arenaButton.textContent=current.arenaActive?'Rời võ đài':'⚔ Tham gia võ đài';
    const isDuelActive = !!arenaPlayers.find(p=>p.id===account?.id)?.isDuel;
    arenaInfo.hidden=!current.arenaActive||isDuelActive;
    if(current.arenaActive){const self=arenaPlayers.find(p=>p.id===account?.id);
      if(!isDuelActive){
        arenaInfo.textContent=`VÕ ĐÀI · ${Math.ceil(self?.hp??0)}/${Math.ceil(self?.maxHp??0)} HP · ${self?.wins??0} thắng / ${self?.losses??0} thua\nSpace / nút đánh · Q/W/E/R: chiêu · ra ngoài vòng để rời`;
      }
      current.arenaTargets=arenaPlayers.filter(p=>p.id!==account?.id&&p.hp>0&&p.protectedUntil<=Date.now()&&(p.isDuel||inArena(presence.planet,p))).map(p=>{const remote=players.get(p.id);return {id:`arena:${p.id}`,x:remote?.x??p.x,z:remote?.z??p.z,hp:p.hp,maxHp:p.maxHp,radius:.65};});}
  }
  function captureChatDraft(){const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)chatDraft=input.value;}
  function refreshChatControls(){
    const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)input.value=chatDraft;
    const submit=content.querySelector<HTMLButtonElement>('.social-chat-send');if(submit){submit.disabled=!!chatAttempt?.pending||!chatReady;submit.textContent=t(chatAttempt?.pending?'Sending…':'Send');}
  }
  function stopChatWait(){if(chatAttempt?.timer!==undefined){clearTimeout(chatAttempt.timer);chatAttempt.timer=undefined;}}
  function releaseChat(message?:string){captureChatDraft();stopChatWait();if(chatAttempt)chatAttempt.pending=false;refreshChatControls();if(message)announce(message);}
  function clearChat(room:string|null=null){
    stopChatWait();chatAttempt=null;chatRoom=room;chatDraft='';chatReady=false;chat.length=0;
    const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)input.value='';renderChat();refreshChatControls();
  }
  function chatMatches(requestId:unknown,connection:WebSocket){return !!chatAttempt&&chatAttempt.requestId===requestId&&chatAttempt.accountId===account?.id&&chatAttempt.room===chatRoom&&chatAttempt.connection===connection;}
  function acknowledgeChat(requestId:unknown,connection:WebSocket){
    if(!chatMatches(requestId,connection))return;captureChatDraft();const sent=chatAttempt!;stopChatWait();
    if(chatDraft===sent.draft)chatDraft='';chatAttempt=null;refreshChatControls();setNotice('Message sent.');
  }
  function submitChat(){
    captureChatDraft();if(chatAttempt?.pending||!chatDraft.trim())return;
    if(!account||!chatRoom||!chatReady||socket?.readyState!==WebSocket.OPEN){announce('Chat is reconnecting. Your draft is kept.');return;}
    // Reuse an uncertain delivery's ID so a retry cannot broadcast an accepted message twice.
    const previous=chatAttempt,id=previous&&previous.accountId===account.id&&previous.room===chatRoom&&previous.draft===chatDraft?previous.requestId:requestId();
    stopChatWait();const attempt:ChatAttempt={requestId:id,draft:chatDraft,accountId:account.id,room:chatRoom,connection:socket,pending:true};chatAttempt=attempt;
    refreshChatControls();setNotice('');
    try{socket.send(JSON.stringify({type:'chat',message:attempt.draft,requestId:attempt.requestId}));}
    catch{releaseChat('Chat is reconnecting. Your draft is kept.');return;}
    attempt.timer=window.setTimeout(()=>{if(chatAttempt===attempt&&attempt.pending)releaseChat('Message delivery is unconfirmed. Your draft is kept; you can try sending again.');},10000);
  }
  function sendRoom(value:{type:string;planet?:string;party?:string|null;id?:string}){
    if(!send(value))return false;
    // The server intentionally sends no new joined event for a room we already occupy.
    const sameRoom=value.type==='join'&&`${value.party?.trim().toUpperCase()||'public'}:${value.planet||'home'}`===chatRoom;
    if(!sameRoom){captureChatDraft();chatReady=false;refreshChatControls();}return true;
  }

  const playerCardDialog = el('dialog', 'player-card-dialog') as HTMLDialogElement;
  if (!playerCardDialog.showModal) (playerCardDialog as any).showModal = () => { playerCardDialog.setAttribute('open', ''); };
  if (!playerCardDialog.close) (playerCardDialog as any).close = () => { playerCardDialog.removeAttribute('open'); };
  document.body?.append?.(playerCardDialog);
  playerCardDialog.addEventListener('click', event => {
    if (event.target === playerCardDialog) playerCardDialog.close();
  });

  const duelInviteBanner = el('div', 'duel-invite-banner');
  duelInviteBanner.style.display = 'none';
  document.body?.append?.(duelInviteBanner);

  const duelCountdownOverlay = el('div', 'duel-countdown-overlay');
  duelCountdownOverlay.style.display = 'none';
  document.body?.append?.(duelCountdownOverlay);

  const duelTopBar = el('div', 'duel-topbar');
  duelTopBar.style.display = 'none';
  document.body?.append?.(duelTopBar);

  const playerNametagsLayer = el('div', 'player-nametags-layer');
  document.body?.append?.(playerNametagsLayer);
  const overheadNametags = new Map<string, { root: HTMLElement; badge: HTMLElement; hpBar: HTMLElement; hpFill: HTMLElement }>();

  let isDuelActive = false;
  let activeDuelOpponent: { id: string; name: string } | null = null;
  let duelSelfHp = 100;
  let duelSelfMaxHp = 100;
  let duelOppHp = 100;
  let duelOppMaxHp = 100;
  let duelPot = 0;

  function updateDuelTopBarUi() {
    const selfName = account?.name || game.getState().name || 'Bạn';
    const oppName = activeDuelOpponent?.name || 'Đối thủ';
    const selfPct = Math.max(0, Math.min(100, Math.round((duelSelfHp / Math.max(1, duelSelfMaxHp)) * 100)));
    const oppPct = Math.max(0, Math.min(100, Math.round((duelOppHp / Math.max(1, duelOppMaxHp)) * 100)));

    duelTopBar.innerHTML = `
      <div class="duel-fighter self">
        <span class="duel-fighter-name">⚔️ ${selfName}</span>
        <div class="duel-hp-bar">
          <div class="duel-hp-fill self" style="width:${selfPct}%"></div>
          <span class="duel-hp-text">${duelSelfHp} / ${duelSelfMaxHp}</span>
        </div>
      </div>
      <div class="duel-center-info">
        <div class="duel-vs-badge">VS</div>
        <div class="duel-topbar-pot">🪙 ${duelPot.toLocaleString()} Vàng</div>
      </div>
      <div class="duel-fighter opp">
        <span class="duel-fighter-name">⚔️ ${oppName}</span>
        <div class="duel-hp-bar">
          <div class="duel-hp-fill opp" style="width:${oppPct}%"></div>
          <span class="duel-hp-text">${duelOppHp} / ${duelOppMaxHp}</span>
        </div>
      </div>
    `;
  }

  const duelResultModal = el('div', 'duel-result-modal');
  duelResultModal.style.display = 'none';
  document.body?.append?.(duelResultModal);

  function playDuelAlertTone() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  function openBetPicker(targetPlayer: Explorer) {
    const curEnergy = game.getState().energy || 0;
    playerCardDialog.replaceChildren();

    const header = el('header', 'player-card-header');
    header.append(el('h3', '', `⚔️ Cược Solo 1v1: ${targetPlayer.name}`));
    const closeBtn = el('button', 'player-card-close', '✕');
    closeBtn.onclick = () => playerCardDialog.close();
    header.append(closeBtn);

    const body = el('div', 'player-card-body');
    const walletInfo = el('div', 'bet-wallet-info');
    walletInfo.innerHTML = `<span>🪙 Số Vàng của bạn:</span> <span style="font-size:15px; color:#ffd700;">${curEnergy.toLocaleString()} Vàng</span>`;
    body.append(walletInfo);

    const optionsList = el('div', 'bet-options-list');
    const betTiers = [
      { bet: 0, label: '🌿 Đấu Giao Hữu', sub: 'Miễn phí cược · Không mất vàng' },
      { bet: 100, label: '🪙 Cược 100 Vàng', sub: 'Thắng nhận 200 Vàng' },
      { bet: 500, label: '🪙 Cược 500 Vàng', sub: 'Thắng nhận 1.000 Vàng' },
      { bet: 1000, label: '🪙 Cược 1.000 Vàng', sub: 'Thắng nhận 2.000 Vàng' },
      { bet: 5000, label: '💎 Cược 5.000 Vàng', sub: 'Trận Đấu Cao Thủ · Thắng nhận 10.000 Vàng' },
    ];

    let selectedBet = 0;
    const cards: HTMLElement[] = [];

    betTiers.forEach((tier, index) => {
      const card = el('div', `bet-card-option ${index === 0 ? 'selected' : ''}`);
      const isAffordable = curEnergy >= tier.bet;
      if (!isAffordable) card.classList.add('disabled');

      card.innerHTML = `
        <div class="bet-card-label">${tier.label}</div>
        <div class="bet-card-sub">${tier.sub}</div>
      `;

      card.onclick = () => {
        if (!isAffordable) {
          announce(`Bạn không đủ Vàng để cược mức ${tier.bet.toLocaleString()}!`);
          return;
        }
        selectedBet = tier.bet;
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      };

      cards.push(card);
      optionsList.append(card);
    });
    body.append(optionsList);

    const actions = el('div', 'player-actions-grid');
    const sendBtn = el('button', 'btn-player-action btn-duel', '⚔️ Gửi Lời Thách Đấu');
    sendBtn.onclick = () => {
      if (curEnergy < selectedBet) {
        announce('Bạn không đủ Vàng để thách đấu mức này!');
        return;
      }
      send({ type: 'duelChallenge', targetId: targetPlayer.id, bet: selectedBet });
      playerCardDialog.close();
      announce(`Đã gửi lời mời Solo 1v1 (${selectedBet.toLocaleString()} Vàng) tới ${targetPlayer.name}!`);
    };
    const backBtn = el('button', 'btn-player-action btn-chat', '← Quay Lại');
    backBtn.onclick = () => openPlayer(targetPlayer.id);

    actions.append(sendBtn, backBtn);
    body.append(actions);

    playerCardDialog.append(header, body);
    if (!playerCardDialog.open) playerCardDialog.showModal();
  }

  function openPlayer(id:string){
    if(world().arenaActive||isDuelActive)return;
    const isTargetDueled=arenaPlayers.some(p=>p.id===id&&p.isDuel);
    if(isTargetDueled){announce('Người chơi này đang trong trận quyết đấu 1v1!');return;}
    const player=players.get(id);if(!player||id===account?.id)return;
    playerCardDialog.replaceChildren();

    const header = el('header', 'player-card-header');
    header.append(el('h3', '', '🧙 THÔNG TIN NGƯỜI CHƠI'));
    const closeBtn = el('button', 'player-card-close', '✕');
    closeBtn.onclick = () => playerCardDialog.close();
    header.append(closeBtn);

    const body = el('div', 'player-card-body');

    // Hero Profile Card
    const banner = el('div', 'player-hero-banner');
    const avatar = el('div', 'player-avatar-large', player.name.slice(0, 1).toUpperCase());
    avatar.style.background = player.color || '#6366f1';

    const meta = el('div', 'player-hero-meta');
    const nameEl = el('div', 'player-hero-name', player.name);
    const subEl = el('div', 'player-hero-sub');
    if (player.username) subEl.append(el('span', '', `@${player.username}`));
    subEl.append(el('span', 'player-badge-level', `⭐ Cấp ${player.level || 1}`));
    meta.append(nameEl, subEl);
    banner.append(avatar, meta);
    body.append(banner);

    // Gear Section
    const gearSec = el('div', 'player-gear-section');
    gearSec.append(el('div', 'player-section-title', '⚔️ Trang Bị Đang Mặc'));
    const gearGrid = el('div', 'player-gear-grid');

    const gearSlots = [
      { icon: '⚔️', label: 'Vũ khí', id: player.gear?.weapon },
      { icon: '🧢', label: 'Mũ', id: player.gear?.hat },
      { icon: '🥋', label: 'Trang phục', id: player.gear?.outfit },
      { icon: '🐾', label: 'Thú cưng', id: player.gear?.pet },
    ];

    gearSlots.forEach(slot => {
      const itemEl = el('div', 'player-gear-item');
      const itemTitle = (slot.id && typeof ITEMS !== 'undefined' && (ITEMS as any)?.[slot.id]?.name) || (slot.id ? String(slot.id) : 'Chưa mang');
      itemEl.innerHTML = `<span class="player-gear-icon">${slot.icon}</span><span class="player-gear-name" title="${itemTitle}">${itemTitle}</span>`;
      gearGrid.append(itemEl);
    });
    gearSec.append(gearGrid);
    body.append(gearSec);

    // 4 Action Buttons
    const actionsGrid = el('div', 'player-actions-grid');

    // 1. Thách đấu cá cược
    const duelBtn = el('button', 'btn-player-action btn-duel', '⚔️ Thách Đấu Cá Cược 1v1');
    duelBtn.onclick = () => openBetPicker(player);

    // 2. Nhắn tin riêng
    const chatBtn = el('button', 'btn-player-action btn-chat', '💬 Nhắn Tin');
    chatBtn.onclick = () => {
      playerCardDialog.close();
      hudChatBtn.style.display = 'none';
      hudChatForm.style.display = 'block';
      hudChatInput.value = `@${player.name} `;
      hudChatInput.focus();
    };

    // 3. Kết bạn
    const isFriend = friends.some(f => f.id === id);
    const friendBtn = el('button', 'btn-player-action btn-friend', isFriend ? t('Friend') : t('Send friend request'));
    if (isFriend) {
      friendBtn.style.opacity = '0.7';
    } else {
      const handleFriendRequest = async () => {
        try {
          await api('friends/request', { id });
          announce('Đã gửi lời mời kết bạn.');
          friendBtn.textContent = 'Đã gửi lời mời';
          friendBtn.style.opacity = '0.7';
        } catch (e) {
          announce((e as Error).message);
        }
      };
      friendBtn.onclick = handleFriendRequest;
      friendBtn.addEventListener('click', handleFriendRequest);
    }

    // 4. Thăm vườn
    const visitBtn = el('button', 'btn-player-action btn-visit', '🏡 Thăm Vườn');
    visitBtn.onclick = () => {
      if (isFriend) {
        sendRoom({ type: 'visit', id });
        playerCardDialog.close();
      } else {
        announce('Cần kết bạn trước khi thăm vườn nhà!');
      }
    };

    actionsGrid.append(duelBtn, chatBtn, friendBtn, visitBtn);
    body.append(actionsGrid);

    playerCardDialog.append(header, body);
    if (!playerCardDialog.open) playerCardDialog.showModal();
  }
  world().onRemotePlayerClick=(id)=>{
    if(world().arenaActive||isDuelActive)return;
    openPlayer(id);
  };
  world().isPlayerDueled=(id)=>(isDuelActive&&(id===activeDuelOpponent?.id||id===account?.id))||arenaPlayers.some(p=>p.id===id&&p.isDuel);
  document.addEventListener('keydown',event=>{
    if(gameplayKey(event)!=='Enter'||event.repeat||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
    if(document.querySelector('#dialog-layer:not([hidden])')||!account)return;event.preventDefault();captureChatDraft();tab='world';render();if(!dialog.open)dialog.showModal();content.querySelector<HTMLInputElement>('.social-chat-input')?.focus();
  });
  function refreshButton(){const label=account?t(status,{code:party||''}):t('Play together');toggle.textContent=socialSlot?'👥':`👥 ${label}`;toggle.title=label;toggle.setAttribute('aria-label',t('Play together'));dialog.setAttribute('aria-label',t('Play together'));close.setAttribute('aria-label',t('Close online menu'));toggle.dataset.online=String(!!account);}
  function expireSession(){
    if(!account)return;sessionEpoch++;stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);
    clearChat();const previous=socket;socket=null;previous?.close();account=null;host=null;party=null;visiting=null;players.clear();rejectActions('Your session ended. Pending actions remain on this device.');
    for(const tag of overheadNametags.values())tag.root.remove(); overheadNametags.clear();
    authority(null);world().clearRemotePlayers();game.setVisiting(null);game.setPersistence(null);game.setActionHandler(null);const previousOffline=offline||game.getOfflineState();if(previousOffline)game.applyState(previousOffline);offline=null;
    status='Play together';setSaveStatus('● Offline adventure restored');refreshButton();render();announce('Your online session ended. Sign in again to continue; pending online progress is kept on this device.');
  }
  /** Mirrors the host's difficulty into the world (server.mjs presence carries it). */
  function syncRoomDifficulty(){const d=host&&host!==account?.id?players.get(host)?.difficulty:null;world().roomDifficulty=d==='easy'||d==='normal'||d==='hard'?d:null;}
  function renderPlayers(){
    syncRoomDifficulty();
    const local=game.getPresence();const space=visiting?`home:${visiting}`:local.planet==='home'&&Math.hypot(local.x,local.z)<18?`home:${account?.id}`:'wild';
    world().updateRemotePlayers([...players.values()].filter(player=>player.id!==account?.id&&player.planet===local.planet&&(player.space==='wild'||player.space===space)));
  }
  function authority(next:string|null,enemies?:EnemyState[]){
    const becomingHost=next===account?.id&&host!==next;host=next;syncRoomDifficulty();
    if(enemies?.length&&(becomingHost||host!==account?.id))world().applyEnemySnapshots(enemies);
    const role=account&&socket?.readyState===WebSocket.OPEN?(host===account.id?'host':'peer'):null;
    world().setNetworkRole(role);
    if(!role){world().localPlayerId=account?.id??'local';world().onRemoteDamage=()=>{};world().onEnvironmentAction=()=>{};game.setNetworkHooks({role:null});return;}
    world().localPlayerId=account?.id??'local';
    world().onRemoteDamage=(id,_amount,source,enemyId)=>{if(role==='host'&&enemyId)send({type:'damage',id,source,enemyId});};
    world().onEnvironmentAction=action=>{send({type:'environmentAction',action});};
    game.setNetworkHooks({role,hit:()=>true,status:()=>true,moveTarget:()=>true,reportDamage:(enemyId,source)=>{if(role==='host')send({type:'damage',id:account?.id,source,enemyId});},visitCrop:index=>{
      const plot=world().state.plots[index];if(!visiting||!plot?.crop)return;
      void queueAction({type:'stealCrop',payload:{ownerId:visiting,index,generation:plot.generation}}).catch(error=>announce(error.message));
    }});
  }

  function rememberActions(){if(!account)return;try{localStorage.setItem(`cute-game-actions-${account.id}`,JSON.stringify(actionQueue));}catch{/* Server receipts also make same-ID retries safe. */}}
  function rejectActions(message:string){for(const waiter of waiting.values())waiter.reject(new Error(message));waiting.clear();actionQueue=[];}
  function queueAction(intent:GameIntent):Promise<ActionReply>{
    if(!account||stopped)return Promise.reject(new Error('Reconnect before changing your online adventure.'));
    const job:ActionJob={...structuredClone(intent),requestId:requestId(),expectedRevision:revision,rulesVersion:1};actionQueue.push(job);rememberActions();setSaveStatus('◌ Saving online…');
    const answer=new Promise<ActionReply>((resolve,reject)=>waiting.set(job.requestId,{resolve,reject}));void flushSave();return answer;
  }
  async function shareNearbyLoot(){
    if(!account||visiting||sharingLoot)return;sharingLoot=true;const actorId=account.id,epoch=sessionEpoch,room=chatRoom;
    try{
      const result=await api<{drops:NetworkDrop[]}>('drops');if(account?.id!==actorId||sessionEpoch!==epoch||chatRoom!==room||visiting)return;
      const here=game.getPresence(),now=Date.now(),own=(result.drops||[]).filter(drop=>drop.owner===actorId&&drop.room===room&&drop.planet===here.planet&&drop.expiresAt>now&&drop.releaseAt>now&&Math.hypot(drop.x-here.x,drop.z-here.z)<=12);
      if(!own.length){announce('There is no protected loot of yours nearby.');return;}
      let count=0;for(const drop of own){if(account?.id!==actorId||sessionEpoch!==epoch||chatRoom!==room||visiting)return;await queueAction({type:'releaseDrop',payload:{ownerId:drop.ownerId,id:drop.id}});count++;}
      if(account?.id===actorId&&sessionEpoch===epoch)announce('Shared {count} nearby loot drops.',{count});
    }catch(error){if(account?.id===actorId&&sessionEpoch===epoch)announce((error as Error).message);}finally{sharingLoot=false;}
  }
  // Progress reaches the server only as an explicit intent, never a profile snapshot.
  function queueSave(_state:SaveState){if(actionQueue.length)void flushSave();}
  async function flushSave(){
    if(saving)return saving;if(!actionQueue.length||!account||stopped||Date.now()<actionRetryAt)return;
    const accountId=account.id,epoch=sessionEpoch;
    saving=(async()=>{while(actionQueue.length&&account?.id===accountId&&sessionEpoch===epoch&&!stopped){const job=actionQueue[0];
      try{if(!job.submitted){job.expectedRevision=revision;job.submitted=true;rememberActions();}const {submitted,...body}=job;const reply=await api<ActionReply>('actions',body);if(account?.id!==accountId||sessionEpoch!==epoch)return;
        if(reply.revision>=revision){revision=reply.revision;game.applyAuthoritativeState(reply.profile);}actionQueue.shift();rememberActions();waiting.get(job.requestId)?.resolve(reply);waiting.delete(job.requestId);
        // A new unsubmitted intent follows the revision returned by the preceding transaction.
        rememberActions();
        status=socket?.readyState===WebSocket.OPEN?'Online':'Reconnecting';setSaveStatus(actionQueue.length?'◌ Saving online…':'● Saved online');refreshButton();
      }catch(error){if(account?.id!==accountId||sessionEpoch!==epoch)return;const statusCode=(error as {status?:number}).status;
        if(statusCode===401){expireSession();return;}
        if(statusCode===429){const delay=(error as {retryAfterMs?:number}).retryAfterMs;actionRetryAt=Date.now()+Math.max(1000,Number.isFinite(delay)?delay!:60000);status='Action pending';setSaveStatus('◌ Saving online…');refreshButton();break;}
        if(statusCode===409){try{const fresh=await api<Session>('auth/session');if(account?.id!==accountId||sessionEpoch!==epoch)return;if(!fresh.account){expireSession();return;}if(fresh.account.id!==accountId){begin(fresh);return;}const prevRevision=revision;revision=fresh.revision||0;if(fresh.profile)game.applyAuthoritativeState(fresh.profile);if(revision>prevRevision||job.expectedRevision!==revision){job.expectedRevision=revision;delete job.submitted;rememberActions();continue;}}catch{break;}actionQueue.shift();rememberActions();waiting.get(job.requestId)?.reject(error as Error);waiting.delete(job.requestId);continue;}
        if(statusCode&&statusCode<500){actionQueue.shift();rememberActions();waiting.get(job.requestId)?.reject(error as Error);waiting.delete(job.requestId);continue;}
        status='Action pending';setSaveStatus('○ Action pending — reconnect to finish');refreshButton();break;
      }
    }})().finally(()=>{saving=null;if(actionQueue.length&&account&&!stopped){if(sessionEpoch!==epoch)void flushSave();else saveTimer=window.setTimeout(()=>void flushSave(),Math.max(5000,actionRetryAt-Date.now()));}});
    return saving;
  }
  function showDuelCountdown(onFinish: () => void) {
    duelCountdownOverlay.style.display = 'flex';
    const textEl = el('div', 'duel-countdown-text', '3');
    duelCountdownOverlay.replaceChildren(textEl);

    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count === 2) textEl.textContent = '2';
      else if (count === 1) textEl.textContent = '1';
      else if (count === 0) {
        textEl.textContent = '⚔️ CHIẾN! ⚔️';
        textEl.style.color = '#ef4444';
      } else {
        clearInterval(timer);
        duelCountdownOverlay.style.display = 'none';
        onFinish();
      }
    }, 850);
  }

  function showDuelResult(result: { won: boolean; pot: number; bet: number; opponent?: string; winner?: string; loser?: string; forfeit?: boolean; reason?: string; winnerRemainingHp?: number; restoredHp?: number; maxHp?: number }) {
    isDuelActive = false;
    activeDuelOpponent = null;
    duelTopBar.style.display = 'none';
    document.body.classList.remove('has-active-duel');
    duelResultModal.style.display = 'flex';
    const card = el('div', 'duel-result-card');

    const oppName = result.opponent || (result.won ? result.loser : result.winner) || 'Đối thủ';
    if (result.won) {
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const colors = ['#ffd700', '#ff3366', '#00ffcc', '#ff9900', '#a855f7'];
          const col = colors[Math.floor(Math.random() * colors.length)];
          world().burst?.(world().position.x + (Math.random() - 0.5) * 6, world().position.z + (Math.random() - 0.5) * 6, col, 12);
        }, i * 200);
      }
      const curState = game.getState();
      const heroMaxHp = maxHp(curState);
      const restored = result.restoredHp ?? Math.min(heroMaxHp, (result.winnerRemainingHp ?? curState.hp) + Math.round(heroMaxHp * 0.3));
      curState.energy = (curState.energy || 0) + (result.pot || 0);
      curState.hp = restored;
      game.updateHud?.();

      let winReason = `Bạn đã hạ gục anh hùng ${oppName}!`;
      if (result.forfeit) {
        if (result.reason === 'house') {
          winReason = `${oppName} đã bỏ chạy vào nhà và bị xử thua cuộc!`;
        } else if (result.reason === 'safe_zone') {
          winReason = `${oppName} đã bỏ chạy về nơi an toàn và bị xử thua cuộc!`;
        } else {
          winReason = `${oppName} đã bỏ cuộc giữa trận!`;
        }
      }
      card.innerHTML = `
        <div class="duel-result-icon">👑</div>
        <h2 class="duel-result-title win">CHIẾN THẮNG TUYỆT ĐỐI!</h2>
        <p class="duel-result-sub">${winReason}</p>
        <div class="duel-reward-box">🏆 Nhận Thưởng: +${(result.pot || 0).toLocaleString()} Vàng</div>
        <div class="duel-safe-box" style="margin-top:8px;">💖 Hồi phục sinh lực: Máu còn lại + 30% (${restored}/${heroMaxHp} HP)</div>
        <button class="btn-result-close">TIẾP TỤC</button>
      `;
    } else {
      const curState = game.getState();
      const heroMaxHp = maxHp(curState);
      const restored = result.restoredHp ?? Math.round(heroMaxHp * 0.3);
      curState.hp = restored;
      game.updateHud?.();

      let loseReason = `Bạn đã bị ${oppName} đánh bại trong trận quyết đấu.`;
      if (result.forfeit) {
        if (result.reason === 'house') {
          loseReason = `Bạn đã bỏ chạy vào nhà nên bị xử thua cuộc!`;
        } else if (result.reason === 'safe_zone') {
          loseReason = `Bạn đã bỏ chạy về nơi an toàn nên bị xử thua cuộc!`;
        } else {
          loseReason = `Bạn đã rời khỏi trận đấu nên bị xử thua!`;
        }
      }
      card.innerHTML = `
        <div class="duel-result-icon">💀</div>
        <h2 class="duel-result-title loss">THẤT BẠI TRONG QUYẾT ĐẤU!</h2>
        <p class="duel-result-sub">${loseReason}</p>
        <div class="duel-safe-box">🛡️ Mất ${result.bet ? result.bet.toLocaleString() : 0} Vàng tiền cược.<br>Toàn bộ trang bị và ba lô được BẢO TOÀN 100%! Đã hồi phục lại 30% máu (${restored}/${heroMaxHp} HP).</div>
        <button class="btn-result-close">ĐỒNG Ý</button>
      `;
    }

    card.querySelector('button')!.onclick = () => {
      duelResultModal.style.display = 'none';
    };

    duelResultModal.replaceChildren(card);
  }

  let inviteCountdownTimer: any = null;
  function showDuelInvite(invite: { fromId: string; fromName: string; fromLevel: number; bet: number; timeout: number }) {
    playDuelAlertTone();
    duelInviteBanner.style.display = 'block';
    if (inviteCountdownTimer) clearInterval(inviteCountdownTimer);

    let remain = invite.timeout || 15;
    const updateUi = () => {
      duelInviteBanner.innerHTML = `
        <div class="duel-invite-title">
          <span>⚔️ LỜI THÁCH ĐẤU SOLO 1V1</span>
          <span style="font-size:12px; color:#f87171;">⏳ ${remain}s</span>
        </div>
        <div class="duel-invite-msg">
          <b>${invite.fromName}</b> (Cấp ${invite.fromLevel}) thách đấu bạn vào Võ Đài La Mã!<br>
          Mức cược: <b>${invite.bet > 0 ? `${invite.bet.toLocaleString()} Vàng` : '🌿 Giao Hữu (0 Vàng)'}</b> (Tổng quỹ: <b>${(invite.bet * 2).toLocaleString()} Vàng</b>)
        </div>
        <div class="duel-invite-actions">
          <button class="btn-accept-duel">✅ CHẤP NHẬN CHIẾN</button>
          <button class="btn-decline-duel">❌ TỪ CHỐI</button>
        </div>
      `;

      duelInviteBanner.querySelector('.btn-accept-duel')?.addEventListener('click', () => {
        clearInterval(inviteCountdownTimer);
        duelInviteBanner.style.display = 'none';
        send({ type: 'duelAccept', fromId: invite.fromId });
      });

      duelInviteBanner.querySelector('.btn-decline-duel')?.addEventListener('click', () => {
        clearInterval(inviteCountdownTimer);
        duelInviteBanner.style.display = 'none';
        send({ type: 'duelDecline', fromId: invite.fromId });
      });
    };

    updateUi();
    inviteCountdownTimer = setInterval(() => {
      remain--;
      if (remain <= 0) {
        clearInterval(inviteCountdownTimer);
        duelInviteBanner.style.display = 'none';
        send({ type: 'duelDecline', fromId: invite.fromId });
      } else {
        updateUi();
      }
    }, 1000);
  }

  function connect(){
    if(!account||stopped)return;releaseChat();chatReady=false;refreshChatControls();let desiredParty=party,restoring=false,fallbackJoin:any=null;const desiredPlanet=game.getPresence().planet;const socketUrl=new URL(`${serviceBase}socket`,location.href);socketUrl.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(socketUrl);
    const connection=socket;
    function joined(message:any){
      if(desiredParty&&message.party!==desiredParty){if(!restoring){restoring=true;fallbackJoin=message;sendRoom({type:'join',planet:desiredPlanet,party:desiredParty});}return;}
      const nextRoom=typeof message.room==='string'?message.room:`${message.party||'public'}:${message.planet}`;if(chatRoom!==nextRoom)clearChat(nextRoom);chatReady=true;
      desiredParty=null;restoring=false;if(visiting)game.setVisiting(null);players.clear();for(const player of message.players||[])players.set(player.id,player);party=message.party;planet=message.planet;visiting=typeof message.visiting==='string'?message.visiting:null;
      // A visit changes the room, never the owner's saved adventure planet.
      if(message.enemies?.length)world().applyEnemySnapshots(message.enemies);game.clearNetworkDrops();const dropEpoch=++roomEpoch;void api<{drops:NetworkDrop[]}>('drops').then(result=>{if(socket===connection&&roomEpoch===dropEpoch&&chatRoom===nextRoom&&!visiting&&account)for(const drop of result.drops||[])if(drop.room===nextRoom)game.spawnNetworkDrop(drop,account.id);}).catch(()=>{});if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);renderPlayers();status=party?'Party {code}':'Online';refreshButton();if(dialog.open)render();else refreshChatControls();
    }
    socket.addEventListener('open',()=>{if(socket!==connection)return;status='Online';refreshButton();send({type:'active',active:!document.hidden});send({type:'eventStatus'});void flushSave();});
    socket.addEventListener('message',event=>{
      if(socket!==connection)return;let message:any;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){friends=message.friends||[];requests=message.requests||[];}
      else if(message.type==='pong'){currentPing=Math.max(1,Date.now()-(Number(message.at)||Date.now()));}
      else if(message.type==='joined')joined(message);
      else if(message.type==='authority'){if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);}
      else if(message.type==='enter'||message.type==='pose'){if(message.player?.id)players.set(message.player.id,message.player);renderPlayers();}
      else if(message.type==='leave'){players.delete(message.id);renderPlayers();}
      else if(message.type==='enemies')world().applyEnemySnapshots(message.enemies);
      else if(message.type==='profile'&&message.authorityVersion===1&&message.profile&&message.revision>=revision){revision=message.revision;game.applyAuthoritativeState(message.profile);}
      else if(message.type==='enemyHealth')world().applyAuthoritativeEnemyHealth(message);
      else if(message.type==='defeat'&&account&&Array.isArray(message.by)&&message.by.includes(account.id)){
        const xp=message.xpById?.[account.id];
        if(Number.isFinite(xp)&&xp>0)game.applySharedKill(message.id,xp,!!message.boss,message.enemyType,message.eventId,message.x,message.z);
      }
      else if(message.type==='worldEventStatus'){eventBoss=message.active;refreshActivities();}
      else if(message.type==='worldEvent'){eventBoss=message.phase==='spawn'?message.boss:null;announce(message.message);if(Array.isArray(message.ranking))announce('🏆 Sát thương: '+message.ranking.slice(0,5).map((p:any,i:number)=>`${i+1}. ${p.name}: ${p.damage}`).join(' · '));refreshActivities();}
      else if(message.type==='duelInvite')showDuelInvite(message);
      else if(message.type==='duelPending')announce(`⚔️ Đang chờ ${message.toName} phản hồi lời thách đấu (${(message.bet||0).toLocaleString()} Vàng)...`);
      else if(message.type==='duelDeclined')announce(`❌ ${message.opponentName} đã từ chối lời thách đấu.`);
      else if(message.type==='duelExpired')announce(`⏳ Lời thách đấu với ${message.opponentName} đã hết hạn.`);
      else if(message.type==='arenaJoined'){
        const current=world();current.arenaActive=true;
        if(message.isDuel){
          isDuelActive=true;
          activeDuelOpponent={id:message.opponentId,name:message.opponentName||'Đối thủ'};
          duelSelfHp=message.hp;duelSelfMaxHp=message.maxHp;
          duelOppHp=message.maxHp;duelOppMaxHp=message.maxHp;
          duelPot=message.pot||0;
          if(playerCardDialog.open)playerCardDialog.close();
          duelInviteBanner.style.display='none';
          document.body.classList.add('has-active-duel');
          showDuelCountdown(()=>{
            updateDuelTopBarUi();
            duelTopBar.style.display='flex';
          });
        }else{
          current.position.x=message.spawnX;current.position.z=message.spawnZ;current.destination=null;current.route=[];
          announce('Đã vào võ đài! Bảo vệ 3 giây. Thua không mất đồ.');
        }
        refreshActivities();
      }
      else if(message.type==='arenaLeft'){
        world().arenaActive=false;world().arenaStunUntil=0;world().arenaTargets=[];
        isDuelActive=false;activeDuelOpponent=null;
        duelTopBar.style.display='none';
        document.body.classList.remove('has-active-duel');
        refreshActivities();
      }
      else if(message.type==='arenaControl'){world().arenaStunUntil=Date.now()+Math.max(0,Math.min(2000,message.duration||0));}
      else if(message.type==='arenaPosition'){if(world().arenaActive){world().position.x=message.x;world().position.z=message.z;}}
      else if(message.type==='arena'){
        arenaPlayers=message.players||[];
        if(isDuelActive&&account){
          const selfP=arenaPlayers.find(p=>p.id===account?.id);
          const oppP=arenaPlayers.find(p=>p.id===activeDuelOpponent?.id);
          if(selfP){duelSelfHp=selfP.hp;duelSelfMaxHp=selfP.maxHp;}
          if(oppP){duelOppHp=oppP.hp;duelOppMaxHp=oppP.maxHp;}
          updateDuelTopBarUi();
        }
        refreshActivities();
      }
      else if(message.type==='arenaHit'){
        duelSelfHp=message.hp;duelSelfMaxHp=message.maxHp;
        updateDuelTopBarUi();
        const s=game.getState();s.hp=message.hp;game.updateHud?.();
        world().hurtFeedback(message.damage);
      }
      else if(message.type==='arenaHitDealt'){
        duelOppHp=message.hp;duelOppMaxHp=message.maxHp;
        updateDuelTopBarUi();
        const oppRemote=world().remotePlayers?.get(message.targetId);
        if(oppRemote){
          world().burst?.(oppRemote.mesh.position.x,oppRemote.mesh.position.z,'#ef4444',8);
        }
      }
      else if(message.type==='arenaResult'){
        if(message.isDuel){
          showDuelResult(message);
        }else{
          announce(message.won?`🏆 Bạn thắng ${message.loser}!`:`Bạn thua ${message.winner}. Đồ và máu ngoài võ đài được giữ nguyên.`);
        }
      }
      else if(message.type==='environment')world().applyEnvironmentSnapshot(message.snapshot);
      else if(message.type==='gardenEvent'){
        if(message.blocked){
          const current=world(),farm=current.farmView;
          const target=()=>{if(world()!==current||current.farmView!==farm||current.planet!=='home'||!(visiting===message.ownerId||!visiting&&account?.id===message.ownerId))return null;const local=message.by===account?.id,thief=local?current.position:players.get(message.by);if(!thief||!Number.isFinite(thief.x)||!Number.isFinite(thief.z)||!local&&players.get(message.by)?.space!==`home:${message.ownerId}`)return null;return{x:thief.x!,z:thief.z!};};
          const thief=target();if(thief)farm?.guardBite(thief,target);
          if(message.by===account?.id)announce('The guard dog protected this garden. You lost {damage} HP.',{damage:message.damage||0});
        }
        else if(!message.blocked&&message.by===account?.id)announce('Crop collected. {count} visits left here today.',{count:message.remaining||0});
      }
      else if(message.type==='dropSpawn'&&message.drop)game.spawnNetworkDrop(message.drop,account!.id);
      else if(message.type==='dropClaimed')game.removeNetworkDrop(message.id);
      else if(message.type==='dropReleased')game.releaseNetworkDrop(message.id);
      else if(message.type==='healthResult')game.applyAuthorityHealth(message.delta||0,!!message.died);
      else if(message.type==='chatAck')acknowledgeChat(message.requestId,connection);
      else if(message.type==='chat'&&!restoring&&chatRoom){
        chat.push({name:String(message.name),message:String(message.message)});
        if(chat.length>60)chat.shift();
        if(dialog.open&&tab==='world')renderChat();
        
        const entry = el('div');
        const nameSpan = el('span', '', `${message.name}: `);
        nameSpan.style.color = '#a6eb63';
        entry.append(nameSpan, document.createTextNode(message.message));
        hudChatLog.append(entry);
        window.setTimeout(() => entry.remove(), 7000);

        game.showChatBubble?.(String(message.id), String(message.message));
      }
      else if(message.type==='friends'){friends=message.friends||[];requests=message.requests||[];if(dialog.open&&tab==='friends')render();}
      else if(message.type==='visit'){
        chatReady=true;refreshChatControls();visiting=message.home?.id||null;
        if(message.home){const home=message.home as Home;const state={...newGame(home.name,home.color),discovered:home.discovered??['home'],plots:home.plots,gear:home.gear,...(home.farm?{farm:home.farm}:{}),...(home.placed?{placed:home.placed}:{}),...(home.decorations?{decorations:home.decorations}:{}),...(home.helper?{helper:home.helper}:{}),...(home.friends?{friends:home.friends}:{})};game.setVisiting(home.name,state as SaveState);}
        else game.setVisiting(null);renderPlayers();announce(visiting?"Visiting {name}'s garden":'Back in your garden',{name:message.home?.name||''});if(dialog.open)render();
      }else if(message.type==='home'&&message.home?.id===visiting)game.setVisiting(message.home.name,{discovered:message.home.discovered,plots:message.home.plots,decorations:message.home.decorations,farm:message.home.farm,helper:message.home.helper,friends:message.home.friends} as Partial<SaveState>);
      else if(message.type==='effect'||message.type==='playerAction'){
        const local=game.getPresence(),space=visiting?`home:${visiting}`:local.planet==='home'&&Math.hypot(local.x,local.z)<18?`home:${account?.id}`:'wild';
        // A queued packet can arrive after we have entered a different home/interior.
        if(message.space!==space||message.planet!==local.planet||message.indoor!==((local.y??0)>=INDOOR_Y-10))return;
        if(message.type==='playerAction'){
          if(typeof message.by==='string'&&(message.action==='basic'||message.action==='skill'))world().playRemoteAction(message.by,message.action,message.index,message);
        }else if(message.visual)game.applyRemoteEffect(message.visual);
        else world().burst(message.x,message.z,message.color,8);
      }
      else if(message.type==='party'){party=message.code;announce('Party code: {code}',{code:party||''});if(dialog.open)render();}
      else if(message.type==='error'){if(chatMatches(message.requestId,connection))releaseChat();if(!message.requestId){chatReady=!!chatRoom&&connection.readyState===WebSocket.OPEN;refreshChatControls();}if(restoring&&fallbackJoin){desiredParty=null;restoring=false;joined(fallbackJoin);}if(message.status!==429||Date.now()>=rateNoticeAt){announce(message.message||'That action was unavailable.');if(message.status===429)rateNoticeAt=Date.now()+Math.max(1000,message.retryAfterMs||1000);}}
    });
    socket.addEventListener('close',event=>{
      if(socket!==connection)return;world().arenaActive=false;world().arenaTargets=[];activities.hidden=true;chatReady=false;releaseChat(chatAttempt?.pending?'Connection interrupted. Your chat draft is kept.':undefined);authority(null);world().clearRemotePlayers();players.clear();
      if(!account||stopped)return;if(event.code===4001){stopped=true;rejectActions('This online adventure is active in another tab.');if(saveTimer)clearTimeout(saveTimer);game.setPersistence(()=>{});status='Open in another tab';announce('This online adventure is active in another tab. Close it there, then reconnect here.');}
      else{status='Reconnecting';reconnect=window.setTimeout(connect,2500);const epoch=sessionEpoch;void api<Session>('auth/session').then(session=>{if(socket===connection&&sessionEpoch===epoch&&account&&!session.account)expireSession();}).catch(()=>{});}refreshButton();
    });
    socket.addEventListener('error',()=>{if(socket!==connection)return;chatReady=false;releaseChat(chatAttempt?.pending?'Connection interrupted. Your chat draft is kept.':undefined);status='Reconnecting';refreshButton();});
  }
  function begin(session:Session){
    if(!session.account||!session.profile)return;if(session.authorityVersion!==1){announce('This server needs the current game rules.');return;}sessionEpoch++;
    if(account?.id!==session.account.id){actionRetryAt=0;rateNoticeAt=0;rememberActions();rejectActions('Your session ended. Pending actions remain on this device.');clearChat();party=null;visiting=null;}
    const previous=socket;socket=null;previous?.close();if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);
    if(!account)offline=structuredClone(game.getState());account=session.account;friends=session.friends||[];requests=session.requests||[];stopped=false;
    revision=session.revision||0;try{const raw=localStorage.getItem(`cute-game-actions-${account.id}`),cached=raw?JSON.parse(raw):null;if(Array.isArray(cached))actionQueue=cached.filter(job=>job&&typeof job.requestId==='string'&&typeof job.type==='string'&&job.rulesVersion===1&&Number.isSafeInteger(job.expectedRevision)).slice(0,100);}catch{/* Keep this account's in-memory queue if storage is unavailable. */}
    game.setPersistence(queueSave);game.setActionHandler(queueAction);game.applyState(session.profile);connect();render();void flushSave();announce('Welcome, {name}. Your online adventure is ready.',{name:account.name});
  }
  const REMEMBER_AUTH_KEY = 'cute-game-remember-auth';
  const loginListeners: ((session: Session) => void)[] = [];
  async function signOut(){
    const originalEpoch=sessionEpoch;await flushSave();if(sessionEpoch!==originalEpoch)return;if(pendingSave()){announce('Your latest progress is still waiting to save. Reconnect before signing out.');return;}
    stopped=true;const epoch=sessionEpoch;
    try{await api('auth/logout',{});if(sessionEpoch!==epoch)return;}catch(error){if(sessionEpoch!==epoch)return;if((error as {status?:number}).status===401){expireSession();return;}stopped=false;announce((error as Error).message);return;}
    sessionEpoch++;
    try{localStorage.removeItem(REMEMBER_AUTH_KEY);}catch{}
    clearChat();stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);socket?.close();socket=null;account=null;host=null;party=null;visiting=null;players.clear();authority(null);world().clearRemotePlayers();
    for(const tag of overheadNametags.values())tag.root.remove(); overheadNametags.clear();
    game.setVisiting(null);game.setPersistence(null);game.setActionHandler(null);const state=offline||game.getOfflineState();if(state)game.applyState(state);setSaveStatus('● Saved on this device');status='Play together';refreshButton();render();announce('Your offline adventure is restored.');
  }
  async function reconnectOnline(){
    const epoch=++sessionEpoch;if(reconnect)clearTimeout(reconnect);stopped=true;const previous=socket;socket=null;previous?.close();
    try{const session=await api<Session>('auth/session');if(sessionEpoch!==epoch)return;if(!session.account){expireSession();return;}begin(session);}
    catch(error){if(sessionEpoch===epoch)announce((error as Error).message);}
  }
  function labeledInput(label:string,type='text',name=label){const wrapper=el('label','social-field',t(label));const input=el('input');input.type=type;input.name=name;input.required=true;wrapper.append(input);return{wrapper,input};}
  function personRow(person:Explorer,actions:HTMLElement[]){const row=el('div','social-person');const badge=el('span','social-avatar','●');badge.style.color=person.color;const name=el('span','',t('{name} · Lv {level}{online}',{name:person.name,level:person.level,online:person.online?t(' · online'):''}));row.append(badge,name,...actions);return row;}
  async function friendAction(action:string,id:string){try{const list=await api<{friends:Explorer[];requests:Explorer[]}>(`friends/${action}`,{id});friends=list.friends;requests=list.requests;render();}catch(error){announce((error as Error).message);}}
  function renderChat(){const log=content.querySelector('.social-chat-log');if(!log)return;log.replaceChildren(...chat.slice(-30).map(entry=>{const line=el('p');line.append(el('strong','',entry.name+': '),document.createTextNode(entry.message));return line;}));log.scrollTop=log.scrollHeight;}
  function render(){
    captureChatDraft();content.replaceChildren();tabs.replaceChildren();authSubmit=null;setNotice('');heading.textContent=t(account?'Your online world':'Play together');
    if(!account){
      content.append(el('p','social-intro',t('Make a home, meet friends, and explore the same world. Your offline adventure stays saved separately.')));
      const form=el('form','social-auth');const username=labeledInput('Username','text','username'),password=labeledInput('Password','password','password');username.input.autocomplete='username';username.input.pattern='[a-zA-Z0-9_]{3,24}';username.input.minLength=3;username.input.maxLength=24;password.input.autocomplete=register?'new-password':'current-password';password.input.minLength=8;password.input.maxLength=128;
      form.append(username.wrapper,password.wrapper);let display:HTMLInputElement|undefined;
      if(register){const name=labeledInput('Explorer name','text','display-name');name.input.maxLength=20;name.input.value=game.getState().name;display=name.input;form.append(name.wrapper);}
      const rememberLabel=el('label','social-remember-label');
      const rememberCheck=el('input');rememberCheck.type='checkbox';rememberCheck.name='remember';rememberCheck.checked=true;
      rememberLabel.append(rememberCheck,document.createTextNode(' '+t('Ghi nhớ tài khoản (Tự động đăng nhập lần sau)')));
      form.append(rememberLabel);
      const submit=el('button','social-primary',t(register?'Create online adventure':'Sign in'));submit.type='submit';submit.disabled=authBusy;authSubmit=submit;form.append(submit);
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(authBusy)return;authBusy=true;submit.disabled=true;
        try{
          const uVal=username.input.value.trim(),pVal=password.input.value;
          const session=await api<Session>(`auth/${register?'register':'login'}`,{username:uVal,password:pVal,name:display?.value,color:game.getState().color});
          if(rememberCheck.checked){
            try{localStorage.setItem(REMEMBER_AUTH_KEY,JSON.stringify({username:uVal,password:pVal}));}catch{}
          }else{
            try{localStorage.removeItem(REMEMBER_AUTH_KEY);}catch{}
          }
          begin(session);
          dialog.close();
          for(const cb of loginListeners)cb(session);
        }catch(error){setNotice((error as Error).message);}
        finally{authBusy=false;submit.disabled=false;if(authSubmit)authSubmit.disabled=false;}
      });
      content.append(form,button(register?'Already have an account? Sign in':'New here? Create an adventure',()=>{register=!register;render();},'social-link'),el('p','social-small',t('Accounts are stored on this game server. No email address is needed.')));return;
    }
    for(const [id,label]of [['world','🌍 World'],['friends',`${t('👥 Friends')}${requests.length?` (${requests.length})`:''}`],['account','🏡 Account']]as const){const item=button(label,()=>{tab=id;render();});item.setAttribute('aria-pressed',String(tab===id));tabs.append(item);}
    if(tab==='world'){
      content.append(el('p','social-intro',t(visiting?'Tap a ripe crop to try collecting it. A guard dog protects this garden if one lives here.':party?'Private party · {code}':'Public world · meet explorers outside your garden',{code:party||''})));
      const actions=el('div','social-actions');actions.append(button('Create private party',()=>sendRoom({type:'party'})),button('Return to public world',()=>sendRoom({type:'join',planet:game.getState().planet})));if(visiting)actions.append(button('Return to my garden',()=>send({type:'leaveVisit'})));else actions.append(button('Share nearby loot',()=>void shareNearbyLoot()));content.append(actions);
      const join=el('form','social-inline'),code=el('input');code.placeholder=t('Party code');code.setAttribute('aria-label',t('Party code'));code.name='party-code';code.maxLength=6;const submit=el('button','',t('Join party'));submit.type='submit';join.append(code,submit);join.addEventListener('submit',event=>{event.preventDefault();sendRoom({type:'join',planet:game.getState().planet,party:code.value.trim()});});content.append(join);
      const roster=el('div','social-roster');roster.append(el('h3','',t('Explorers in this world ({count})',{count:players.size})));for(const player of players.values())roster.append(personRow(player,player.id===account.id?[]:[button('View explorer',()=>openPlayer(player.id))]));content.append(roster);
      const log=el('div','social-chat-log');log.setAttribute('role','log');log.setAttribute('aria-label',t('World chat'));content.append(log);renderChat();
      const chatForm=el('form','social-inline'),input=el('input','social-chat-input');input.placeholder=t('Say hello…');input.setAttribute('aria-label',t('Chat message'));input.name='world-chat';input.maxLength=160;input.value=chatDraft;input.addEventListener('input',()=>{chatDraft=input.value;});const chatButton=el('button','social-chat-send',t('Send'));chatButton.type='submit';chatForm.append(input,chatButton);chatForm.addEventListener('submit',event=>{event.preventDefault();submitChat();});content.append(chatForm);refreshChatControls();
    }else if(tab==='friends'){
      const add=el('form','social-inline'),input=el('input');input.placeholder=t('Friend’s username');input.setAttribute('aria-label',t('Friend username'));input.name='friend-username';input.maxLength=24;const submit=el('button','',t('Send request'));submit.type='submit';add.append(input,submit);add.addEventListener('submit',async event=>{event.preventDefault();try{await api('friends/request',{username:input.value});announce('Friend request sent.');input.value='';}catch(error){announce((error as Error).message);}});content.append(add);
      if(requests.length){content.append(el('h3','',t('Friend requests')));for(const friend of requests)content.append(personRow(friend,[button('Accept',()=>void friendAction('accept',friend.id)),button('Decline',()=>void friendAction('decline',friend.id))]));}
      content.append(el('h3','',t('Your friends')));if(!friends.length)content.append(el('p','social-small',t('Add a friend by username to visit each other’s gardens.')));
      for(const friend of friends)content.append(personRow(friend,[button('Visit garden',()=>{sendRoom({type:'visit',id:friend.id});dialog.close();}),button('Remove friend',()=>void friendAction('remove',friend.id),'social-link')]));
    }else{
      content.append(el('h3','',account.name),el('p','',t('Username: {username}',{username:account.username||''})),el('p','social-small',t('Your progress saves to this server. Returning to offline play restores the adventure you left there.')),button('Save now',async()=>{queueSave(game.getState());await flushSave();if(account)announce(pendingSave()?'Save pending. Please keep this page open.':'Online adventure saved.');}),button('Reconnect',reconnectOnline),button('Sign out and play offline',()=>void signOut(),'social-primary'));
    }
  }
  game.onFrame(dt=>{
    fpsFrames++; fpsAccum += dt;
    if(fpsAccum >= 0.5){
      currentFps = Math.max(1, Math.round(fpsFrames / fpsAccum));
      fpsFrames = 0; fpsAccum = 0;
      if(hudPerf){
        const dot = currentFps >= 45 ? '🟢' : currentFps >= 25 ? '🟡' : '🔴';
        const pingColor = currentPing > 120 ? '#ef4444' : currentPing > 60 ? '#f59e0b' : '#38bdf8';
        const pingVal = socket?.readyState === WebSocket.OPEN && account ? `<span style="color:${pingColor}">${currentPing || 1}ms</span>` : '<span style="color:#94a3b8">Offline</span>';
        hudPerf.innerHTML = `${dot} <b>${currentFps} FPS</b> <span style="opacity:0.35">|</span> Ping: ${pingVal}`;
      }
    }
    activitiesClock+=dt;if(activitiesClock>=.1){activitiesClock=0;refreshActivities();}
    if(arenaView&&game.getPresence().planet===ARENA.planet)arenaView.update(dt,!!world().arenaActive,world());

    // Update Overhead Name Tags for Local & Remote Players
    const activeIds = new Set<string>();
    const w = world();
    
    // 1. Local Player Name Tag
    if (account || game.getState()) {
      const localId = account?.id || 'local';
      activeIds.add(localId);
      let tag = overheadNametags.get(localId);
      if (!tag) {
        const root = el('div', 'player-nametag');
        const badge = el('div', 'player-nametag-badge');
        const hpBar = el('div', 'player-nametag-hp');
        const hpFill = el('div', 'player-nametag-hp-fill');
        hpBar.append(hpFill);
        root.append(badge, hpBar);
        playerNametagsLayer.append(root);
        tag = { root, badge, hpBar, hpFill };
        overheadNametags.set(localId, tag);
      }
      
      const localPos = w.position;
      const pt = localPos ? w.screen?.(localPos.x, (localPos.y || 0) + 2.1, localPos.z) : null;
      if (pt?.front && pt?.visible) {
        tag.root.style.display = 'flex';
        tag.root.style.left = `${pt.x}px`;
        tag.root.style.top = `${pt.y}px`;
        const myName = account?.name || game.getState().name || 'Nhà thám hiểm';
        const myLevel = game.getState().level || 1;
        const dueling = isDuelActive || (w.arenaActive && !!activeDuelOpponent);
        if (dueling) {
          tag.root.classList.add('dueling');
          tag.badge.textContent = `⚔️ ${myName}`;
          const pct = Math.max(0, Math.min(100, Math.round((duelSelfHp / Math.max(1, duelSelfMaxHp)) * 100)));
          tag.hpFill.style.width = `${pct}%`;
        } else {
          tag.root.classList.remove('dueling');
          tag.badge.textContent = `🧙 ${myName} · Lv.${myLevel}`;
        }
      } else {
        tag.root.style.display = 'none';
      }
    }

    // 2. Remote Players Name Tags
    const remotes = (w.remotePlayers instanceof Map ? w.remotePlayers : []);
    for (const [id, remote] of remotes) {
      if (!remote?.mesh?.visible) continue;
      activeIds.add(id);
      let tag = overheadNametags.get(id);
      if (!tag) {
        const root = el('div', 'player-nametag');
        const badge = el('div', 'player-nametag-badge');
        const hpBar = el('div', 'player-nametag-hp');
        const hpFill = el('div', 'player-nametag-hp-fill');
        hpBar.append(hpFill);
        root.append(badge, hpBar);
        playerNametagsLayer.append(root);
        tag = { root, badge, hpBar, hpFill };
        overheadNametags.set(id, tag);
      }

      const rx = remote.mesh.position?.x ?? remote.pose?.x ?? 0;
      const ry = remote.mesh.position?.y ?? remote.pose?.y ?? 0;
      const rz = remote.mesh.position?.z ?? remote.pose?.z ?? 0;
      const pt = w.screen?.(rx, ry + 2.1, rz);
      if (pt?.front && pt?.visible) {
        tag.root.style.display = 'flex';
        tag.root.style.left = `${pt.x}px`;
        tag.root.style.top = `${pt.y}px`;
        const oppData = players.get(id);
        const oppName = oppData?.name || remote.pose.name || 'Người chơi';
        const oppLevel = oppData?.level || remote.pose.level || 1;
        const isThisOppDueled = (isDuelActive && id === activeDuelOpponent?.id) || arenaPlayers.some(p => p.id === id && p.isDuel);
        if (isThisOppDueled) {
          tag.root.classList.add('dueling');
          tag.badge.textContent = `⚔️ ${oppName}`;
          let curHp = duelOppHp, maxH = duelOppMaxHp;
          if (id !== activeDuelOpponent?.id) {
            const arenaP = arenaPlayers.find(p => p.id === id);
            if (arenaP) { curHp = arenaP.hp; maxH = arenaP.maxHp; }
          }
          const pct = Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxH)) * 100)));
          tag.hpFill.style.width = `${pct}%`;
        } else {
          tag.root.classList.remove('dueling');
          tag.badge.textContent = `🧙 ${oppName} · Lv.${oppLevel}`;
        }
      } else {
        tag.root.style.display = 'none';
      }
    }

    // Clean up nametags of players no longer present
    for (const [id, tag] of overheadNametags) {
      if (!activeIds.has(id)) {
        tag.root.remove();
        overheadNametags.delete(id);
      }
    }

    if(!account||socket?.readyState!==WebSocket.OPEN)return;
    if(Date.now() - lastPingAt > 2500){
      lastPingAt = Date.now();
      send({type:'ping',at:lastPingAt});
    }
    poseClock+=dt;enemyClock+=dt;const presence=game.getPresence();
    if(!visiting&&presence.planet!==planet){game.setVisiting(null);planet=presence.planet;sendRoom({type:'join',planet,party});return;}
    const isMoving = !!presence.moving;
    const moved = !lastSentPose || Math.abs(presence.x - lastSentPose.x) > 0.05 || Math.abs(presence.z - lastSentPose.z) > 0.05 || Math.abs((presence.facing || 0) - (lastSentPose.facing || 0)) > 0.1 || isMoving !== lastSentPose.moving;
    const poseInterval = (isMoving || moved) ? 0.1 : 1.5;
    if(poseClock>=poseInterval){
      poseClock=0;
      lastSentPose = { x: presence.x, y: presence.y, z: presence.z, facing: presence.facing, moving: isMoving };
      send({type:'pose',...presence});
      renderPlayers();
    }
    // The elected browser supplies AI positions/telegraphs; the server replaces HP,
    // damage and rewards with canonical combat values before relaying the snapshot.
    if(host===account.id&&enemyClock>=.15){enemyClock=0;send({type:'enemies',enemies:world().enemySnapshots()});}
  });
  game.onAction(action=>{if(!account)return;if(action.kind==='basic')send({type:'basic',targetId:action.targetId,requestId:requestId()});else if(action.kind==='skill')send({type:'skill',index:action.index,requestId:requestId()});});
  document.addEventListener('visibilitychange',()=>{send({type:'active',active:!document.hidden});if(document.hidden)void flushSave();});
  window.addEventListener('pagehide',rememberActions);
  onLanguageChange(()=>{
    // Keep partially typed credentials and chat drafts while relabeling an open menu.
    const drafts=Array.from(content.querySelectorAll<HTMLInputElement>('input')).map(input=>({name:input.name,value:input.value,focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd}));
    const previousNotice=noticeSource,previousParams=noticeParams;refreshButton();
    if(dialog.open){
      render();
      for(const draft of drafts){const input=Array.from(content.querySelectorAll<HTMLInputElement>('input')).find(node=>node.name===draft.name);if(input){input.value=draft.value;if(draft.focused){input.focus();if(draft.start!==null&&draft.end!==null)input.setSelectionRange(draft.start,draft.end);}}}
      setNotice(previousNotice,previousParams);
    }
    if(saveStatusSource)setSaveStatus(saveStatusSource);
  });
  refreshButton();
  const initialEpoch=sessionEpoch;
  const savedAuth=(()=>{
    try{
      const raw=localStorage.getItem(REMEMBER_AUTH_KEY);
      return raw?JSON.parse(raw):null;
    }catch{return null;}
  })();

  const autoLoginPromise:Promise<boolean>=(async()=>{
    try{
      const session=await api<Session>('auth/session');
      if(sessionEpoch===initialEpoch&&session.account){
        begin(session);
        for(const cb of loginListeners)cb(session);
        return true;
      }
    }catch{}
    if(savedAuth?.username&&savedAuth?.password){
      try{
        const session=await api<Session>('auth/login',{
          username:savedAuth.username,
          password:savedAuth.password
        });
        if(sessionEpoch===initialEpoch&&session.account){
          begin(session);
          for(const cb of loginListeners)cb(session);
          return true;
        }
      }catch{
        try{localStorage.removeItem(REMEMBER_AUTH_KEY);}catch{}
      }
    }
    return false;
  })();

  return {
    openDialog:()=>{
      render();
      if(!dialog.open)dialog.showModal();
    },
    closeDialog:()=>{
      if(dialog.open)dialog.close();
    },
    isLoggedIn:()=>account!==null,
    getAccount:()=>account,
    hasSavedAuth:()=>Boolean(savedAuth?.username&&savedAuth?.password),
    onLogin:(cb:(session:Session)=>void)=>{
      loginListeners.push(cb);
    },
    autoLoginPromise
  };
}
