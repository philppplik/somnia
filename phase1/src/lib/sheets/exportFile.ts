import type {ExportResult} from './protocol';
const MIME:Record<string,string>={pdf:'application/pdf',csv:'text/csv;charset=utf-8',tsv:'text/tab-separated-values;charset=utf-8',html:'text/html;charset=utf-8'};
/** A safe download name: the file name without its extension and without path or control characters, then the format. */
export function exportName(file:string,format:string,sheet?:string):string{
 const base=file.replace(/\.[A-Za-z0-9]{1,5}$/,'').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'_').trim().slice(0,80)||'workbook';
 return base+(sheet?'-'+sheet.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g,'_').trim().slice(0,40):'')+'.'+format;
}
export function decodeBase64(b64:string):Uint8Array{const bin=atob(b64),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
/** Hands the exported bytes to the browser as a download. Nothing leaves the device. */
export function downloadExport(result:ExportResult,name:string):void{
 const blob=new Blob([decodeBase64(result.base64) as BlobPart],{type:MIME[result.format]??'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10_000);
}
