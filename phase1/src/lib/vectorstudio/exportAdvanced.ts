import {injectSvgMetadata} from '../export/svgMetadata';
import {injectPngMetadata} from '../export/metadata';
import {areaSvg,renderPngSized,pngFileName,svgFileName} from './exportFiles';
import {vectorPngSize,type VectorAdvancedOptions} from './vectorExportSchema';
export interface VectorExportResult{blob:Blob;bytes:number;width:number;height:number;filename:string}
/** Builds the exact file the Advanced Export dialog will save, so the preview and the download are the same bytes. */
export async function buildVectorExport(o:VectorAdvancedOptions):Promise<VectorExportResult>{
 const a=areaSvg({area:o.area,padding:o.padding});
 const base=o.name||'drawing';
 if(o.format==='svg'){
  const svg=injectSvgMetadata(a.svg,{title:o.metaTitle,description:o.metaDescription});
  const blob=new Blob([svg],{type:'image/svg+xml'});
  return {blob,bytes:blob.size,width:Math.round(a.width),height:Math.round(a.height),filename:svgFileName(base)};
 }
 const size=vectorPngSize(o,a);
 const raw=new Uint8Array(await (await renderPngSized(a.svg,size.width,size.height,o.background)).arrayBuffer());
 const bytes=injectPngMetadata(raw,{title:o.metaTitle,author:o.metaAuthor,copyright:o.metaCopyright,description:o.metaDescription});
 const blob=new Blob([new Uint8Array(bytes).buffer],{type:'image/png'});
 return {blob,bytes:blob.size,width:size.width,height:size.height,filename:pngFileName(base)};
}
export function downloadBlob(blob:Blob,filename:string){
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
