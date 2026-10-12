import type {PreviewAsset,PreviewAssetLoader} from './previewAssets';
import type {PreviewAssetCache} from './previewAssetCache';
/** Notices binary dependencies (images, fonts, media) that changed on disk while the preview is open. The project has no change events for non-text files, so the cached ones are re-read and compared by fingerprint. A byte budget per round keeps big media from being re-read every time; the rest is checked in later rounds. */
export const WATCH_ROUND_BYTES=8*1024*1024;
export function fingerprint(a:PreviewAsset):string{
 let h=0x811c9dc5,n=0;
 if(a.bytes){n=a.bytes.byteLength;const step=Math.max(1,Math.floor(n/65536));for(let i=0;i<n;i+=step){h^=a.bytes[i];h=Math.imul(h,0x01000193)>>>0;}}
 else if(a.dataUrl){const u=a.dataUrl;n=u.length;const step=Math.max(1,Math.floor(n/65536));for(let i=0;i<n;i+=step){h^=u.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}}
 return n+':'+h.toString(16);
}
const size=(a:PreviewAsset)=>a.bytes?a.bytes.byteLength:a.dataUrl?Math.floor(a.dataUrl.length*0.75):0;
export class PreviewAssetWatch{
 private prints=new Map<string,string>();private cursor=0;
 reset():void{this.prints.clear();this.cursor=0;}
 /** One round. Returns the paths whose content changed, appeared or disappeared since the last round; the first look at a path only records it. Callers invalidate those paths in the cache. */
 async check(cache:PreviewAssetCache,load:PreviewAssetLoader,budget=WATCH_ROUND_BYTES):Promise<string[]>{
  const cached=[...cache.urls.keys()];const absent=cache.skippedAssets.filter(s=>s.reason==='missing'||s.reason==='error').map(s=>s.path);
  const all=[...cached,...absent];const live=new Set(all);for(const k of [...this.prints.keys()])if(!live.has(k))this.prints.delete(k);
  if(!all.length)return [];
  const changed:string[]=[];let used=0;
  for(let i=0;i<all.length&&used<budget;i++){
   const path=all[(this.cursor+i)%all.length];let asset:PreviewAsset|null=null;
   try{asset=await load(path);}catch{asset=null;}
   const now=asset?fingerprint(asset):'missing';if(asset)used+=size(asset);
   const was=this.prints.get(path);this.prints.set(path,now);
   if(was===undefined){if(absent.includes(path)&&asset)changed.push(path);else if(!absent.includes(path)&&!asset)changed.push(path);continue;}
   if(was!==now)changed.push(path);
  }
  this.cursor=(this.cursor+1)%all.length;
  return changed;
 }
}
