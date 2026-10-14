import {isTauri} from '@tauri-apps/api/core';
import {callApi,type ApiDeps} from './api';
import {WORKER_SOURCE} from './workerSource';
import type {ExtensionManifest} from './types';
import {log,reportError} from '../log';
import {relayWorker,closeExtDocuments} from './nativeScheme';
export interface WorkerLike{postMessage(m:unknown):void;terminate():void;onmessage:((e:{data:any})=>void)|null;onerror?:((e:unknown)=>void)|null}
/** One sandboxed worker per extension. All traffic is JSON over postMessage; each api.call is checked in callApi. */
export class ExtensionRuntime{
 private worker:WorkerLike;private runs=new Map<number,{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private n=0;
 private lifecycleReqs=new Map<number,{resolve:(m:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 /** Lifecycle (docs/studio-lifecycle.md): activated protocol, suspension state and the extension's serializable state. */
 private activated=false;private workerProtocol=1;private suspended=false;private suspendedState:unknown=null;
 constructor(private manifest:ExtensionManifest,private deps:Omit<ApiDeps,'registerHandler'>&{log(text:string):void},private makeWorker:(source:string,extId:string)=>WorkerLike,private timeoutMs=5000){
  this.worker=makeWorker(WORKER_SOURCE,manifest.id);
  this.worker.onmessage=e=>this.onMessage(e.data);
  this.worker.onerror=e=>this.onWorkerError(e);
 }
 /** A worker that cannot load (for example the somnia-ext scheme is missing or blocked by CSP) never answers, so surface it once instead of waiting for command timeouts. */
 private failed=false;
 private onWorkerError(e:unknown){if(this.failed)return;this.failHard('worker failed');const detail=e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):'worker error';reportError('extensions.worker',`Extension ${this.manifest.name} (${this.manifest.id}) worker failed: ${detail.slice(0,300)}`,{notify:`Extension ${this.manifest.name} could not be started.`});}
 private activateTimer:ReturnType<typeof setTimeout>|null=null;
 activate(){this.activateTimer=setTimeout(()=>this.failHard('activation timed out'),this.timeoutMs);this.worker.postMessage({type:'activate',code:this.manifest.code??''});}
 /** A hung or crashed worker keeps running forever and burns a core; a timeout kills it and the extension stays failed until reload (fail closed, report once). */
 private failHard(detail:string){
  if(this.failed)return;this.failed=true;
  if(this.activateTimer){clearTimeout(this.activateTimer);this.activateTimer=null;}
  try{this.worker.terminate();}catch{/* worker may already be gone */}
  for(const r of this.runs.values()){clearTimeout(r.timer);r.reject(new Error(`${this.manifest.name} was stopped.`));}
  this.runs.clear();
  for(const r of this.lifecycleReqs.values()){clearTimeout(r.timer);r.reject(new Error(`${this.manifest.name} was stopped.`));}
  this.lifecycleReqs.clear();
  reportError('extensions.worker',`Extension ${this.manifest.name} (${this.manifest.id}) was stopped: ${detail}`,{notify:`Extension ${this.manifest.name} was stopped: ${detail}`});
 }
 private onMessage(m:any){
  if(this.failed||!m||typeof m!=='object')return;
  if(m.type==='api.call'){
   const reply=(extra:object)=>this.worker.postMessage({type:'api.result',requestId:m.requestId,...extra});
   try{const value=callApi(this.manifest,String(m.method),Array.isArray(m.args)?m.args:[],{...this.deps,registerHandler:()=>{}});reply({ok:true,value});}
   catch(error){log('warn','extensions.api',`${this.manifest.name} api call ${String(m.method)} failed: ${error instanceof Error?error.message:String(error)}`);reply({ok:false,error:error instanceof Error?error.message:String(error)});}
  }else if(m.type==='activated'){if(this.activateTimer){clearTimeout(this.activateTimer);this.activateTimer=null;}
   if(m.error){this.failHard('activation failed');reportError('extensions.activate',`Extension ${this.manifest.name} (${this.manifest.id}) failed to start`,{notify:`Extension ${this.manifest.name} could not be started.`});}
   else{this.activated=true;this.workerProtocol=typeof m.protocol==='number'?m.protocol:1;}
  }else if(m.type==='suspend.done'||m.type==='resume.done'){const r=this.lifecycleReqs.get(m.requestId);if(!r)return;clearTimeout(r.timer);this.lifecycleReqs.delete(m.requestId);r.resolve(m);
  }else if(m.type==='log'){if(m.level==='error')log('error','extensions.worker',`${this.manifest.name}: ${String(m.text).slice(0,500)}`);this.deps.log(`${this.manifest.name}: ${String(m.text).slice(0,200)}`);}
  else if(m.type==='command.done'){const r=this.runs.get(m.requestId);if(!r)return;clearTimeout(r.timer);this.runs.delete(m.requestId);m.error?r.reject(new Error(String(m.error))):r.resolve();}
 }
 /** True while the extension is suspended (worker terminated, state held by the host). */
 isSuspended(){return this.suspended;}
 /**
  * Suspend an idle extension: ask for its serializable state (protocol v2),
  * then terminate the worker. Refused while a command runs or the worker
  * speaks an older protocol - legacy extensions stay resident (pinned).
  * A hung suspend kills the worker with a diagnosis, like any other timeout.
  */
 async suspend():Promise<{ok:boolean;reason?:string}>{
  if(this.failed)return{ok:false,reason:'failed'};
  if(this.suspended)return{ok:true};
  if(this.runs.size)return{ok:false,reason:'command-in-flight'};
  if(!this.activated)return{ok:false,reason:'not-activated'};
  if(this.workerProtocol<2)return{ok:false,reason:'unsupported-protocol'};
  const requestId=++this.n;
  const reply=await new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{this.lifecycleReqs.delete(requestId);reject(new Error('suspend timed out'));this.failHard('suspend timed out');},this.timeoutMs);this.lifecycleReqs.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'suspend',requestId});}).catch(e=>({ok:false,error:e instanceof Error?e.message:String(e)}));
  if(!reply.ok){if(reply.error!=='suspend timed out')log('warn','extensions.worker',`${this.manifest.name} onSuspend failed: ${String(reply.error).slice(0,300)}`);return{ok:false,reason:'onSuspend-failed'};}
  this.suspendedState=reply.noHandler?null:reply.state??null;
  try{this.worker.terminate();}catch{/* worker may already be gone */}
  this.suspended=true;
  return{ok:true};
 }
 /**
  * Resume a suspended extension: recreate the sandboxed worker from the same
  * manifest code (same CSP, same checked API - no new authority), re-activate
  * it, then hand back its state through onResume when registered.
  */
 async resume():Promise<boolean>{
  if(this.failed||!this.suspended)return!this.failed;
  this.suspended=false;this.activated=false;this.workerProtocol=1;
  this.worker=this.makeWorker(WORKER_SOURCE,this.manifest.id);
  this.worker.onmessage=e=>this.onMessage(e.data);
  this.worker.onerror=e=>this.onWorkerError(e);
  const ok=await new Promise<boolean>(resolve=>{
   const timer=setTimeout(()=>{resolve(false);},this.timeoutMs);
   const prev=this.worker.onmessage;
   this.worker.onmessage=e=>{const m=e.data;if(m&&m.type==='activated'){clearTimeout(timer);this.worker.onmessage=prev;prev?.(e);resolve(!m.error);return;}prev?.(e);};
   this.activate();
  });
  if(!ok){this.failHard('resume activation failed');return false;}
  if(this.suspendedState===null)return true; // no state captured (no onSuspend handler)
  const requestId=++this.n;
  const reply=await new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{this.lifecycleReqs.delete(requestId);reject(new Error('resume timed out'));this.failHard('resume timed out');},this.timeoutMs);this.lifecycleReqs.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'resume',requestId,state:this.suspendedState});}).catch(e=>({ok:false,error:e instanceof Error?e.message:String(e)}));
  if(!reply.ok){log('warn','extensions.worker',`${this.manifest.name} onResume failed: ${String(reply.error).slice(0,300)}`);return false;}
  this.suspendedState=null;
  return true;
 }
 runCommand(id:string){return new Promise<void>(async(resolve,reject)=>{if(this.failed){reject(new Error(`${this.manifest.name} is stopped.`));return;}
  if(this.suspended){try{if(!await this.resume()){reject(new Error(`${this.manifest.name} could not be resumed.`));return;}}catch(e){reject(e instanceof Error?e:new Error(String(e)));return;}}const requestId=++this.n;const timer=setTimeout(()=>{this.runs.delete(requestId);reject(new Error(`${this.manifest.name} did not finish in time.`));this.failHard(`command ${id} timed out`);},this.timeoutMs);this.runs.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'command.run',id,requestId});});}
 dispose(){this.failed=true;if(this.activateTimer){clearTimeout(this.activateTimer);this.activateTimer=null;}for(const r of this.runs.values()){clearTimeout(r.timer);r.reject(new Error(`${this.manifest.name} was disposed.`));}this.runs.clear();for(const r of this.lifecycleReqs.values()){clearTimeout(r.timer);r.reject(new Error(`${this.manifest.name} was disposed.`));}this.lifecycleReqs.clear();try{this.worker.terminate();}catch{/* suspended workers are already gone */}}
}
/** URL contract with the Rust side: the worker bootstrap is a separate response with its own CSP (script-src 'unsafe-eval'; connect-src 'none'). Windows and Android WebViews expose custom schemes as http://<scheme>.localhost/. */
export const WORKER_SCHEME='somnia-ext';
export function workerUrl(extId:string,windowsStyle:boolean):string{const id=encodeURIComponent(extId);return windowsStyle?`http://${WORKER_SCHEME}.localhost/worker/${id}`:`${WORKER_SCHEME}://worker/${id}`;}
const windowsStyleScheme=()=>typeof navigator!=='undefined'&&/Windows|Android/i.test(navigator.userAgent);
export interface WorkerEnv{tauri:boolean;windowsStyle:boolean;create(url:string):WorkerLike;createFromSource(source:string):WorkerLike;/** Same-origin relay used when the engine refuses a cross-origin Worker URL. */createRelay?(extId:string):WorkerLike}
const defaultEnv=():WorkerEnv=>({createRelay:relayWorker,tauri:isTauri(),windowsStyle:windowsStyleScheme(),create:url=>new Worker(url) as unknown as WorkerLike,createFromSource:source=>{const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const w=new Worker(url);URL.revokeObjectURL(url);return w as unknown as WorkerLike;}});
/** Desktop (Tauri): start the worker from somnia-ext://worker/<id> (own response, own CSP). A Worker URL must be same-origin with its creator, so engines that refuse the cross-origin scheme (sync SecurityError, or an error event before the first message) fall back ONCE to the trusted same-origin relay (ext_worker_open). If neither starts, onerror fires and the runtime reports a visible failure: execution fails closed. There is deliberately no blob: fallback on desktop (app CSP worker-src would block it and it would not get the strict worker CSP). Web/dev (no Tauri): blob worker under the page CSP, hardening is best effort only (no connect-src 'none' boundary). */
export function desktopWorker(extId:string,env:WorkerEnv):WorkerLike{
 const outer:WorkerLike={onmessage:null,onerror:null,postMessage(m){sent.push(m);inner.postMessage(m);},terminate(){inner.terminate();if(env.createRelay)closeExtDocuments(extId);}};
 const sent:unknown[]=[];let seen=false;let fellBack=false;
 const wire=(w:WorkerLike,direct:boolean)=>{
  w.onmessage=e=>{seen=true;outer.onmessage?.(e);};
  w.onerror=e=>{
   if(direct&&!seen&&!fellBack&&env.createRelay){fellBack=true;try{w.terminate();}catch{/* already gone */}inner=wire(env.createRelay(extId),false);sent.forEach(m=>inner.postMessage(m));return;}
   outer.onerror?.(e);};
  return w;};
 let inner:WorkerLike;
 try{inner=wire(env.create(workerUrl(extId,env.windowsStyle)),true);}
 catch(e){if(!env.createRelay)throw e;fellBack=true;inner=wire(env.createRelay(extId),false);}
 return outer;
}
export const browserWorker=(source:string,extId='',env:WorkerEnv=defaultEnv()):WorkerLike=>env.tauri?desktopWorker(extId,env):env.createFromSource(source);
