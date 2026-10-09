import type {SoundPlugin,SoundRecipe,SoundReport,SoundRequest,SoundResponse} from './protocol';
export interface SoundResult{wav:ArrayBuffer;peaks:Float32Array;report:SoundReport;ms:number}
/** What the session needs from an engine; tests substitute a fake. */
export interface SoundEngineLike{init():Promise<SoundPlugin[]>;process(bytes:ArrayBuffer,ext:string,recipe:SoundRecipe):Promise<SoundResult>;dispose():void}
/** The worker holds the WASM module; the UI thread never decodes or renders audio. */
export class SoundEngine implements SoundEngineLike{
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 private nextId=1;private disposed=false;
 private pending=new Map<number,{resolve:(r:SoundResponse)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 constructor(){
  this.worker.onmessage=({data}:MessageEvent<SoundResponse>)=>{
   const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);
   if(data.ok)p.resolve(data);else p.reject(new Error(data.error));
  };
  this.worker.onerror=e=>this.dispose(new Error(e.message||'Sound worker failed'));
  this.worker.onmessageerror=()=>this.dispose(new Error('Sound response could not be decoded'));
 }
 private request(message:SoundRequest,transfer:Transferable[]=[],timeoutMs=120_000){
  return new Promise<SoundResponse>((resolve,reject)=>{
   if(this.disposed){reject(new Error('Sound engine disposed'));return;}
   const timer=setTimeout(()=>this.dispose(new Error('Sound worker timed out')),timeoutMs);
   this.pending.set(message.id,{resolve,reject,timer});
   try{this.worker.postMessage(message,transfer);}catch(error){clearTimeout(timer);this.pending.delete(message.id);reject(error as Error);}
  });
 }
 async init(){
  const r=await this.request({id:this.nextId++,kind:'init',wasmUrl:new URL('../../../sound/pkg/somnia_sound_bg.wasm',import.meta.url).href},[],30_000);
  if(!r.ok||r.kind!=='ready')throw new Error('Unexpected Sound init response');return r.plugins;
 }
 /** Takes ownership of `bytes`: the caller's ArrayBuffer is detached by the transfer. */
 async process(bytes:ArrayBuffer,ext:string,recipe:SoundRecipe):Promise<SoundResult>{
  const r=await this.request({id:this.nextId++,kind:'process',bytes,ext,recipe},[bytes]);
  if(!r.ok||r.kind!=='result')throw new Error('Unexpected Sound result');
  return{wav:r.wav,peaks:new Float32Array(r.peaks),report:r.report,ms:r.ms};
 }
 dispose(error=new Error('Sound engine disposed')){
  this.disposed=true;this.worker.terminate();
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}
  this.pending.clear();
 }
}
