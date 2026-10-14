import {editedName} from '../imageEditorHost';
import {webFsSupported} from '../webFsPort';
import {getPhotoSession,openPhoto,type PhotoSaveHost} from './studioSession';
import type {MediaItem} from '../media';

export interface BatchOutcome{saved:string[];skipped:string[];failed:{name:string;message:string}[];}
export interface BatchProgress{done:number;total:number;current:string;}

/** Runs one export callback per photo, in library order. A failed photo never aborts the batch. */
export async function runPhotoBatch(names:readonly string[],exportOne:(name:string)=>Promise<'saved'|'cancelled'>,onProgress?:(p:BatchProgress)=>void):Promise<BatchOutcome>{
 const out:BatchOutcome={saved:[],skipped:[],failed:[]};
 for(let i=0;i<names.length;i++){
  onProgress?.({done:i,total:names.length,current:names[i]});
  try{
   const r=await exportOne(names[i]);
   if(r==='saved')out.saved.push(names[i]);else out.skipped.push(names[i]);
  }catch(e){out.failed.push({name:names[i],message:e instanceof Error?e.message:String(e)});}
 }
 onProgress?.({done:names.length,total:names.length,current:''});
 return out;
}

/** Maps each photo's default copy name to a unique target name, suffixing collisions ("a.jpg" + "a.png" both want "a-edited.png"). */
export function uniqueFileNames(names:readonly string[],ext:string):ReadonlyMap<string,string>{
 const seen=new Map<string,number>();const out=new Map<string,string>();
 for(const n of names){
  const base=editedName(n,ext);const c=seen.get(base)??0;seen.set(base,c+1);
  out.set(n,c===0?base:base.replace(`-edited.${ext}`,`-edited-${c+1}.${ext}`));
 }
 return out;
}

/** Picks a writable export directory; null means the user cancelled. Only call when webFsSupported(). */
export async function pickExportDirectory():Promise<FileSystemDirectoryHandle|null>{
 return (window as unknown as {showDirectoryPicker(o:object):Promise<FileSystemDirectoryHandle>}).showDirectoryPicker({mode:'readwrite',id:'somnia-photos-export'}).catch(e=>{if(e instanceof DOMException&&e.name==='AbortError')return null;throw e;});
}

/** Saves copies into a picked directory, applying the collision rename map keyed by the default copy name. */
export function directoryPhotoHost(dir:FileSystemDirectoryHandle,rename?:ReadonlyMap<string,string>):PhotoSaveHost{
 return{async save(blob,suggestedName){
  const final=rename?.get(suggestedName)??suggestedName;
  const h=await dir.getFileHandle(final,{create:true});const w=await h.createWritable();await w.write(blob);await w.close();return true;
 }};
}

/** Opens a photo when needed and waits until its session is ready to render and export. */
export async function ensurePhotoReady(item:MediaItem,timeoutMs=20000):Promise<void>{
 if(!getPhotoSession(item.name))await openPhoto(item);
 const t0=Date.now();
 for(;;){
  const s=getPhotoSession(item.name);
  if(s&&s.status==='ready'&&s.frame)return;
  if(s&&s.status==='error')throw Error(s.error||'error');
  if(Date.now()-t0>timeoutMs)throw Error(`Timed out while opening ${item.name}.`);
  await new Promise(r=>setTimeout(r,60));
 }
}
export {webFsSupported};
