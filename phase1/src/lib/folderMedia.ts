/** Loads PNG, JPEG and PDF files from an opened project folder into the read-only preview list. */
import {MEDIA_FILE,addMediaFile,setActiveMedia} from './media';
export const MAX_FOLDER_MEDIA_FILES=200;
export const MAX_FOLDER_MEDIA_TOTAL=60_000_000;
type Invoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export function base64ToBlob(b64:string):Blob{const bin=atob(b64);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return new Blob([out]);}
export interface FolderMediaResult{loaded:string[];skipped:string[];notice:string}
/** Reads every media path through the `read_media` command. Files that fail, repeat a path or exceed the limits are skipped and reported, never hidden. Does not change the active tab. */
export async function loadFolderMedia(invoke:Invoke,projectId:string,paths:string[]):Promise<FolderMediaResult>{
 const media=paths.filter(p=>MEDIA_FILE.test(p));const loaded:string[]=[],skipped:string[]=[];const seen=new Set<string>();let total=0;
 for(const path of media){
  const lower=path.toLowerCase();
  if(loaded.length>=MAX_FOLDER_MEDIA_FILES||seen.has(lower)||total>=MAX_FOLDER_MEDIA_TOTAL){skipped.push(path);continue;}
  try{const blob=base64ToBlob(await invoke<string>('read_media',{projectId,path}));
   const r=await addMediaFile(blob,path,path);
   if('error' in r){skipped.push(path);continue;}
   seen.add(lower);loaded.push(path);total+=blob.size;
  }catch{skipped.push(path);}
 }
 setActiveMedia(null);
 const notice=!media.length?'':skipped.length?`${loaded.length} of ${media.length} media files loaded for preview. Skipped: ${skipped.slice(0,3).join(', ')}${skipped.length>3?` and ${skipped.length-3} more`:''} (duplicate path, too large, unreadable or not a supported media file).`:`${loaded.length} media file${loaded.length===1?'':'s'} from the folder available in Files > Previews.`;
 return{loaded,skipped,notice};
}
