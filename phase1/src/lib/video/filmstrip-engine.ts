import type {SourceInfo,Thumb,ThumbDecoder} from './filmstrip-controller';
import type {FilmRequest,FilmResponse} from './filmstrip.worker';
type DistributiveOmit<T,K extends keyof any>=T extends unknown?Omit<T,K>:never;
/** Worker-backed ThumbDecoder. */
export class FilmstripEngine implements ThumbDecoder{
 private worker=new Worker(new URL('./filmstrip.worker.ts',import.meta.url),{type:'module'});
 private nextId=1;
 private pending=new Map<number,{resolve:(r:FilmResponse)=>void;reject:(e:Error)=>void}>();
 constructor(){
  this.worker.onmessage=({data}:MessageEvent<FilmResponse>)=>{
   const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);
   if(data.ok)p.resolve(data);else p.reject(new Error(data.error));
  };
  this.worker.onerror=e=>this.fail(new Error(e.message||'Filmstrip worker failed'));
 }
 private fail(e:Error){for(const p of this.pending.values())p.reject(e);this.pending.clear();}
 private call(m:DistributiveOmit<FilmRequest,"id">,transfer:Transferable[]=[]){
  return new Promise<FilmResponse>((resolve,reject)=>{
   const id=this.nextId++;this.pending.set(id,{resolve,reject});
   this.worker.postMessage({...m,id},transfer);
  });
 }
 async open(key:string,bytes:ArrayBuffer):Promise<SourceInfo>{
  const r=await this.call({kind:'open',key,bytes},[bytes]);
  if(!r.ok||r.kind!=='open')throw new Error('Unexpected filmstrip response');return r.info;
 }
 async thumbs(key:string,times:number[],width:number,height:number):Promise<(Thumb|null)[]>{
  const r=await this.call({kind:'thumbs',key,times,width,height});
  if(!r.ok||r.kind!=='thumbs')throw new Error('Unexpected filmstrip response');return r.bitmaps;
 }
 close(key:string){this.worker.postMessage({id:this.nextId++,kind:'close',key} satisfies FilmRequest);}
 dispose(){this.worker.terminate();this.fail(new Error('Filmstrip engine disposed'));}
}
