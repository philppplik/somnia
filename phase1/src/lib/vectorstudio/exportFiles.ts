/** File export for Vector Studio: SVG text and PNG raster. */
import {downloadText} from '../exportProject';
import {toSvg} from './session';
export const svgFileName=(name:string)=>(name.replace(/\.[^.]+$/,'')||'drawing')+'.svg';
export const pngFileName=(name:string)=>(name.replace(/\.[^.]+$/,'')||'drawing')+'.png';
export const downloadSvg=(name:string)=>downloadText(toSvg(),svgFileName(name),'image/svg+xml');
/** Rasterises the SVG through an <img> and canvas. `scale` multiplies the document size (max 8192 px per side). */
export async function renderPng(svg:string,width:number,height:number,scale=1):Promise<Blob>{
 const w=Math.min(8192,Math.max(1,Math.round(width*scale))),h=Math.min(8192,Math.max(1,Math.round(height*scale)));
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const img=new Image();img.decoding='async';await new Promise<void>((res,rej)=>{img.onload=()=>res();img.onerror=()=>rej(new Error('The SVG could not be rasterised.'));img.src=url;});
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx)throw new Error('Canvas is not available.');ctx.drawImage(img,0,0,w,h);
  return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('PNG encoding failed.')),'image/png'));}
 finally{URL.revokeObjectURL(url);}}
export async function downloadPng(name:string,width:number,height:number,scale=1){
 const blob=await renderPng(toSvg(),width,height,scale);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=pngFileName(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
