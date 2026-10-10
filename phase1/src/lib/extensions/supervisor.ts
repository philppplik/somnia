import type {ManifestV2} from './manifestV2';
import {evaluateWhen} from './contributions';
import {ActivationQueue,matchesActivation,type ActivationContext,type ActivationEvent} from './activation';
import {ExtensionBroker,type BrokerPolicy,type BrokerServices} from './broker';
import {ExtensionError,PROTOCOL_VERSION,type ApiMethod,type Json} from './contracts/v2/api';
import {validateEnvelope,type RpcEnvelope,type RpcReply} from './v2/rpc';
import {negotiateVersion,type HostCapabilities} from './v2/compatibility';
export type SessionState='disabled'|'dormant'|'activating'|'active'|'stopping'|'faulted'|'removed';
export interface RuntimeTransport {send(frame:RpcEnvelope):void;terminate():void;onFrame:((frame:unknown)=>void)|null;onError:((error:unknown)=>void)|null}
export interface RuntimeBootstrap {extensionId:string;digest:string;generation:number;apiVersion:string;protocolVersion:1;runtime:ManifestV2['runtime']}
export type RuntimeFactory=(bootstrap:RuntimeBootstrap,signal:AbortSignal)=>Promise<RuntimeTransport>;
interface Session {
 manifest:ManifestV2;digest:string;generation:number;state:SessionState;broker:ExtensionBroker;transport?:RuntimeTransport;
 controller:AbortController;activation?:Promise<void>;ready?:{resolve():void;reject(e:Error):void};
 pending:Map<number,{resolve(value:Json):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}>;
 calls:Map<number,AbortController>;hello:boolean;
}
/** Owner of connection identity, launch quotas, deadlines and targeted lifecycle invalidation. */
export class ExtensionSupervisor {
 private sessions=new Map<string,Session>();private generations=new Map<string,number>();private seq=0;private reservedHosts=0;private lastSelection=0;private queue=new ActivationQueue();
 constructor(private readonly host:HostCapabilities,private readonly factory:RuntimeFactory,private readonly context:()=>ActivationContext,
  private readonly policy:(id:string)=>BrokerPolicy,private readonly services:(id:string)=>BrokerServices,
  private readonly diagnostic:(id:string,error:ExtensionError)=>void=()=>{},private readonly timeoutMs=5000,private readonly maxHosts=8){}
 install(manifest:ManifestV2,digest:string):void {
  if(!/^[a-f0-9]{64}$/.test(digest))throw new ExtensionError('E_INVALID_ARGUMENT','Verified package digest is required.');
  if(this.sessions.has(manifest.id))this.stop(manifest.id,'disabled');
  const generation=(this.generations.get(manifest.id)??0)+1;this.generations.set(manifest.id,generation);
  this.sessions.set(manifest.id,this.makeSession(manifest,digest,generation,'disabled'));
 }
 private makeSession(manifest:ManifestV2,digest:string,generation:number,state:SessionState):Session {
  return {manifest,digest,generation,state,broker:new ExtensionBroker(manifest,()=>this.policy(manifest.id),this.services(manifest.id)),controller:new AbortController(),pending:new Map(),calls:new Map(),hello:false};
 }
 state(id:string):SessionState|undefined{return this.sessions.get(id)?.state;}
 generation(id:string):number|undefined{return this.sessions.get(id)?.generation;}
 async enable(id:string):Promise<void>{const s=this.get(id);negotiateVersion(s.manifest,this.host);s.broker.assertLaunch();if(s.state==='removed')throw new ExtensionError('E_CANCELLED','Extension was removed.');if(s.state==='disabled')s.state='dormant';await this.event({type:'enable'},id);}
 async event(event:ActivationEvent,onlyId?:string):Promise<void> {
  if(event.type==='selection'){const now=Date.now();if(now-this.lastSelection<100)return;this.lastSelection=now;}
  const c=this.context();const selected=[...this.sessions.values()].filter(s=>(!onlyId||s.manifest.id===onlyId)&&['dormant','activating','active'].includes(s.state)&&matchesActivation(s.manifest,event,c));
  await Promise.all(selected.map(s=>this.activate(s,event.type==='command'||event.type==='panel')));
 }
 private activate(s:Session,userAction:boolean):Promise<void> {
  if(s.state==='active')return Promise.resolve();if(s.activation)return s.activation;
  if(s.state!=='dormant')return Promise.reject(new ExtensionError('E_EXTENSION_FAULTED','Extension is not available.'));
  s.state='activating';
  s.activation=this.queue.run(async()=>{
   if(s.controller.signal.aborted)throw new ExtensionError('E_CANCELLED','Activation cancelled.');
   negotiateVersion(s.manifest,this.host);s.broker.assertLaunch();
   const active=[...this.sessions.values()].filter(x=>!!x.transport).length;
   if(active+this.reservedHosts>=this.maxHosts)throw new ExtensionError('E_RESOURCE_LIMIT','Stop an active extension before starting another.');
   this.reservedHosts++;let reserved=true;
   let timer:ReturnType<typeof setTimeout>|undefined;
   const ready=new Promise<void>((resolve,reject)=>{s.ready={resolve,reject};timer=setTimeout(()=>reject(new ExtensionError('E_TIMEOUT','Extension activation timed out.')),this.timeoutMs);});
   // Capture readiness rejection while an async engine loader is still pending.
   void ready.catch(()=>{});
   try {
    const loading=this.factory({extensionId:s.manifest.id,digest:s.digest,generation:s.generation,apiVersion:this.host.apiVersion,protocolVersion:1,runtime:s.manifest.runtime},s.controller.signal);
    void loading.then(t=>{if(s.controller.signal.aborted)t.terminate();},()=>{});
    const transport=await Promise.race([loading,ready.then(()=>{throw new ExtensionError('E_INVALID_ARGUMENT','Unexpected engine readiness.');})]);
    if(s.controller.signal.aborted){transport.terminate();throw new ExtensionError('E_CANCELLED','Activation cancelled.');}
    s.transport=transport;this.reservedHosts--;reserved=false;transport.onFrame=frame=>this.receive(s,frame);transport.onError=()=>this.fault(s,new ExtensionError('E_EXTENSION_FAULTED','Extension runtime failed.'));
    transport.send({protocolVersion:1,generation:s.generation,method:'bootstrap',params:{apiVersion:this.host.apiVersion,protocolVersions:[1],digest:s.digest}});
    await ready;s.broker.assertLaunch();s.state='active';
   }finally{if(reserved)this.reservedHosts--;if(timer)clearTimeout(timer);s.ready=undefined;}
  },userAction).catch(error=>{const safe=error instanceof ExtensionError?error:new ExtensionError('E_EXTENSION_FAULTED','Extension activation failed.');if(!s.controller.signal.aborted)this.fault(s,safe);throw safe;});
  return s.activation;
 }
 private receive(s:Session,input:unknown):void {
  if(s.controller.signal.aborted)return;
  try {
   const frame=validateEnvelope(input,s.generation);
   if('method'in frame) {
    if(frame.method==='hello'&&!('id'in frame)&&!s.hello&&s.state==='activating'){
     const p=frame.params;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['protocolVersions','runtime','abi'].includes(k))||!Array.isArray(p.protocolVersions)||!p.protocolVersions.includes(PROTOCOL_VERSION)||p.runtime!==s.manifest.runtime.type||(s.manifest.runtime.type==='wasm'&&p.abi!=='somnia-json-1'))throw new ExtensionError('E_INCOMPATIBLE_API','Runtime handshake failed.');
     s.hello=true;s.transport?.send({protocolVersion:1,generation:s.generation,method:'activate',params:{extensionId:s.manifest.id,apiVersion:this.host.apiVersion}});return;
    }
    if(frame.method==='ready'&&!('id'in frame)&&s.hello&&s.state==='activating'){s.ready?.resolve();return;}
    if(!s.hello||!('id'in frame)||!['activating','active'].includes(s.state))throw new ExtensionError('E_INVALID_ARGUMENT','Unexpected runtime message.');
    if(s.calls.size>=32)throw new ExtensionError('E_RESOURCE_LIMIT','Too many in-flight API requests.');
    if(s.calls.has(frame.id))throw new ExtensionError('E_INVALID_ARGUMENT','Duplicate API request ID.');
    const controller=new AbortController();s.calls.set(frame.id,controller);let timeoutReject!:(error:ExtensionError)=>void;const deadline=new Promise<never>((_resolve,reject)=>{timeoutReject=reject;});const timer=setTimeout(()=>{controller.abort();timeoutReject(new ExtensionError('E_TIMEOUT','Extension API call timed out.'));},this.timeoutMs);
    // Calls are never retried, especially writes. Authority comes from this connection's broker.
    void Promise.race([s.broker.call(frame.method as ApiMethod,frame.params as never,controller.signal),deadline]).then(result=>this.reply(s,frame.id,{result:result as Json}),error=>{
     const safe=error instanceof ExtensionError?error:new ExtensionError('E_INVALID_ARGUMENT','API call failed.');this.reply(s,frame.id,{error:{code:safe.code,message:safe.message.slice(0,200)}});
    }).finally(()=>{clearTimeout(timer);s.calls.delete(frame.id);});
   }else {
    const pending=s.pending.get(frame.id);if(!pending)return;clearTimeout(pending.timer);s.pending.delete(frame.id);
    if(frame.error)pending.reject(new ExtensionError(frame.error.code,'Extension command failed.'));else pending.resolve(frame.result!);
   }
  }catch(error){this.fault(s,error instanceof ExtensionError?error:new ExtensionError('E_INVALID_ARGUMENT','Invalid runtime frame.'));}
 }
 private reply(s:Session,id:number,body:Pick<RpcReply,'result'|'error'>):void{if(s.controller.signal.aborted)return;try{s.transport?.send({protocolVersion:1,generation:s.generation,id,...body});}catch{this.fault(s,new ExtensionError('E_EXTENSION_FAULTED','Host reply could not be delivered.'));}}
 async runCommand(extensionId:string,commandId:string,args:Json=null):Promise<Json> {
  const s=this.get(extensionId);s.broker.check('commands.register');s.broker.validateCommand(commandId,args);const ctx=this.context();const command=s.manifest.contributes.commands?.find(c=>c.id===commandId);
  if(!evaluateWhen(command?.when,{studio:ctx.studio,language:ctx.languages[0]??'',hasProject:ctx.hasProject,hasSelection:ctx.hasSelection??false,workspaceTrusted:ctx.workspaceTrusted,isReadonly:ctx.isReadonly??false}))throw new ExtensionError('E_INVALID_ARGUMENT','Command is unavailable in this context.');
  if(!this.context().interactive)throw new ExtensionError('E_CANCELLED','Editor is not interactive yet.');
  if(s.state==='dormant')await this.activate(s,true);else if(s.state==='activating')await s.activation;
  if(s.state!=='active')throw new ExtensionError('E_EXTENSION_FAULTED','Extension is not active.');
  s.broker.check('commands.register');const callbackId=s.broker.handlers.get(commandId);if(!callbackId)throw new ExtensionError('E_HANDLER_MISSING','Extension did not register this command.');
  if(s.pending.size>=32)throw new ExtensionError('E_RESOURCE_LIMIT','Too many in-flight commands.');
  const id=++this.seq;const result=await new Promise<Json>((resolve,reject)=>{
   const timer=setTimeout(()=>{s.pending.delete(id);reject(new ExtensionError('E_TIMEOUT','Extension command timed out.'));this.fault(s,new ExtensionError('E_TIMEOUT','Extension command timed out.'));},this.timeoutMs);
   s.pending.set(id,{resolve,reject,timer});try{s.transport!.send({protocolVersion:1,generation:s.generation,id,method:'command',params:{callbackId,args}});}catch{this.fault(s,new ExtensionError('E_EXTENSION_FAULTED','Extension command dispatch failed.'));}
  });s.broker.validateCommand(commandId,result,true);return result;
 }
 /** Host-owned subscriptions route only metadata/current snapshots to this connection. */
 deliverEvent(id:string,callbackId:number,value:Json,kind:'project'|'selection'|'panel'):void {
  const s=this.get(id);if(s.state!=='active'||!Number.isSafeInteger(callbackId)||callbackId<1)return;
  s.broker.check(kind==='project'?'project.onDidChange':kind==='selection'?'selection.onDidChange':'panels.onMessage');
  const frame:RpcEnvelope={protocolVersion:1,generation:s.generation,method:'event',params:{callbackId,value}};validateEnvelope(frame,s.generation);s.transport?.send(frame);
 }
 private fault(s:Session,error:ExtensionError):void{if(s.controller.signal.aborted)return;this.stop(s.manifest.id,'faulted',error);this.diagnostic(s.manifest.id,error);}
 /** Revoke capabilities BEFORE terminating. Only this extension's calls, panels and subscriptions are affected. */
 stop(id:string,next:SessionState='dormant',reason=new ExtensionError('E_CANCELLED','Extension session ended.')):void {
  const s=this.get(id);s.state='stopping';s.broker.revoke();s.controller.abort();s.ready?.reject(reason);
  for(const c of s.calls.values())c.abort();for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(reason);}s.pending.clear();
  if(s.transport){try{s.transport.send({protocolVersion:1,generation:s.generation,method:'deactivate',params:{}});}catch{/* best effort */}s.transport.terminate();}
  const generation=s.generation+1;this.generations.set(id,generation);this.sessions.set(id,this.makeSession(s.manifest,s.digest,generation,next));
 }
 disable(id:string):void{this.stop(id,'disabled');}
 remove(id:string):void{this.stop(id,'removed');}
 policyChanged(id:string):void{this.stop(id,this.policy(id).enabled?'dormant':'disabled');}
 workspaceClosed():void{for(const s of this.sessions.values())if(['active','activating'].includes(s.state))this.stop(s.manifest.id);}
 async restart(id:string):Promise<void>{this.stop(id);await this.enable(id);}
 dispose():void{for(const id of this.sessions.keys())this.disable(id);}
 private get(id:string):Session{const s=this.sessions.get(id);if(!s)throw new ExtensionError('E_INVALID_ARGUMENT','Unknown extension.');return s;}
}
