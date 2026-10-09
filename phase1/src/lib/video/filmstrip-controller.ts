/** Filmstrip controller: thumbnail cache (LRU, per source generation), latest-wins request queue and change notifications. No DOM. */
import {tileKey,type TileSpec} from './filmstrip-model';
/** A decoded thumbnail. ImageBitmap in the browser; tests use a fake with the same `close`. */
export interface Thumb{width:number;height:number;close():void}
export interface SourceInfo{duration:number;width:number;height:number}
/** What the controller needs from a decoder; the real one lives in a worker, tests substitute a fake. */
export interface ThumbDecoder{
 open(key:string,bytes:ArrayBuffer):Promise<SourceInfo>;
 /** One entry per time; null when that frame could not be decoded. */
 thumbs(key:string,times:number[],width:number,height:number):Promise<(Thumb|null)[]>;
 close(key:string):void;
 dispose():void;
}
export type SourceState='opening'|'ready'|'failed';
export interface TileRequest{source:string;tile:TileSpec;height:number}
interface Entry{thumb:Thumb;source:string;gen:number;step:number;time:number}
interface SourceRec{gen:number;state:SourceState;info:SourceInfo|null;error?:string}
export interface ControllerOptions{maxTiles?:number;batch?:number;dpr?:number}
export class FilmstripController{
 private cache=new Map<string,Entry>();
 private sources=new Map<string,SourceRec>();
 private wanted=new Map<string,TileRequest[]>();
 private listeners=new Set<()=>void>();
 private pumping=false;private disposed=false;private genCounter=0;
 private failedKeys=new Set<string>();
 readonly maxTiles:number;private batch:number;private dpr:number;
 /** Count of decode batches sent; tests use it to prove caching. */
 batches=0;
 constructor(private decoder:ThumbDecoder,opts:ControllerOptions={}){this.maxTiles=opts.maxTiles??400;this.batch=opts.batch??4;this.dpr=opts.dpr??1;}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private emit(){for(const l of [...this.listeners])l();}
 /** Registers (or replaces) a source. Replacing bumps its generation: every older thumbnail is dropped and in-flight results are ignored. Takes ownership of `bytes`. */
 register(source:string,bytes:ArrayBuffer){
  this.dropSource(source);
  const gen=++this.genCounter;const rec:SourceRec={gen,state:'opening',info:null};this.sources.set(source,rec);
  this.decoder.open(source,bytes).then(info=>{
   if(this.sources.get(source)?.gen!==gen||this.disposed)return;
   rec.info=info;rec.state='ready';this.emit();void this.pump();
  },err=>{
   if(this.sources.get(source)?.gen!==gen||this.disposed)return;
   rec.state='failed';rec.error=err instanceof Error?err.message:String(err);this.emit();
  });
  this.emit();
 }
 /** Forgets a source and frees its thumbnails (call when the file is closed). */
 unregister(source:string){this.dropSource(source);this.sources.delete(source);this.decoder.close(source);this.emit();}
 private dropSource(source:string){
  for(const[k,e]of this.cache)if(e.source===source){e.thumb.close();this.cache.delete(k);}
  for(const k of [...this.failedKeys])if(k.startsWith(source+'|'))this.failedKeys.delete(k);
 }
 state(source:string):SourceState|'unknown'{return this.sources.get(source)?.state??'unknown';}
 info(source:string){return this.sources.get(source)?.info??null;}
 gen(source:string){return this.sources.get(source)?.gen??0;}
 /** Exact thumbnail for a tile, or null. Touches the LRU. */
 get(source:string,tile:TileSpec,height:number):Thumb|null{
  const rec=this.sources.get(source);if(!rec)return null;
  const k=tileKey(source,rec.gen,tile.step,tile.index,height);
  const e=this.cache.get(k);if(!e)return null;
  this.cache.delete(k);this.cache.set(k,e);return e.thumb;
 }
 /** Best stand-in while the exact tile loads: the cached thumbnail of this source closest in time (any step). Never blanks a strip. */
 nearest(source:string,time:number):Thumb|null{
  const rec=this.sources.get(source);if(!rec)return null;
  let best:Entry|null=null,bd=Infinity;
  for(const e of this.cache.values()){
   if(e.source!==source||e.gen!==rec.gen)continue;
   const d=Math.abs(e.time-time);if(d<bd){bd=d;best=e;}
  }
  return best?.thumb??null;
 }
 /** Declares what one owner (a strip) currently needs. Replaces that owner's previous list, so requests made stale by a trim or move are dropped before they run. */
 want(owner:string,requests:TileRequest[]){this.wanted.set(owner,requests);void this.pump();}
 release(owner:string){this.wanted.delete(owner);}
 get size(){return this.cache.size;}
 private nextBatch():{source:string;gen:number;height:number;reqs:TileRequest[]}|null{
  for(const list of this.wanted.values())for(const r of list){
   const rec=this.sources.get(r.source);if(!rec||rec.state!=='ready')continue;
   const first=tileKey(r.source,rec.gen,r.tile.step,r.tile.index,r.height);
   if(this.cache.has(first)||this.failedKeys.has(first))continue;
   const reqs:TileRequest[]=[];const seen=new Set<string>();
   for(const l2 of this.wanted.values())for(const q of l2){
    if(reqs.length>=this.batch)break;
    if(q.source!==r.source||q.height!==r.height)continue;
    const k=tileKey(q.source,rec.gen,q.tile.step,q.tile.index,q.height);
    if(seen.has(k)||this.cache.has(k)||this.failedKeys.has(k))continue;
    seen.add(k);reqs.push(q);
   }
   return{source:r.source,gen:rec.gen,height:r.height,reqs};
  }
  return null;
 }
 private async pump(){
  if(this.pumping||this.disposed)return;this.pumping=true;
  try{
   for(let job=this.nextBatch();job&&!this.disposed;job=this.nextBatch()){
    const rec=this.sources.get(job.source);if(!rec||rec.gen!==job.gen||!rec.info)break;
    const h=Math.round(job.height*this.dpr);
    const w=Math.max(1,Math.round(h*(rec.info.width>0&&rec.info.height>0?rec.info.width/rec.info.height:16/9)));
    this.batches++;
    let out:(Thumb|null)[];
    try{out=await this.decoder.thumbs(job.source,job.reqs.map(r=>r.tile.time),w,h);}
    catch{out=job.reqs.map(()=>null);}
    const cur=this.sources.get(job.source);
    if(!cur||cur.gen!==job.gen){out.forEach(t=>t?.close());continue;}
    job.reqs.forEach((r,i)=>{
     const k=tileKey(r.source,job.gen,r.tile.step,r.tile.index,r.height);
     const t=out[i];if(t)this.cache.set(k,{thumb:t,source:r.source,gen:job.gen,step:r.tile.step,time:r.tile.time});else this.failedKeys.add(k);
    });
    this.evict();this.emit();
   }
  }finally{this.pumping=false;}
 }
 private evict(){
  if(this.cache.size<=this.maxTiles)return;
  const keep=new Set<string>();
  for(const list of this.wanted.values())for(const r of list){const rec=this.sources.get(r.source);if(rec)keep.add(tileKey(r.source,rec.gen,r.tile.step,r.tile.index,r.height));}
  for(const[k,e]of this.cache){
   if(this.cache.size<=this.maxTiles)break;
   if(keep.has(k))continue;e.thumb.close();this.cache.delete(k);
  }
 }
 dispose(){
  this.disposed=true;for(const e of this.cache.values())e.thumb.close();this.cache.clear();this.wanted.clear();this.listeners.clear();this.decoder.dispose();
 }
}
