import {INDOOR_Y} from '../src/house.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {newGame,parseSave} from '../src/model.ts';
import {VI_ONLINE} from '../src/locales/vi-online.ts';
import {gameplayKey} from '../src/gameplay-controls.ts';
import {ARENA,inArena} from '../src/world-events.ts';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();this.dataset={};this.classList={add(){}};this.open=false;this.style={};this.value='';this.selectionStart=null;this.selectionEnd=null;}
  append(...children){this.children.push(...children);}
  prepend(...children){this.children.unshift(...children);}
  closest(){return ['input','textarea','select'].includes(this.tagName)?this:null;}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(name,value){this.attributes.set(name,value);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  querySelectorAll(selector){return elements(this).slice(1).filter(node=>selector==='input'?node.tagName==='input':selector.startsWith('.')?node.className===selector.slice(1):false);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){this.ownerDocument.activeElement=this;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  click(){return this.listeners.get('click')?.({target:this});}
}
const elements=root=>[root,...root.children.flatMap(elements)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const source=(await readFile(new URL('../src/online.ts',import.meta.url),'utf8')).replace(/^import '\.\/[^']+\.css';\r?$/gm,'').replaceAll('import.meta.env',JSON.stringify({VITE_STATIC_HOST:'false',BASE_URL:'/'}));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sessionFor=(id='alice',revision=0)=>{const profile=newGame(id);return {authorityVersion:1,account:{id,username:id,name:id,color:profile.color,gear:{},level:1},profile,revision,friends:[],requests:[]};};

async function createFixture({responseFor}={}){
  let session=sessionFor('alice',0),state=newGame('Offline'),language='en',timerId=0;
  const document=new Element(),window=new Element(),body=new Element(),slot=new Element(),timers=new Map(),sockets=[],requests=[],notices=[],storage=new Map();
  document.body=body;document.createElement=tag=>Object.assign(new Element(tag),{ownerDocument:document});document.createTextNode=textContent=>Object.assign(new Element('text'),{textContent});document.querySelector=selector=>selector==='#social-slot'?slot:null;
  const setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout=id=>timers.delete(id);
  window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;
  const i18n={t:(text,params={})=>(language==='vi'?VI_ONLINE[text]||text:text).replace(/\{(\w+)\}/g,(match,key)=>key in params?String(params[key]):match),onLanguageChange:()=>()=>({}),get language(){return language;}};
  class Socket extends Element {
    static OPEN=1;readyState=1;sent=[];
    constructor(url){super();this.url=String(url);sockets.push(this);}
    send(raw){this.sent.push(JSON.parse(raw));}
    message(data){this.listeners.get('message')?.({data:JSON.stringify(data)});}
    close(code=1000){this.readyState=3;this.listeners.get('close')?.({code});}
  }
  const world=new Proxy({arenaActive:false,arenaTargets:[],position:{x:0,z:0}},{get:(object,key)=>Reflect.get(object,key)??(()=>{})});
  const bridge={getState:()=>state,getPresence:()=>({planet:state.planet,x:0,z:0}),getWorld:()=>world,getOfflineState:()=>newGame('Offline'),setPersistence(){},setActionHandler(fn){this.perform=fn;},applyAuthoritativeState(value){state=value;},clearNetworkDrops(){},spawnNetworkDrop(){},removeNetworkDrop(){},releaseNetworkDrop(){},applyAuthorityHealth(){},setNetworkHooks(){},applyState:value=>{state=value;},showNotice:text=>notices.push(text),setVisiting(){},onFrame(fn){this.frame=fn;},onAction(fn){this.action=fn;}};
  const exports={};
  vm.runInNewContext(compiled,{
    exports,document,window,clearTimeout,setTimeout,URL,structuredClone,crypto:{randomUUID},
    location:{href:'https://game.example/',protocol:'https:'},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    WebSocket:Socket,
    require:name=>name==='./world-events.ts'?{ARENA,inArena}:name==='./house.ts'?{INDOOR_Y}:name==='./i18n.ts'?i18n:name==='./gameplay-controls.ts'?{gameplayKey}:{newGame,parseSave},
    fetch:async(url,options)=>{
      requests.push({url,options});
      const response=await responseFor?.(url,options,session);
      if(response)return response;
      return {ok:true,json:async()=>url.includes('/auth/')?structuredClone(session):url.endsWith('/actions')?{ok:true,authorityVersion:1,profile:structuredClone(session.profile),revision:++session.revision,result:true}:{ok:true}};
    }
  });
  exports.initOnline(bridge);
  await flush();
  slot.children[0].click();
  const socket=sockets.at(-1);
  socket.message({type:'joined',host:session.account.id,planet:'home',party:null,room:'public:home',players:[session.account]});
  return {bridge,requests,session,storage,setSession(s){session=s;}};
}

test('launch action recovers from 409 revision conflict by fetching fresh session and retrying with updated expectedRevision',async()=>{
  let actionCount=0;
  const app=await createFixture({
    responseFor:async(url,options,session)=>{
      if(url.endsWith('/actions')){
        actionCount++;
        const body=JSON.parse(options.body);
        if(actionCount===1){
          // Server had advanced to revision 1, so expectedRevision: 0 conflicts with 409
          session.revision=1;
          return {ok:false,status:409,json:async()=>({message:'Revision conflict'})};
        }
        // Second attempt with fresh expectedRevision: 1 succeeds
        assert.equal(body.expectedRevision,1,'Retried launch action must use fresh expectedRevision 1');
        session.revision=2;
        return {ok:true,status:200,json:async()=>({ok:true,authorityVersion:1,profile:structuredClone(session.profile),revision:2,result:true})};
      }
      if(url.includes('/auth/session')){
        return {ok:true,status:200,json:async()=>structuredClone(session)};
      }
    }
  });

  const launchResult=await app.bridge.perform({type:'launch'});
  assert.ok(launchResult,'Launch action must resolve successfully instead of hanging');
  assert.equal(launchResult.revision,2);

  const actionRequests=app.requests.filter(r=>r.url.endsWith('/actions'));
  assert.equal(actionRequests.length,2);
  const revisions=actionRequests.map(r=>JSON.parse(r.options.body).expectedRevision);
  assert.deepEqual(revisions,[0,1]);
});

test('unrecoverable 409 without revision bump rejects the pending action and does not loop infinitely',async()=>{
  let actionCount=0;
  const app=await createFixture({
    responseFor:async(url,options,session)=>{
      if(url.endsWith('/actions')){
        actionCount++;
        return {ok:false,status:409,json:async()=>({message:'Permanent conflict'})};
      }
      if(url.includes('/auth/session')){
        // Returns the same revision 0
        return {ok:true,status:200,json:async()=>structuredClone(session)};
      }
    }
  });

  await assert.rejects(
    async()=>await app.bridge.perform({type:'launch'}),
    (error)=>error.status===409
  );
  assert.equal(actionCount,1,'Should not loop infinitely on non-advancing 409');
});
