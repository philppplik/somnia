import {validateAnimationAssets} from './assetsValidation';
import {validEffects,validSource} from './model';
import {effectPrimitives,effectBounds,revealedText} from './effects';
import type {InterfaceAsset} from '../interface/schema';
import {Zip,ZipPassThrough,strToU8} from 'fflate';
import {sceneAt} from './scene';
import {workAreaFrames} from './playback';
import {frameToTick,tickToFrame} from './time';
import type {Composition,Layer} from './model';
/** PNG frame export and work-area PNG-sequence ZIP. Pure builders plus an injected rasteriser so the logic is testable without a canvas. */
export const MAX_FRAMES=3600;
/** Cap on all PNG bytes held for one ZIP. The ZIP is assembled from chunks into one Blob, never one giant buffer. */
export const MAX_ZIP_BYTES=768*1024*1024;
export const MAX_PIXELS=8192*8192;
export class ExportError extends Error{constructor(message:string,readonly code:'too-large'|'too-many'|'raster'|'cancelled'|'empty'){super(message);this.name='ExportError';}}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=(n:number)=>String(Math.round(n*1e4)/1e4);
function layerSvg(l:Layer,assets:readonly InterfaceAsset[],tick:number):string{
 const s=l.source;
 if(l.kind==='raster'){const asset=assets.find(a=>a.id===s.assetId);if(!asset)throw new ExportError('Missing image asset.','raster');return `<image href="${asset.data}" width="${num(s.width??asset.width)}" height="${num(s.height??asset.height)}"/>`;}

 if(l.kind==='solid')return `<rect x="0" y="0" width="${num(s.width??0)}" height="${num(s.height??0)}" fill="${esc(s.color??'#000')}"/>`;
 if(l.kind==='shape')return s.shape==='ellipse'
  ?`<ellipse cx="${num((s.width??0)/2)}" cy="${num((s.height??0)/2)}" rx="${num((s.width??0)/2)}" ry="${num((s.height??0)/2)}" fill="${esc(s.color??'#000')}"/>`
  :`<rect x="0" y="0" width="${num(s.width??0)}" height="${num(s.height??0)}" fill="${esc(s.color??'#000')}"/>`;
 return `<text x="0" y="${num(s.size??48)}" font-size="${num(s.size??48)}" fill="${esc(s.color??'#fff')}" font-family="system-ui, sans-serif">${esc(revealedText(l,tick))}</text>`;
}
/** Standalone SVG of the composition at `tick`. `transparent` omits the background rectangle so PNG output keeps real alpha. */
export function frameSvg(comp:Composition,tick:number,transparent=false,assets:readonly InterfaceAsset[]=[]):string{
 validateAnimationAssets({assets,compositions:[comp]});
 if(comp.layers.some(l=>!validSource(l.source)||!validEffects(l.effects)))throw new ExportError('Invalid layer source/effects.','raster');
 const defs=comp.layers.map((l,i)=>{const b=effectBounds(l,tick);return `<filter id="effect-${i}" filterUnits="userSpaceOnUse" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" color-interpolation-filters="sRGB">${effectPrimitives(l,tick)}</filter>`;}).join('');
 const body=sceneAt(comp,tick).map(({layer,matrix,opacity})=>`<g transform="matrix(${matrix.map(num).join(' ')})" opacity="${num(opacity)}">${effectPrimitives(layer,tick)?`<g filter="url(#effect-${comp.layers.indexOf(layer)})">`:""}${layerSvg(layer,assets,tick)}${effectPrimitives(layer,tick)?"</g>":""}</g>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${comp.width}" height="${comp.height}" viewBox="0 0 ${comp.width} ${comp.height}"><defs>${defs}</defs>${transparent?'':`<rect width="${comp.width}" height="${comp.height}" fill="${esc(comp.background)}"/>`}${body}</svg>`;
}
export const exportSlug=(name:string)=>name.normalize('NFKD').replace(/[^\w.-]+/g,'_').replace(/^[_.]+|[_.]+$/g,'').slice(0,80)||'animation';
export const frameFileName=(name:string,frameNumber:number)=>`${exportSlug(name)}_${String(frameNumber).padStart(5,'0')}.png`;
/** Ticks of every frame in the work area, in order. Frame numbers in file names count from the composition start (frame 0). */
export function sequencePlan(comp:Composition){
 const {first,count}=workAreaFrames(comp.workArea,comp.fps);const startFrame=tickToFrame(comp.start,comp.fps);
 return Array.from({length:count},(_,i)=>({frame:first+i-startFrame,tick:frameToTick(first+i,comp.fps)}));
}
export function checkExportable(comp:Composition,frames:number){
 if(comp.width*comp.height>MAX_PIXELS)throw new ExportError(`Frame size ${comp.width}x${comp.height} is above the supported limit.`,'too-large');
 if(frames<1)throw new ExportError('The work area has no frames.','empty');
 if(frames>MAX_FRAMES)throw new ExportError(`${frames} frames is above the limit of ${MAX_FRAMES} for one ZIP. Shorten the work area.`,'too-many');
}
export type Rasterize=(svg:string,width:number,height:number)=>Promise<Uint8Array>;
export interface SequenceOptions{rasterize:Rasterize;assets?:readonly InterfaceAsset[];transparent?:boolean;signal?:AbortSignal;onProgress?:(done:number,total:number)=>void;maxBytes?:number}
export interface SequenceResult{blob:Blob;fileName:string;frames:number;bytes:number}
export function sequenceManifest(comp:Composition,plan:readonly {frame:number;tick:number}[],name:string,transparent:boolean){
 return {format:'somnia-animation-png-sequence',version:1,composition:comp.name,width:comp.width,height:comp.height,frameRate:{num:comp.fps.num,den:comp.fps.den},ticksPerSecond:240000,
  workArea:{inTicks:comp.workArea.in,outTicksExclusive:comp.workArea.out},frameCount:plan.length,firstFrame:plan[0]?.frame??0,
  alpha:transparent?'straight alpha: background omitted, pixels outside layers are transparent':'opaque: composition background colour is part of every frame',background:comp.background,
  files:plan.map(p=>({file:frameFileName(name,p.frame),frame:p.frame,tick:p.tick}))};
}
/** Renders the work area to a ZIP of PNGs plus manifest.json. Throws ExportError and returns nothing on any failure, so no partial file exists. */
export async function exportSequenceZip(comp:Composition,name:string,o:SequenceOptions):Promise<SequenceResult>{
 const plan=sequencePlan(comp);checkExportable(comp,plan.length);
 const limit=o.maxBytes??MAX_ZIP_BYTES;const parts:Uint8Array[]=[];let zipErr:Error|null=null;
 const zip=new Zip((err,chunk)=>{if(err)zipErr=err;else parts.push(chunk);});
 let bytes=0;
 const stop=()=>{if(o.signal?.aborted)throw new ExportError('Export cancelled.','cancelled');};
 for(let i=0;i<plan.length;i++){
  stop();
  let png:Uint8Array;
  try{png=await o.rasterize(frameSvg(comp,plan[i].tick,!!o.transparent,o.assets),comp.width,comp.height);}
  catch(e){if(e instanceof ExportError)throw e;throw new ExportError(`Frame ${plan[i].frame} could not be rendered: ${(e as Error).message}`,'raster');}
  bytes+=png.byteLength;
  if(bytes>limit)throw new ExportError(`The sequence is larger than ${Math.round(limit/1048576)} MB. Shorten the work area or reduce the size.`,'too-large');
  const f=new ZipPassThrough(frameFileName(name,plan[i].frame));zip.add(f);f.push(png,true);
  o.onProgress?.(i+1,plan.length);
 }
 stop();
 const man=new ZipPassThrough('manifest.json');zip.add(man);man.push(strToU8(JSON.stringify(sequenceManifest(comp,plan,name,!!o.transparent),null,1)),true);
 zip.end();
 if(zipErr)throw new ExportError(`ZIP could not be written: ${(zipErr as Error).message}`,'raster');
 return {blob:new Blob(parts as BlobPart[],{type:'application/zip'}),fileName:`${exportSlug(name)}_frames.zip`,frames:plan.length,bytes};
}
/** One PNG of the playhead frame. */
export async function exportFramePng(comp:Composition,tick:number,name:string,rasterize:Rasterize,transparent=false,assets:readonly InterfaceAsset[]=[]){
 checkExportable(comp,1);
 try{const png=await rasterize(frameSvg(comp,tick,transparent,assets),comp.width,comp.height);
  return {blob:new Blob([png as BlobPart],{type:'image/png'}),fileName:frameFileName(name,tickToFrame(tick,comp.fps)-tickToFrame(comp.start,comp.fps))};}
 catch(e){if(e instanceof ExportError)throw e;throw new ExportError(`The frame could not be rendered: ${(e as Error).message}`,'raster');}
}
/** Browser rasteriser: SVG as an image into a canvas, then PNG bytes. Needs DOM; covered by the CI app test, not by unit tests. */
export const canvasRasterize:Rasterize=async(svg,width,height)=>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();img.decoding='async';
  await new Promise<void>((ok,no)=>{img.onload=()=>ok();img.onerror=()=>no(new Error('image decode failed'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D canvas is unavailable');
  ctx.drawImage(img,0,0,width,height);
  const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
  if(!blob)throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
 }finally{URL.revokeObjectURL(url);}
};
export function downloadBlob(blob:Blob,fileName:string){
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
