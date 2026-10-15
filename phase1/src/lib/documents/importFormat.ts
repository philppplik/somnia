import {DocumentsEngine} from './engine';
import {EXPORT_EXTS,type ExportExt} from './protocol';
import {addMediaFile,findMedia} from '../media';
/** Largest file the import takes (the worker enforces the same limit). */
export const MAX_IMPORT_BYTES=16*1024*1024;
const ALIASES:Record<string,ExportExt>={markdown:'md',htm:'html',xhtml:'html',text:'txt'};
/** The import format a file name stands for, or null when it is not one of Markdown, HTML, text, RTF or ODT. */
export function importExt(name:string):ExportExt|null{
 const m=/\.([a-z0-9]{1,10})$/i.exec(name.replace(/^.*[\\/]/,''));if(!m)return null;
 const e=m[1].toLowerCase();const x=ALIASES[e]??e;
 return (EXPORT_EXTS as readonly string[]).includes(x)?x as ExportExt:null;
}
/** The DOCX name an imported file opens as: the original name without its extension plus ".docx". */
export function importedName(name:string,taken:(n:string)=>boolean=()=>false):string{
 const base=Array.from(name.replace(/^.*[\\/]/,'').replace(/\.[a-z0-9]{1,10}$/i,'').replace(/[\u0000-\u001f\u007f-\u009f<>:"|?*\\/]/g,'').trim()||'Imported').slice(0,100).join('');
 let n=base+'.docx';for(let i=2;taken(n)&&i<100;i++)n=`${base} (${i}).docx`;return n;
}
/**
 * Converts a Markdown, HTML, text, RTF or ODT file to a DOCX in a short-lived engine and opens it as a new document.
 * The original file is never changed. Rejects with a readable message.
 */
export async function importFormatFile(file:Blob,rawName:string,engineFactory:()=>DocumentsEngine=()=>new DocumentsEngine()):Promise<{name:string}|{error:string}>{
 const ext=importExt(rawName);if(!ext)return{error:`${rawName} is not a Markdown, HTML, text, RTF or ODT file.`};
 if(file.size===0)return{error:`${rawName} is empty.`};
 if(file.size>MAX_IMPORT_BYTES)return{error:`${rawName} is larger than 16 MB.`};
 const e=engineFactory();
 try{
  await e.init();
  const docx=await e.importFormat(ext,await file.arrayBuffer());
  const name=importedName(rawName,n=>!!findMedia(n));
  return await addMediaFile(new File([docx as BlobPart],name,{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),name);
 }catch(err){return{error:err instanceof Error?err.message:String(err)};}
 finally{e.dispose();}
}
/** Opens the file picker for an import. */
export function pickAndImport():Promise<{name:string}|{error:string}|null>{
 return new Promise(resolve=>{
  const input=document.createElement('input');input.type='file';input.accept='.md,.markdown,.html,.htm,.txt,.rtf,.odt';
  input.onchange=()=>{const f=input.files?.[0];if(!f){resolve(null);return;}void importFormatFile(f,f.name).then(resolve);};
  input.oncancel=()=>resolve(null);input.click();
 });
}
