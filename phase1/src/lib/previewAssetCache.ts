import {assetType,type PreviewAssetKind,type PreviewAssetLoader} from './previewAssets';
/** Caches loaded project assets as data: URLs for the live preview.
 * blob: URLs from the parent do not load inside the opaque-origin sandbox, so everything is inlined and the limits keep the srcDoc small. */
export const KIND_LIMIT:Record<PreviewAssetKind,number>={image:8*1024*1024,font:4*1024*1024,media:24*1024*1024};
export const TOTAL_LIMIT=64*1024*1024;
export interface SkippedAsset{path:string;reason:'missing'|'too-large'|'budget'|'type'|'error'}
interface Entry{url:string;size:number}
const toBase64=(b:Uint8Array)=>{let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(s);};
export class PreviewAssetCache{
 private entries=new Map<string,Entry>();private inflight=new Map<string,Promise<SkippedAsset|null>>();private skipped=new Map<string,SkippedAsset>();private total=0;
 private epoch=0;
 /** Resolved project path to URL, for buildPreview. */
 get urls():ReadonlyMap<string,string>{const m=new Map<string,string>();for(const [k,v] of this.entries)m.set(k,v.url);return m;}
 get size():number{return this.total;}
 get skippedAssets():SkippedAsset[]{return [...this.skipped.values()];}
 has(path:string):boolean{return this.entries.has(path)||this.skipped.has(path);}
 /** Loads every path that is not cached yet. Returns true when something new became available. */
 async ensure(paths:Iterable<string>,load:PreviewAssetLoader,concurrency=4):Promise<boolean>{
  const todo=[...new Set(paths)].filter(p=>!this.has(p));if(!todo.length)return false;
  const epoch=this.epoch;let changed=false;const queue=[...todo];
  const worker=async()=>{for(let p=queue.shift();p!==undefined;p=queue.shift()){const r=await this.fetchOne(p,load,epoch);if(epoch!==this.epoch)continue;if(r)this.skipped.set(p,r);else changed=true;}};
  await Promise.all(Array.from({length:Math.min(concurrency,todo.length)},worker));
  return changed;
 }
 private fetchOne(path:string,load:PreviewAssetLoader,epoch:number):Promise<SkippedAsset|null>{
  const running=this.inflight.get(path);if(running)return running;
  const job=(async():Promise<SkippedAsset|null>=>{
   const type=assetType(path);if(!type)return {path,reason:'type'};
   let asset;try{asset=await load(path);}catch{return {path,reason:'error'};}
   if(!asset)return {path,reason:'missing'};
   const payload=asset.bytes?null:asset.dataUrl?/^data:[^,]*;base64,([A-Za-z0-9+/=]*)$/.exec(asset.dataUrl)?.[1]:null;
   if(!asset.bytes&&payload==null)return {path,reason:'error'};
   const size=asset.bytes?asset.bytes.byteLength:Math.floor((payload!.length*3)/4);
   if(size>KIND_LIMIT[type.kind])return {path,reason:'too-large'};
   if(this.total+size>TOTAL_LIMIT)return {path,reason:'budget'};
   if(epoch!==this.epoch)return null;
   const url=`data:${type.mime};base64,${asset.bytes?toBase64(asset.bytes):payload}`;
   this.entries.set(path,{url,size});this.total+=size;return null;
  })().finally(()=>this.inflight.delete(path));
  this.inflight.set(path,job);return job;
 }
 private drop(path:string){const e=this.entries.get(path);if(e){this.total-=e.size;this.entries.delete(path);}this.skipped.delete(path);}
 /** A file changed on disk or was replaced: forget it so the next build reloads it. */
 invalidate(paths:Iterable<string>):void{for(const p of paths)this.drop(p);}
 /** Manual refresh or project switch. Late results from loads started before this are discarded. */
 invalidateAll():void{this.epoch++;for(const p of [...this.entries.keys()])this.drop(p);this.skipped.clear();this.inflight.clear();}
 /** Drops assets the current document no longer references so large media does not stay in memory. */
 prune(keep:ReadonlySet<string>):void{for(const p of [...this.entries.keys()])if(!keep.has(p))this.drop(p);}
}
const NOTE:Record<SkippedAsset['reason'],string>={missing:'not found','too-large':'too large',budget:'preview memory limit',type:'unsupported type',error:'could not be read'};
export const describeSkipped=(s:SkippedAsset)=>`${s.path} (${NOTE[s.reason]})`;
