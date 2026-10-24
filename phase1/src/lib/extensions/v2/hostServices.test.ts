import {test} from 'node:test';
import assert from 'node:assert/strict';
import example from '../contracts/v2/example.json';
import {validateManifestV2,type ManifestV2} from '../manifestV2';
import {type BrokerPolicy} from '../broker';
import {ExtensionSupervisor,type RuntimeTransport,type RuntimeFactory} from '../supervisor';
import {type ActivationContext} from '../activation';
import {type HostCapabilities} from './compatibility';
import {type Json,type ProjectChange,type SelectionSnapshot} from '../contracts/v2/api';
import {appStoreServices,type StoreAdapter} from './hostServices';
import {createV2ReadOnlyHost} from './host';

function mockStore(initial:{files:Record<string,string>;nodes?:unknown[];designFile?:string;selectedElementId?:string|null}) {
 const state={files:{...initial.files},nodes:initial.nodes??[],designFile:initial.designFile??'index.html',selectedElementId:initial.selectedElementId??null};
 const listeners=new Set<()=>void>();
 const store:StoreAdapter={getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 return {store,state,fire:()=>{for(const fn of [...listeners])fn();}};
}
function mockStorage():Storage {
 const data=new Map<string,string>();
 return {get length(){return data.size;},clear:()=>data.clear(),getItem:k=>data.get(k)??null,key:i=>[...data.keys()][i]??null,removeItem:k=>{data.delete(k);},setItem:(k,v)=>{data.set(k,String(v));}};
}
const sink=()=>{const events:{callbackId:number;value:Json;kind:string}[]=[];return {events,deliver(callbackId:number,value:Json,kind:'project'|'selection'|'panel'){events.push({callbackId,value,kind});}};};
const settle=()=>new Promise(r=>setTimeout(r,0));

test('readFile/listFiles carry full sha-256 revisions, stable per content, changing on edit',async()=>{
 const {store,state,fire}=mockStore({files:{'index.html':'<p>a</p>','style.css':'body{}'}});
 const events=sink();
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events,storage:mockStorage()});
 const files=await s.listFiles(null as never);
 assert.equal(files.length,2);
 const html=files.find(f=>f.path==='index.html')!;
 assert.equal(html.language,'html');
 assert.match(html.revision,/^[0-9a-f]{64}$/);
 const again=(await s.readFile('index.html',null as never)).revision;
 assert.equal(again,html.revision,'unchanged content keeps its token');
 state.files['index.html']='<p>b</p>';fire();
 const changed=(await s.readFile('index.html',null as never)).revision;
 assert.notEqual(changed,html.revision,'edited content gets a new token');
 await assert.rejects(s.readFile('missing.html',null as never),{code:'E_INVALID_ARGUMENT'});
 s.dispose();
});

test('selection snapshot resolves node, document and revision; empty selection is null',async()=>{
 const nodes=[{id:'n1',tag:'div',children:[{id:'n2',tag:'span',children:[]}]}];
 const {store}=mockStore({files:{'index.html':'<p>a</p>'},nodes,selectedElementId:'n2'});
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events:sink(),storage:mockStorage()});
 const snap=await s.selection(null as never);
 assert.deepEqual({...snap!,revision:undefined},{nodeId:'n2',tag:'span',documentPath:'index.html',revision:undefined});
 assert.match(snap!.revision,/^[0-9a-f]{64}$/);
 const empty=appStoreServices({extensionId:'acme.word-count',store:mockStore({files:{},selectedElementId:null}).store,notify:()=>{},events:sink(),storage:mockStorage()});
 assert.equal(await empty.selection(null as never),null);
 s.dispose();empty.dispose();
});

test('v2 write path stays locked: commit always denies with E_PERMISSION_DENIED',async()=>{
 const {store}=mockStore({files:{}});
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events:sink(),storage:mockStorage()});
 await assert.rejects(s.commit({baseRevisions:{},operations:[]},null as never),{code:'E_PERMISSION_DENIED',message:/v2 write path stays locked/});
 s.dispose();
});

test('storage roundtrip is namespaced and capped like the v1 host',async()=>{
 const {store}=mockStore({files:{}});
 const local=mockStorage();
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events:sink(),storage:local});
 await s.storage.set('k','v',null as never);
 assert.equal((await s.storage.entries())['k'],'v');
 assert.equal(local.getItem('other-ext.k'),null);
 await s.storage.delete('k',null as never);
 assert.deepEqual(await s.storage.entries(),{});
 s.dispose();
});

