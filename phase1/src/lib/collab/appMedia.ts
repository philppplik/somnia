import {addMediaFile,getMedia,setActiveMedia,subscribeMedia} from '../media';
import type {MediaPort} from './blobSync';
/** The media of this window: the in-memory preview store (Files > Previews). Received files never touch the disk. */
export const appMedia:MediaPort={
 list:()=>getMedia().items.map(i=>({path:i.name,id:i.url,size:i.size,read:async()=>new Uint8Array(await (await fetch(i.sourceUrl??i.url)).arrayBuffer())})),
 async add(path,bytes){
  const before=getMedia().active;
  const r=await addMediaFile(new Blob([bytes as BlobPart]),path,path);
  setActiveMedia(before);   // a received file must not steal the user's current preview
  return 'error' in r?{error:r.error}:{ok:true};},
 subscribe:fn=>subscribeMedia(fn),
};
