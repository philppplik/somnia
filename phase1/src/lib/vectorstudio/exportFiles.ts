/** File export for Vector Studio: SVG text and PNG raster. */
import {downloadText} from '../exportProject';
import {exportSvg,normalizeDoc} from '../vectorio';
import {getVectorSession} from './session';
import {exportAreaDoc,type ExportArea} from './exportArea';
export interface AreaOptions{area?:ExportArea;padding?:number}
export type PngBackground='transparent'|'white';
/** SVG text and size for the chosen area of the open document (page by default). */
export function areaSvg(o:AreaOptions={}):{svg:string;width:number;height:number}{
 const s=getVectorSession(),d=exportAreaDoc(s.doc,s.selection,o.area??'page',o.padding??0);
 return {svg:exportSvg(normalizeDoc(d)),width:d.width,height:d.height};}
export const svgFileName=(name:string)=>(name.replace(/\.[^.]+$/,'')||'drawing')+'.svg';
export const pngFileName=(name:string)=>(name.replace(/\.[^.]+$/,'')||'drawing')+'.png';
export const downloadSvg=(name:string,o:AreaOptions={})=>downloadText(areaSvg(o).svg,svgFileName(name),'image/svg+xml');
/** Rasterises the SVG through an <img> and canvas. `scale` multiplies the document size (max 8192 px per side). */
export const pngDimensions=(width:number,height:number,scale=1)=>({width:Math.min(8192,Math.max(1,Math.round(width*scale))),height:Math.min(8192,Math.max(1,Math.round(height*scale)))});
export async function renderPng(svg:string,width:number,height:number,scale=1,background:PngBackground='transparent'):Promise<Blob>{
 const {width:w,height:h}=pngDimensions(width,height,scale);
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const img=new Image();img.decoding='async';await new Promise<void>((res,rej)=>{img.onload=()=>res();img.onerror=()=>rej(new Error('The SVG could not be rasterised.'));img.src=url;});
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas is not available.');if(background==='white'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);}ctx.drawImage(img,0,0,w,h);
  return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('PNG encoding failed.')),'image/png'));}
 finally{URL.revokeObjectURL(url);}}
export async function downloadPng(name:string,width:number,height:number,scale=1,o:AreaOptions&{background?:PngBackground}={}){
 const a0=areaSvg(o),blob=await renderPng(a0.svg,o.area&&o.area!=='page'?a0.width:width,o.area&&o.area!=='page'?a0.height:height,scale,o.background);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=pngFileName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
/** Rasterises to an exact pixel size (AE2). Same pipeline as renderPng; the caller owns the size limits. */
export async function renderPngSized(svg:string,width:number,height:number,background:PngBackground='transparent'):Promise<Blob>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const img=new Image();img.decoding='async';await new Promise<void>((res,rej)=>{img.onload=()=>res();img.onerror=()=>rej(new Error('The SVG could not be rasterised.'));img.src=url;});
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas is not available.');if(background==='white'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);}ctx.drawImage(img,0,0,width,height);
  return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('PNG encoding failed.')),'image/png'));}
 finally{URL.revokeObjectURL(url);}}