test('project events deliver changed paths with fresh revisions; removed files carry none',async()=>{
 const {store,state,fire}=mockStore({files:{'a.html':'1','b.html':'2'}});
 const events=sink();
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events});
 const off=s.subscribe('project',7);
 state.files['b.html']='2x';delete state.files['a.html'];fire();
 for(let i=0;i<20&&!events.events.length;i++)await settle();
 assert.equal(events.events.length,1);
 const change=events.events[0].value as unknown as ProjectChange;
 assert.deepEqual([...change.paths].sort(),['a.html','b.html']);
 assert.equal(change.revisions['a.html'],undefined,'removed file has no revision');
 assert.match(change.revisions['b.html'],/^[0-9a-f]{64}$/);
 off();s.dispose();
});

test('selection events throttle and coalesce to the latest snapshot',async()=>{
 const nodes=[{id:'n1',tag:'div',children:[]}];
 const {store,state,fire}=mockStore({files:{'index.html':'x'},nodes,selectedElementId:null});
 const events=sink();
 const s=appStoreServices({extensionId:'acme.word-count',store,notify:()=>{},events});
 s.subscribe('selection',3);
 state.selectedElementId='n1';fire();
 for(let i=0;i<20&&!events.events.length;i++)await settle();
 state.selectedElementId=null;state.selectedElementId='n1';fire();fire();
 await new Promise(r=>setTimeout(r,250));
 const snaps=events.events.filter(e=>e.kind==='selection').map(e=>e.value as unknown as SelectionSnapshot|null);
 assert.ok(snaps.length<=2,`coalesced, got ${snaps.length}`);
 assert.equal(snaps.at(-1)!.nodeId,'n1');
 s.dispose();
});

// --- Full chain through the supervisor: bundled fixture, mock transport, real services ---
const manifest=():ManifestV2=>{const r=validateManifestV2(example);assert.equal(r.ok,true);return (r as {ok:true;manifest:ManifestV2}).manifest;};
const host:HostCapabilities={somniaVersion:'12.3.0-beta.1',apiVersion:'2.0.0',protocolVersions:[1],runtimes:['js','wasm']};
const context:ActivationContext={interactive:true,studio:'code',languages:['html'],documentExtensions:['html'],hasProject:true,workspaceTrusted:true,virtualWorkspace:false,projectPaths:['index.html'],indexComplete:true};
const policy:BrokerPolicy={enabled:true,trusted:true,virtual:false,permissions:new Set(['commands','project.read','selection','ui.notify','storage'])};
const digest='a'.repeat(64);

test('supervisor chain: guest subscription receives live project events, disable stops delivery',async()=>{
 const sent:Json[]=[];
 const factory:RuntimeFactory=async bootstrap=>{
  const t:RuntimeTransport={onFrame:null,onError:null,terminate(){},send(m){
   sent.push(m as unknown as Json);
   if(!('method'in m))return;
   if(m.method==='bootstrap')queueMicrotask(()=>t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,method:'hello',params:{protocolVersions:[1],runtime:'js'}}));
   if(m.method==='activate')queueMicrotask(()=>{t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,method:'ready',params:{}});});
  }};
  return t;
 };
 const {store,state,fire}=mockStore({files:{'index.html':'<p>a</p>'}});
 const h=createV2ReadOnlyHost({host,factory,context:()=>context,policy:()=>policy,store});
 const m=manifest();h.supervisor.install(m,digest);await h.supervisor.enable(m.id);
 await h.supervisor.event({type:'command',value:'acme.word-count.count'});
 assert.equal(h.supervisor.state(m.id),'active','lazy activation via matching command event');
 // emulate the guest subscription call that arrives over the transport
 const broker=(h.supervisor as never as {sessions:Map<string,{broker:{call:(m:string,p:unknown,s:AbortSignal)=>Promise<unknown>}}>}).sessions.get(m.id)!.broker;
 await broker.call('project.onDidChange',{callbackId:9},new AbortController().signal);
 state.files['index.html']='<p>b</p>';fire();
 for(let i=0;i<20&&!sent.some(f=>(f as {method?:string}).method==='event');i++)await settle();
 const event=sent.find(f=>(f as {method?:string}).method==='event') as unknown as {method:string;params:{callbackId:number;value:ProjectChange}};
 assert.equal(event.params.callbackId,9);
 assert.deepEqual(event.params.value.paths,['index.html']);
 assert.match(event.params.value.revisions['index.html'],/^[0-9a-f]{64}$/);
 h.supervisor.disable(m.id);
 const before=sent.length;
 state.files['index.html']='<p>c</p>';fire();
 await new Promise(r=>setTimeout(r,50));
 assert.equal(sent.length,before,'no events after disable (revocation stops delivery)');
 h.dispose();
});
