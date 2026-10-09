import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport,VideoRequest,VideoResponse} from './protocol';
import type {VideoRecipe} from './recipe';
export interface VideoResult{bytes:ArrayBuffer;mime:string;report:VideoReport}
/** What the session needs from an engine; tests substitute a fake. */
export interface VideoEngineLike{
 probe(bytes:ArrayBuffer):Promise<VideoProbe>;
 capabilities():Promise<VideoCapabilities>;
 export(bytes:ArrayBuffer,recipe:VideoRecipe,onProgress?:(p:VideoProgress)=>void):Promise<VideoResult>;
 cancelExport():void;
 dispose():void;
}
/** The worker holds mediabunny and the WebCodecs pipeline; the UI thread never demuxes or encodes. */
export class VideoEngine implements VideoEngineLike{
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private nextId=1;private disposed=false;
 private pending=new Map<number,{resolve:(r:VideoResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;onProgress?:(p:VideoProgress)=>void}>();
 private exportId:number|null=null;
 constructor(){
  this.worker.onmessage=({data}:MessageEvent<VideoResponse>)=>{
   const p=this.pending.get(data.id);if(!p)return;
   if(data.ok&&data.kind==='progress'){p.onProgress?.({stage:data.stage,ratio:data.ratio,processed_s:data.processed_s});return;}
   clearTimeout(p.timer);this.pending.delete(data.id);
   if(data.id===this.exportId)this.exportId=null;
   if(data.ok)p.resolve(data);
   else{const e=new Error(data.error);if(data.cancelled)e.name='ExportCancelled';p.reject(e);}
  };
  this.worker.onerror=e=>this.dispose(new Error(e.message||'Video worker failed'));
  this.worker.onmessageerror=()=>this.dispose(new Error('Video response could not be decoded'));
 }
 private request(message:VideoRequest,transfer:Transferable[]=[],timeoutMs:number,onProgress?:(p:VideoProgress)=>void){
  return new Promise<VideoResponse>((resolve,reject)=>{
   if(this.disposed){reject(new Error('Video engine disposed'));return;}
   const timer=setTimeout(()=>this.dispose(new Error('Video worker timed out')),timeoutMs);
   this.pending.set(message.id,{resolve,reject,timer,onProgress});
   try{this.worker.postMessage(message,transfer);}catch(error){clearTimeout(timer);this.pending.delete(message.id);reject(error as Error);}
  });
 }
 /** Takes ownership of `bytes`: the caller's ArrayBuffer is detached by the transfer. */
 async probe(bytes:ArrayBuffer){
  const r=await this.request({id:this.nextId++,kind:'probe',bytes},[bytes],60_000);
  if(!r.ok||r.kind!=='probe')throw new Error('Unexpected video probe response');return r.probe;
 }
 async capabilities(){
  const r=await this.request({id:this.nextId++,kind:'capabilities'},[],60_000);
  if(!r.ok||r.kind!=='capabilities')throw new Error('Unexpected video capabilities response');return r.capabilities;
 }
 /** Takes ownership of `bytes`: the caller's ArrayBuffer is detached by the transfer. */
 async export(bytes:ArrayBuffer,recipe:VideoRecipe,onProgress?:(p:VideoProgress)=>void):Promise<VideoResult>{
  const id=this.nextId++;this.exportId=id;
  const r=await this.request({id,kind:'export',bytes,recipe},[bytes],3_600_000,onProgress);
  if(!r.ok||r.kind!=='export')throw new Error('Unexpected video export response');
  return{bytes:r.bytes,mime:r.mime,report:r.report};
 }
 cancelExport(){if(this.exportId!==null&&!this.disposed)this.worker.postMessage({id:this.nextId++,kind:'cancel'});}
 dispose(error=new Error('Video engine disposed')){
  this.disposed=true;this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}
  this.pending.clear();
 }
}
