import {zipSync} from 'fflate';
import type {OutputSink} from './runner';
const safe=(name:string)=>{if(!name||/[\\/]/.test(name)||name==='.'||name==='..')throw Error(`Unsafe output name: ${name}`);return name;};
/** Writes into a user-picked folder (File System Access API). */
export function folderSink(dir:FileSystemDirectoryHandle):OutputSink{
 return{
  async has(name){try{await dir.getFileHandle(safe(name));return true;}catch(e){if((e as DOMException)?.name==='NotFoundError'||(e as DOMException)?.name==='TypeMismatchError')return false;throw e;}},
  async write(name,bytes){const h=await dir.getFileHandle(safe(name),{create:true});const w=await h.createWritable();try{await w.write(bytes as Uint8Array<ArrayBuffer>);await w.close();}catch(e){try{await w.abort();}catch{/* already closed */}throw e;}},
 };}
function save(bytes:Uint8Array,name:string,mime:string){
 const url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);}
/** Fallback without a folder: one file downloads directly, several arrive as one zip. */
export function downloadSink(zipName='somnia-converted.zip'):OutputSink{
 const files:Record<string,Uint8Array>={};const mimes:Record<string,string>={};
 return{has:n=>n in files,async write(n,b,m){files[safe(n)]=b;mimes[n]=m;},
  async finish(){const names=Object.keys(files);if(names.length===1)save(files[names[0]],names[0],mimes[names[0]]);else if(names.length>1)save(zipSync(files),zipName,'application/zip');}};}
/** In-memory sink for tests and previews. */
export function memorySink(existing:string[]=[]):OutputSink&{files:Map<string,Uint8Array>;finished:boolean}{
 const files=new Map<string,Uint8Array>();const lower=new Set(existing.map(e=>e.toLowerCase()));
 const s={files,finished:false,has:(n:string)=>lower.has(n.toLowerCase())||files.has(n),async write(n:string,b:Uint8Array){files.set(safe(n),b);},async finish(){s.finished=true;}};return s;}
export const folderPickerSupported=()=>typeof window!=='undefined'&&'showDirectoryPicker' in window&&window.isSecureContext;
/** Ask for a destination folder. Returns null when cancelled. */
export async function pickOutputFolder():Promise<FileSystemDirectoryHandle|null>{
 try{return await (window as unknown as {showDirectoryPicker(o:object):Promise<FileSystemDirectoryHandle>}).showDirectoryPicker({id:'somnia-convert',mode:'readwrite'});}
 catch(e){if((e as DOMException)?.name==='AbortError')return null;throw e;}}
