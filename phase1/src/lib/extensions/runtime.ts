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
 constructor(private manifest:ExtensionManifest,private deps:Omit<ApiDeps,'registerHandler'>&{log(text:string):void},makeWorker:(source:string,extId:string)=>WorkerLike,private timeoutMs=5000){
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
  }else if(m.type==='log'){if(m.level==='error')log('error','extensions.worker',`${this.manifest.name}: ${String(m.text).slice(0,500)}`);this.deps.log(`${this.manifest.name}: ${String(m.text).slice(0,200)}`);}
  else if(m.type==='command.done'){const r=this.runs.get(m.requestId);if(!r)return;clearTimeout(r.timer);this.runs.delete(m.requestId);m.error?r.reject(new Error(String(m.error))):r.resolve();}
 }
 runCommand(id:string){return new Promise<void>((resolve,reject)=>{if(this.failed){reject(new Error(`${this.manifest.name} is stopped.`));return;}const requestId=++this.n;const timer=setTimeout(()=>{this.runs.delete(requestId);reject(new Error(`${this.manifest.name} did not finish in time.`));this.failHard(`command ${id} timed out`);},this.timeoutMs);this.runs.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'command.run',id,requestId});});}
 dispose(){this.failed=true;if(this.activateTimer){clearTimeout(this.activateTimer);this.activateTimer=null;}for(const r of this.runs.values()){clearTimeout(r.timer);r.reject(new Error(`${this.manifest.name} was disposed.`));}this.runs.clear();this.worker.terminate();}
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
