import {test} from 'node:test';
import assert from 'node:assert/strict';
import example from '../contracts/v2/example.json';
import {validateManifestV2,type ManifestV2} from '../manifestV2';
import {ExtensionBroker,validateEdit,type BrokerServices,type BrokerPolicy} from '../broker';
import {ExtensionSupervisor,type RuntimeTransport,type RuntimeFactory} from '../supervisor';
import {matchesActivation,workspaceGlobMatches,ActivationQueue,type ActivationContext} from '../activation';
import {parseStrictJson,validateEnvelope,encodePipeFrame,PipeDecoder,type RpcEnvelope} from './rpc';
import {negotiateVersion,type HostCapabilities} from './compatibility';
import {ContributionRegistry,evaluateWhen,type ContributionSink} from '../contributions';
import {migrateLegacy} from '../legacy/migrate';
import {parseVersionedManifest,legacyApiAdapter} from '../legacy/adapter';
import {validateWasm} from './wasm';
const manifest=():ManifestV2=>{const r=validateManifestV2(example);assert.equal(r.ok,true);return (r as {ok:true;manifest:ManifestV2}).manifest;};
const host:HostCapabilities={somniaVersion:'11.3.0',apiVersion:'2.0.0',protocolVersions:[1],runtimes:['js','wasm']};
const context:ActivationContext={interactive:true,studio:'code',languages:['html'],documentExtensions:['html'],hasProject:true,workspaceTrusted:true,virtualWorkspace:false,projectPaths:['src/index.html'],indexComplete:true};
const policy:BrokerPolicy={enabled:true,trusted:true,virtual:false,permissions:new Set(['commands','project.read','project.write','selection','ui.notify','storage'])};
function services():BrokerServices {
 const data:Record<string,string>=Object.create(null);
 return {listFiles:async()=>[{path:'index.html',language:'html',revision:'1'}],readFile:async()=>({text:'test',revision:'1'}),selection:async()=>null,
 commit:async(_r,signal)=>{assert.equal(signal.aborted,false);return {transactionId:'tx',revisions:{'index.html':'2'}};},storage:{entries:async()=>({...data}),set:async(k,v)=>{data[k]=v;},delete:async k=>{delete data[k];}},notify:()=>{},postPanel:()=>{},subscribe:()=>()=>{}};
}
const frame=(generation=1,id=1):RpcEnvelope=>({protocolVersion:1,generation,id,method:'project.listFiles',params:{}});
test('strict JSON rejects duplicate/prototype keys, unsafe numbers, deep values',()=>{
 for(const value of ['{"id":1,"id":2}','{"__proto__":{}}','9007199254740992','1e309',Array(34).fill('[').join('')+'0'+Array(34).fill(']').join('')])assert.throws(()=>parseStrictJson(value));
 assert.deepEqual(JSON.parse(JSON.stringify(parseStrictJson('{"value":[true,null,"ok"]}'))),{value:[true,null,'ok']});
});
test('wire rejects identity spoofing, stale generations and dual result/error; pipe is incremental',()=>{
 assert.throws(()=>validateEnvelope({...frame(),extensionId:'evil'},1));assert.throws(()=>validateEnvelope(frame(2),1));assert.throws(()=>validateEnvelope({protocolVersion:1,generation:1,id:1,result:null,error:{}},1));
 const bytes=encodePipeFrame(frame());const decoder=new PipeDecoder();assert.equal(decoder.push(bytes.slice(0,5),1).length,0);assert.equal(decoder.push(bytes.slice(5),1).length,1);
 assert.throws(()=>new PipeDecoder().push(Uint8Array.of(255,255,255,255),1));
});
test('activation guards startup, current enable predicates, bounded workspace glob',()=>{
 const m={...manifest(),activationEvents:['onLanguage:html','workspaceContains:**/*.html']};assert.equal(matchesActivation(m,{type:'enable'},context),true);assert.equal(matchesActivation(m,{type:'enable'},{...context,interactive:false}),false);
 assert.equal(workspaceGlobMatches('**/*.html','index.html'),true);assert.equal(workspaceGlobMatches('src/*.html','src/a/b.html'),false);
 const workspace={...m,activationEvents:['workspaceContains:**/*.html']};assert.equal(matchesActivation(workspace,{type:'workspace'},{...context,indexComplete:false}),false);assert.equal(matchesActivation(workspace,{type:'workspace'},{...context,workspaceTrusted:false}),false);
});
test('launch queue has two slots, explicit command overtakes background',async()=>{
 const queue=new ActivationQueue();let active=0,max=0;const releases:(()=>void)[]=[];const order:string[]=[];
 const job=(label:string,user=false)=>queue.run(async()=>{active++;max=Math.max(max,active);order.push(label);await new Promise<void>(r=>releases.push(r));active--;},user);
 const a=job('a'),b=job('b'),c=job('background'),d=job('command',true);await new Promise(r=>setTimeout(r,0));releases.splice(0).forEach(r=>r());await new Promise(r=>setTimeout(r,0));assert.deepEqual(order,['a','b','command','background']);assert.equal(max,2);releases.splice(0).forEach(r=>r());await Promise.all([a,b,c,d]);
});
test('API and transport versions negotiated independently, proposals exact revision',()=>{
 assert.equal(negotiateVersion(manifest(),host).apiVersion,'2.0.0');assert.throws(()=>negotiateVersion(manifest(),{...host,apiVersion:'1.0.0'}));assert.throws(()=>negotiateVersion(manifest(),{...host,protocolVersions:[2]}));
 const m={...manifest(),proposedApis:[{id:'selection',revision:3}]};assert.throws(()=>negotiateVersion(m,host));assert.throws(()=>negotiateVersion(m,{...host,development:true,proposalOptIn:new Set([m.id]),proposals:{selection:2}}));
});
test('broker checks live revocation, trust and namespace; rejects undeclared methods',async()=>{
 let p=policy;const b=new ExtensionBroker(manifest(),()=>p,services());const signal=new AbortController().signal;
 assert.deepEqual(await b.call('project.readFile',{path:'index.html'},signal),{text:'test',revision:'1'});
 p={...policy,permissions:new Set()};await assert.rejects(b.call('project.readFile',{path:'index.html'},signal),{code:'E_PERMISSION_DENIED'});
 p={...policy,trusted:false};await assert.rejects(b.call('selection.get',{},signal),{code:'E_WORKSPACE_UNTRUSTED'});
 p=policy;await assert.rejects(b.call('panels.postMessage',{panelId:'evil.panel',message:null},signal));await assert.rejects(b.call('evil' as never,{} as never,signal));
 await assert.rejects(b.call('project.readFile',{path:'../secret'},signal));
});
test('all edit operations validated before commit; revisions required',()=>{
 assert.throws(()=>validateEdit({baseRevisions:{},operations:[{type:'setText',file:'index.html',nodeId:'n',text:'x'}]}));
 assert.throws(()=>validateEdit({baseRevisions:{'index.html':'1'},operations:[{type:'setText',file:'index.html',nodeId:'n',text:'x'},{type:'replaceSource',file:'index.html',source:'evil'}]}));
 assert.throws(()=>validateEdit({baseRevisions:{'index.html':'1'},operations:[{type:'move',file:'index.html',nodeId:'n',parentId:'p',beforeId:42}]}));
 assert.equal(validateEdit({baseRevisions:{'index.html':'1'},operations:[{type:'setText',file:'index.html',nodeId:'n',text:'x'}]}).operations.length,1);
});
test('storage is per broker, serialized and bounded, cancellation blocks queued mutation',async()=>{
 const m={...manifest(),permissions:['storage']};const b=new ExtensionBroker(m,()=>policy,services());const signal=new AbortController().signal;
 await b.call('storage.set',{key:'x',value:'yes'},signal);assert.equal(await b.call('storage.get',{key:'x'},signal),'yes');await b.call('storage.delete',{key:'x'},signal);assert.equal(await b.call('storage.get',{key:'x'},signal),null);
 await assert.rejects(b.call('storage.set',{key:'x',value:'x'.repeat(65537)},signal));const c=new AbortController();c.abort();await assert.rejects(b.call('storage.set',{key:'x',value:'no'},c.signal));
});
function runtimeFactory(options:{hang?:boolean;register?:boolean}={}) {
 const transports:RuntimeTransport[]=[];const factory:RuntimeFactory=async bootstrap=>{
  const t:RuntimeTransport={onFrame:null,onError:null,terminate(){terminated.add(t);},send(m){
   if(!('method'in m)||options.hang)return;
   if(m.method==='bootstrap')queueMicrotask(()=>t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,method:'hello',params:{protocolVersions:[1],runtime:'js'}}));
   if(m.method==='activate')queueMicrotask(()=>{
    if(options.register!==false)t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,id:700,method:'commands.register',params:{id:bootstrap.extensionId+'.count',callbackId:1}});
    t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,method:'ready',params:{}});
   });
   if(m.method==='command'&&'id'in m)queueMicrotask(()=>t.onFrame?.({protocolVersion:1,generation:bootstrap.generation,id:m.id,result:'done'}));
  }};transports.push(t);return t;
 };const terminated=new Set<RuntimeTransport>();return {factory,transports,terminated};
}
const digest='a'.repeat(64);
test('supervisor is lazy, concurrent commands join one launch; targeted disable advances generation',async()=>{
 const r=runtimeFactory();const s=new ExtensionSupervisor(host,r.factory,()=>context,()=>policy,services);s.install(manifest(),digest);await s.enable('acme.word-count');assert.equal(r.transports.length,0);
 const values=await Promise.all([s.runCommand('acme.word-count','acme.word-count.count'),s.runCommand('acme.word-count','acme.word-count.count')]);assert.deepEqual(values,['done','done']);assert.equal(r.transports.length,1);assert.equal(s.state('acme.word-count'),'active');const generation=s.generation('acme.word-count')!;
 s.disable('acme.word-count');assert.equal(r.terminated.size,1);assert.equal(s.generation('acme.word-count'),generation+1);await assert.rejects(s.runCommand('acme.word-count','acme.word-count.count'));
});
test('activation timeout kills host and faulted sessions do not auto-restart',async()=>{
 const r=runtimeFactory({hang:true});const s=new ExtensionSupervisor(host,r.factory,()=>context,()=>policy,services,()=>{},20);s.install(manifest(),digest);await s.enable('acme.word-count');await assert.rejects(s.runCommand('acme.word-count','acme.word-count.count'),{code:'E_TIMEOUT'});assert.equal(r.terminated.size,1);assert.equal(s.state('acme.word-count'),'faulted');await s.event({type:'command',value:'acme.word-count.count'});assert.equal(r.transports.length,1);s.dispose();
});
test('missing handler after activation is a typed error',async()=>{
 const r=runtimeFactory({register:false});const s=new ExtensionSupervisor(host,r.factory,()=>context,()=>policy,services);s.install(manifest(),digest);await s.enable('acme.word-count');await assert.rejects(s.runCommand('acme.word-count','acme.word-count.count'),{code:'E_HANDLER_MISSING'});s.dispose();
});
test('declarative extension never creates a host',async()=>{
 const r=runtimeFactory();const m={...manifest(),runtime:{type:'declarative' as const},activationEvents:[],contributes:{}};const s=new ExtensionSupervisor(host,r.factory,()=>context,()=>policy,services);s.install(m,digest);await s.enable(m.id);await s.event({type:'startup'});assert.equal(r.transports.length,0);s.dispose();
});
test('invalid asset means zero contributions, transaction failure rolls back',()=>{
 let begin=0,rollback=0;const sink:ContributionSink={validateAsset(c){if(c.family==='panels')throw Error('invalid panel');},begin(){begin++;return {stage(){},commit(){throw Error('commit failure');},rollback(){rollback++;}};}};
 const registry=new ContributionRegistry(sink);assert.throws(()=>registry.register(manifest(),{'panels/summary.json':new Uint8Array()}));assert.equal(begin,0);
 assert.throws(()=>registry.register({...manifest(),contributes:{commands:manifest().contributes.commands}},{}));assert.equal(rollback,1);
 assert.equal(evaluateWhen('hasProject && studio == "code"',{studio:'code',language:'html',hasProject:true,hasSelection:false,workspaceTrusted:true,isReadonly:false}),true);
});
test('legacy migration yields new TOML and assets, preserves literal snippet dollars; v1 adapter stays v1',()=>{
 const legacy={id:'acme.legacy',name:'Legacy',version:'1.0.0',apiVersion:1,permissions:['project.read' as const],contributes:{commands:[],panels:[],codeThemes:[],snippets:[{language:'html' as const,label:'Literal',body:'$1'}]}};
 const migration=migrateLegacy(legacy,{somniaRange:'>=11.0.0 <12.0.0',apiRange:'>=2.0.0 <3.0.0',license:'MIT',description:'Migrated legacy package'});assert.equal(JSON.parse(migration.files['snippets/snippet-0.json']).body,'\\$1');
 assert.equal(parseVersionedManifest(migration.files['somnia-extension.toml'],'somnia-extension.toml').lane,'v2');assert.equal(parseVersionedManifest(JSON.stringify(legacy),'somnia-extension.json').lane,'legacy');
 assert.throws(()=>legacyApiAdapter(legacy,{} as never,{renewedEnablement:false,lane:'local'}));
 const adapter=legacyApiAdapter(legacy,{files:()=>({'index.html':'text'}),selection:()=>null,notify(){},registerHandler(){}},{renewedEnablement:true,lane:'local'});assert.equal(adapter('project.readFile',['index.html']),'text');
});
test('bare Wasm refuses unbounded memory, WASI/imports and random content',()=>{
 assert.throws(()=>validateWasm(new Uint8Array()));assert.throws(()=>validateWasm(Uint8Array.of(0,97,115,109,1,0,0,0)));
});
function wasmFixture(max=2048,importModule='somnia',start=false):Uint8Array {
 const leb=(n:number)=>{const out:number[]=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;};
 const text=(s:string)=>[...leb(s.length),...new TextEncoder().encode(s)];
 const section=(id:number,body:number[])=>[id,...leb(body.length),...body];
 const body=(code:number[])=>[...leb(code.length+1),0,...code];
 return Uint8Array.from([0,97,115,109,1,0,0,0,
  ...section(1,[4,0x60,2,0x7f,0x7f,1,0x7f,0x60,1,0x7f,1,0x7f,0x60,2,0x7f,0x7f,0,0x60,0,1,0x7f]),
  ...section(2,[1,...text(importModule),...text('emit'),0,0]),...section(3,[4,1,2,3,0]),
  ...section(5,[1,1,1,...leb(max)]),
  ...section(7,[5,...text('memory'),2,0,...text('alloc'),0,1,...text('dealloc'),0,2,...text('init'),0,3,...text('dispatch'),0,4]),
  ...(start?section(8,[3]):[]),
  ...section(10,[4,...body([0x41,0,0x0b]),...body([0x0b]),...body([0x41,0,0x0b]),...body([0x41,0,0x0b])])]);
}
test('actual core Wasm fixture validates/compiles; unsafe memory, WASI and start reject before instantiation',async()=>{
 const bytes=wasmFixture();validateWasm(bytes);const module=await WebAssembly.compile(bytes.slice().buffer);const instance=await WebAssembly.instantiate(module,{somnia:{emit:()=>1}});assert.ok(instance.exports.memory instanceof WebAssembly.Memory);assert.equal((instance.exports.init as ()=>number)(),0);
 assert.throws(()=>validateWasm(wasmFixture(2049)));assert.throws(()=>validateWasm(wasmFixture(2048,'wasi_snapshot_preview1')));assert.throws(()=>validateWasm(wasmFixture(2048,'somnia',true)));
});
test('async launch cancelled while loading cannot resurrect a disabled session',async()=>{
 let finish!:(t:RuntimeTransport)=>void;let killed=0;
 const factory:RuntimeFactory=async()=>new Promise(resolve=>{finish=resolve;});const s=new ExtensionSupervisor(host,factory,()=>context,()=>policy,services,()=>{},30);s.install(manifest(),digest);await s.enable('acme.word-count');const command=s.runCommand('acme.word-count','acme.word-count.count');const rejected=assert.rejects(command,{code:'E_CANCELLED'});await new Promise(r=>setTimeout(r,0));s.disable('acme.word-count');finish({send(){},terminate(){killed++;},onFrame:null,onError:null});await rejected;await new Promise(r=>setTimeout(r,0));assert.ok(killed>=1);assert.equal(s.state('acme.word-count'),'disabled');
});
test('one extension policy change does not terminate another active host',async()=>{
 const r=runtimeFactory();const s=new ExtensionSupervisor(host,r.factory,()=>context,()=>policy,services);
 const m={...manifest(),id:'acme.second',contributes:{commands:[{id:'acme.second.count',title:'Count',category:'Tools'}]},activationEvents:['onCommand:acme.second.count']};s.install(manifest(),digest);s.install(m,'b'.repeat(64));await s.enable('acme.word-count');await s.enable(m.id);await s.event({type:'command',value:'acme.word-count.count'});await s.event({type:'command',value:'acme.second.count'});assert.equal(s.state(m.id),'active');s.policyChanged('acme.word-count');assert.equal(s.state(m.id),'active');assert.equal(r.terminated.size,1);s.dispose();
});
import {NativeContributionStore} from '../contributions';
import {createSomniaSdk} from './sdk';
import type {Json} from '../contracts/v2/api';
test('native contribution store validates data, commits atomically and removes only its owner',()=>{
 const store=new NativeContributionStore();const registry=new ContributionRegistry(store);const m={...manifest(),runtime:{type:'declarative' as const},activationEvents:[],contributes:{snippets:[{id:'static',label:'Static',language:'html',path:'snippet.json'}]}};
 registry.register(m,{'snippet.json':new TextEncoder().encode('{"body":"<h1>${1:title}</h1>"}')});assert.equal(store.snapshot().items.size,1);
 const invalid={...m,id:'acme.invalid',contributes:{themes:[{id:'bad',label:'Bad',kind:'code',mode:'light',path:'theme.json'}]}};
 assert.throws(()=>registry.register(invalid,{'theme.json':new TextEncoder().encode('{"background":"url(https://evil.test)"}')}));assert.equal(store.snapshot().items.size,1);registry.remove(m.id);assert.equal(store.snapshot().items.size,0);
});
test('guest SDK serializes local callbacks, awaits typed read result and disposes outstanding calls',async()=>{
 let receive!:(frame:unknown)=>void;const sent:RpcEnvelope[]=[];let disconnected=false;
 const sdk=createSomniaSdk({receive(fn){receive=fn;return {dispose(){disconnected=true;}};},send(frame){sent.push(frame);}},1);
 const read=sdk.somnia.project.readFile('index.html');const request=sent.at(-1)!;assert.ok('id'in request);receive({protocolVersion:1,generation:1,id:request.id,result:{text:'x',revision:'7'}});assert.deepEqual(await read,{text:'x',revision:'7'});
 const registered=sdk.somnia.commands.register('acme.test.run',async()=>({ok:true}));const registration=sent.at(-1)!;assert.ok('id'in registration&&'method'in registration);const callbackId=(registration.params as {callbackId:number}).callbackId;
 receive({protocolVersion:1,generation:1,id:registration.id,result:null});await registered;
 receive({protocolVersion:1,generation:1,id:100,method:'command',params:{callbackId,args:null}});await new Promise(r=>setTimeout(r,0));assert.deepEqual((sent.at(-1) as {result:Json}).result,{ok:true});
 const pending=sdk.somnia.selection.get();const rejected=assert.rejects(pending,{code:'E_CANCELLED'});sdk.dispose();await rejected;assert.equal(disconnected,true);
});
import {EditorProject} from '../../../../packages/editor-core/src/index';
import {createEditorCommit,projectRevision} from './editorService';
test('real editor commit checks revisions, keeps invalid batches atomic, remains undoable and respects cancellation',async()=>{
 const project=new EditorProject({'index.html':'<html><body><h1>Old</h1></body></html>'});const find=(nodes:ReturnType<EditorProject['tree']>):string=>{for(const n of nodes){if(n.tag==='h1')return n.id;const child=find(n.children);if(child)return child;}return '';};const nodeId=find(project.tree('index.html'));let authorized=true;const commit=createEditorCommit(project,()=>{if(!authorized)throw Error('revoked');});
 const baseRevisions={'index.html':projectRevision(project)};const signal=new AbortController().signal;
 const result=await commit({baseRevisions,operations:[{type:'setText',file:'index.html',nodeId,text:'New'}]},signal);assert.ok(result.transactionId);assert.match(project.files['index.html'],/>New</);
 await assert.rejects(commit({baseRevisions,operations:[{type:'setText',file:'index.html',nodeId,text:'stale'}]},signal),{code:'E_STALE_REVISION'});
 const before=project.files['index.html'];await assert.rejects(commit({baseRevisions:{'index.html':projectRevision(project)},operations:[{type:'setText',file:'index.html',nodeId,text:'first'},{type:'remove',file:'index.html',nodeId:'missing'}]},signal));assert.equal(project.files['index.html'],before);
 project.undo();assert.match(project.files['index.html'],/>Old</);authorized=false;await assert.rejects(commit({baseRevisions:{'index.html':projectRevision(project)},operations:[{type:'setText',file:'index.html',nodeId,text:'bad'}]},signal));
 const controller=new AbortController();controller.abort();authorized=true;await assert.rejects(commit({baseRevisions:{'index.html':projectRevision(project)},operations:[{type:'setText',file:'index.html',nodeId,text:'bad'}]},controller.signal),{code:'E_CANCELLED'});
});
test('command schema validates input and output without leaking private errors',async()=>{
 const b=new ExtensionBroker({...manifest(),contributes:{commands:[{id:'acme.word-count.count',argumentsSchema:{type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false},resultSchema:{type:'string'}}]}},()=>policy,services());
 assert.throws(()=>b.validateCommand('acme.word-count.count',{count:'no'}));assert.throws(()=>b.validateCommand('acme.word-count.count',{count:1,secret:'hidden'}));b.validateCommand('acme.word-count.count',{count:1});assert.throws(()=>b.validateCommand('acme.word-count.count',3,true));
});
test('broker call budget and revocation unsubscribe once',async()=>{
 let unsubscribed=0;const service=services();service.subscribe=()=>()=>{unsubscribed++;};const b=new ExtensionBroker(manifest(),()=>policy,service);const signal=new AbortController().signal;
 await b.call('project.onDidChange',{callbackId:1},signal);for(let i=0;i<99;i++)await b.call('project.listFiles',{},signal);await assert.rejects(b.call('project.listFiles',{},signal),{code:'E_RESOURCE_LIMIT'});b.revoke();b.revoke();assert.equal(unsubscribed,1);await assert.rejects(b.call('project.listFiles',{},signal),{code:'E_CANCELLED'});
});
