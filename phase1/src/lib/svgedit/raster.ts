/** SVG to PNG export. The rendering backend is swappable: the browser canvas ships built in, a native backend
 *  (resvg on Windows/Linux, CoreGraphics on macOS) can register itself under another id without touching callers. */
import {scanSvg,setAttrs,attr} from './source';
export interface RasterRequest{svg:string;width:number;height:number;background?:string|null}
export interface SvgRasterizer{id:string;render(req:RasterRequest):Promise<Blob>}
const registry=new Map<string,SvgRasterizer>();
export const registerRasterizer=(r:SvgRasterizer)=>{registry.set(r.id,r);};
export const rasterizers=()=>[...registry.keys()];
export const getRasterizer=(id?:string)=>(id&&registry.get(id))||registry.get('native')||registry.get('canvas')!;
export const MAX_PIXELS=64_000_000;

/** Make the root carry an explicit viewBox and pixel size so every backend renders the same frame. Pure text splice. */
export function prepareSvg(text:string,docW:number,docH:number,pxW:number,pxH:number):string{
 const r=scanSvg(text);if(!r.ok)throw new Error(r.error);
 const ch:Record<string,string|null>={width:String(pxW),height:String(pxH)};
 if(!attr(r.root,'viewBox'))ch.viewBox=`0 0 ${docW} ${docH}`;
 if(!attr(r.root,'xmlns'))ch.xmlns='http://www.w3.org/2000/svg';
 return setAttrs(text,r.root,ch);}
export function exportSize(docW:number,docH:number,scale:number):{w:number;h:number}{
 if(!(scale>0)||!(docW>0)||!(docH>0))throw new Error('Invalid export size.');
 const w=Math.max(1,Math.round(docW*scale)),h=Math.max(1,Math.round(docH*scale));
 if(w*h>MAX_PIXELS)throw new Error(`Export would be ${w} x ${h} px. Pick a smaller scale (limit ${Math.round(MAX_PIXELS/1e6)} megapixels).`);
 return{w,h};}

const canvasRasterizer:SvgRasterizer={id:'canvas',async render({svg,width,height,background}){
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();img.decoding='async';img.src=url;await img.decode();
  const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');if(!g)throw new Error('No 2D canvas available.');
  if(background){g.fillStyle=background;g.fillRect(0,0,width,height);}
  g.drawImage(img,0,0,width,height);
  return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('PNG encoding failed.')),'image/png'));
 }finally{URL.revokeObjectURL(url);}}};
registerRasterizer(canvasRasterizer);

export interface ExportOpts{scale:number;background:string|null;backend?:string}
/** Render SVG source to a PNG blob. `doc` is the document size in user units. */
export async function svgToPng(text:string,doc:{w:number;h:number},o:ExportOpts):Promise<Blob>{
 const {w,h}=exportSize(doc.w,doc.h,o.scale);
 return getRasterizer(o.backend).render({svg:prepareSvg(text,doc.w,doc.h,w,h),width:w,height:h,background:o.background});}
