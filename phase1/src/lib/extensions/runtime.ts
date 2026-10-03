import {callApi,type ApiDeps} from './api';
import {WORKER_SOURCE} from './workerSource';
import type {ExtensionManifest} from './types';
export interface WorkerLike{postMessage(m:unknown):void;terminate():void;onmessage:((e:{data:any})=>void)|null}
/** One sandboxed worker per extension. All traffic is JSON over postMessage; each api.call is checked in callApi. */
export class ExtensionRuntime{
 private worker:WorkerLike;private runs=new Map<number,{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();private n=0;
 constructor(private manifest:ExtensionManifest,private deps:Omit<ApiDeps,'registerHandler'>&{log(text:string):void},makeWorker:(source:string)=>WorkerLike,private timeoutMs=5000){
  this.worker=makeWorker(WORKER_SOURCE);
  this.worker.onmessage=e=>this.onMessage(e.data);
 }
 activate(){this.worker.postMessage({type:'activate',code:this.manifest.code??''});}
 private onMessage(m:any){
  if(!m||typeof m!=='object')return;
  if(m.type==='api.call'){
   const reply=(extra:object)=>this.worker.postMessage({type:'api.result',requestId:m.requestId,...extra});
   try{const value=callApi(this.manifest,String(m.method),Array.isArray(m.args)?m.args:[],{...this.deps,registerHandler:()=>{}});reply({ok:true,value});}
   catch(error){reply({ok:false,error:error instanceof Error?error.message:String(error)});}
  }else if(m.type==='log'){this.deps.log(`${this.manifest.name}: ${String(m.text).slice(0,200)}`);}
  else if(m.type==='command.done'){const r=this.runs.get(m.requestId);if(!r)return;clearTimeout(r.timer);this.runs.delete(m.requestId);m.error?r.reject(new Error(String(m.error))):r.resolve();}
 }
 runCommand(id:string){return new Promise<void>((resolve,reject)=>{const requestId=++this.n;const timer=setTimeout(()=>{this.runs.delete(requestId);reject(new Error(`${this.manifest.name} did not finish in time.`));},this.timeoutMs);this.runs.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'command.run',id,requestId});});}
 dispose(){for(const r of this.runs.values())clearTimeout(r.timer);this.runs.clear();this.worker.terminate();}
}
export const browserWorker=(source:string):WorkerLike=>{const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const w=new Worker(url);URL.revokeObjectURL(url);return w as unknown as WorkerLike;};
