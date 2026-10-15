import type {DocumentsEngine} from './engine';
import {savedAuthor} from './author';
import type {ExportExt} from './protocol';
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
/** Name and media type of each other export format. */
export const EXPORT_FORMATS:Record<ExportExt,{mime:string}>={
 md:{mime:'text/markdown'},html:{mime:'text/html'},txt:{mime:'text/plain'},rtf:{mime:'application/rtf'},odt:{mime:'application/vnd.oasis.opendocument.text'},
};
const stripExt=(n:string)=>n.replace(/\.(docx|md|html|txt|rtf|odt|pdf)$/i,'');
export const formatName=(name:string,ext:ExportExt)=>stripExt(baseName(name))+'.'+ext;
/** The file name for an export in another format: a typed name made safe (no folders, no control or reserved characters, at most 120 characters, always ending in the format's extension). */
export function safeFormatName(typed:string,original:string,ext:ExportExt):string{
 let n=stripExt(baseName(typed).replace(/[\u0000-\u001f\u007f-\u009f<>:"|?*\\/]/g,'').trim()).replace(/^\.+|\.+$/g,'').trim();
 n=Array.from(n).slice(0,MAX_COPY_NAME-5).join('').trim();
 return n?n+'.'+ext:formatName(original,ext);
}
/** Writes the document in another format and downloads it. The opened document is untouched. */
export async function saveFormat(engine:DocumentsEngine,name:string,ext:ExportExt,fileName?:string|null){
 const bytes=await engine.exportFormat(ext);
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:EXPORT_FORMATS[ext].mime}));
 const a=document.createElement('a');a.href=url;a.download=fileName?safeFormatName(fileName,name,ext):formatName(name,ext);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** Longest side, in pixels, the page renderer accepts. */
export const MAX_PNG_SIDE=2400;
/** Scale (at most 2, the renderer's limit) that keeps the longest side of a page of `width` x `height` inside MAX_PNG_SIDE; null for a page without size. */
export function pngScale(width:number,height:number):number|null{
 if(!(width>0)||!(height>0)||!Number.isFinite(width)||!Number.isFinite(height))return null;
 return Math.floor(Math.min(2,MAX_PNG_SIDE/Math.max(width,height))*100)/100;
}
/** `name-page-3.png` for page 3 (1-based) of a document. */
export const pngName=(name:string,page:number)=>(stripExt(baseName(name)).replace(/[\u0000-\u001f\u007f-\u009f<>:"|?*\\/]/g,'').trim().slice(0,100)||'document')+'-page-'+page+'.png';
/** Renders one page (0-based) as a PNG image and downloads it. The opened document is untouched. */
export async function savePagePng(engine:DocumentsEngine,name:string,index:number,width:number,height:number){
 const scale=pngScale(width,height);if(scale===null)throw new Error('The page has no size.');
 const blob=await engine.render(index,scale);
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=pngName(name,index+1);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function saveCopy(engine:DocumentsEngine,name:string,fileName?:string|null){
 const bytes=await engine.save(new Date().toISOString(),savedAuthor()||undefined);
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 const a=document.createElement('a');a.href=url;a.download=fileName?safeCopyName(fileName,name):copyName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
