import type {DocumentsEngine} from './engine';
/** Saves what the engine would write as a NEW file next to the original name. The opened file is never overwritten. */
export const copyName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.docx$/i,'')+' (Somnia copy).docx';
export const MAX_COPY_NAME=120;
const baseName=(name:string)=>name.replace(/^.*[\\/]/,'');
/**
 * The file name for a copy: a typed name made safe (no folders, no control or reserved characters, at most 120 characters, always ending in .docx).
 * An empty result falls back to the default, and a name equal to the original's gets " (copy)" so the original is never replaced.
 */
export function safeCopyName(typed:string,original:string):string{
 let n=baseName(typed).replace(/[\u0000-\u001f\u007f-\u009f<>:"|?*\\/]/g,'').replace(/\.docx$/i,'').trim().replace(/^\.+|\.+$/g,'').trim();
 n=Array.from(n).slice(0,MAX_COPY_NAME-5).join('').trim();
 if(!n)return copyName(original);
 const out=n+'.docx';
 return out.toLowerCase()===baseName(original).toLowerCase()?n+' (copy).docx':out;
}
export const pdfName=(name:string)=>name.replace(/^.*[\\/]/,'').replace(/\.docx$/i,'')+'.pdf';
/** The file name for a PDF export: a typed name made safe (no folders, no control or reserved characters, at most 120 characters, always ending in .pdf). Empty falls back to the document name. */
export function safePdfName(typed:string,original:string):string{
 let n=baseName(typed).replace(/[\u0000-\u001f\u007f-\u009f<>:"|?*\\/]/g,'').replace(/\.pdf$/i,'').trim().replace(/^\.+|\.+$/g,'').trim();
 n=Array.from(n).slice(0,MAX_COPY_NAME-4).join('').trim();
 return n?n+'.pdf':pdfName(original);
}
/** Writes the PDF the engine lays out and downloads it. The opened document is untouched. */
export async function savePdf(engine:DocumentsEngine,name:string,fileName?:string|null,options?:import('./protocol').PdfOptions){
 const bytes=await engine.exportPdf(options,new Date().toISOString());
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
 const a=document.createElement('a');a.href=url;a.download=fileName?safePdfName(fileName,name):pdfName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function saveCopy(engine:DocumentsEngine,name:string,fileName?:string|null){
 const bytes=await engine.save(new Date().toISOString());
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 const a=document.createElement('a');a.href=url;a.download=fileName?safeCopyName(fileName,name):copyName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
