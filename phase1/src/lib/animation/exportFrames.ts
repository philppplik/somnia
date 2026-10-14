import {evaluate} from './interpolate';
import {repeaterCopies} from './repeater';
import {radialPath,gradientDefSvg} from './shapes';
import {layerPathD,layerFillRule} from './pathLayer';
import {validateAnimationAssets} from './assetsValidation';
import {textFontStack,validEffects,validSource,MAX_PRECOMP_DEPTH} from './model';
import {effectPrimitives,effectBounds,revealedText,strokeAttributes,layerColorsAt} from './effects';
import type {InterfaceAsset} from '../interface/schema';
import {Zip,ZipPassThrough,strToU8} from 'fflate';
import {maskDefs,maskId,matteId,hasMasks} from './masks';
import {animatedChars,textPathD,textPathId} from './textAnimators';
import {sceneAt,motionBlurTicks,contentSampled} from './scene';
import {workAreaFrames} from './playback';
import {frameToTick,tickToFrame} from './time';
import type {Composition,Layer} from './model';
/** PNG frame export and work-area PNG-sequence ZIP. Pure builders plus an injected rasteriser so the logic is testable without a canvas. */
export const MAX_FRAMES=1800;
/** Cap on all PNG bytes held for one ZIP. The ZIP is assembled from chunks into one Blob, never one giant buffer. */
export const MAX_ZIP_BYTES=64*1024*1024;
export const MAX_PIXELS=8192*8192;
export class ExportError extends Error{constructor(message:string,readonly code:'too-large'|'too-many'|'raster'|'cancelled'|'empty'|'unsupported'){super(message);this.name='ExportError';}}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=(n:number)=>String(Math.round(n*1e4)/1e4);
/** Effects group plus content of one layer in its own space, as drawn in a frame or inside a matte. */
export function layerBody(layer:Layer,i:number,assets:readonly InterfaceAsset[],tick:number,prefix:string):string{
 const fx=effectPrimitives(layer,tick)?`url(#${prefix}effect-${i})`:'';
 const content=layerSvg(layer,assets,tick,layer.source.gradient?`url(#${prefix}gradient-${i})`:undefined,layer.stroke?.gradient?`url(#${prefix}stroke-gradient-${i})`:undefined);
 const body=fx?`<g filter="${fx}">${content}</g>`:content;
 if(!layer.repeater)return body;
 const a=evaluate(layer.transform.anchor,tick) as [number,number];
 return repeaterCopies(layer.repeater,[a[0],a[1]]).map(c=>`<g transform="${c.transform}"${c.opacity<1?` opacity="${c.opacity}"`:''}>${body}</g>`).join('')+body;
}
/**
 * Compositions a comp layer may show. frameSvg sets them for the duration of one (synchronous) call and the live viewer sets them while it renders,
 * so layer drawing needs no extra parameter. `nest` counts how deep a precomp is being drawn.
 */
let renderComps:readonly Composition[]=[];let nest=0;
export const setRenderComps=(comps:readonly Composition[])=>{renderComps=comps;};
/** Picture of a comp layer: the other composition at its own time, as a self-contained SVG image (no background, so it composites). Empty when it cannot be drawn. */
/** Child time for a comp layer: speed, offset and optional loop on top of the plain mapping. Without those fields it is the plain mapping. */
export function precompLocal(l:Layer,child:Composition,tick:number):number{
 const s=l.source;const rel=tick-(l.inT+l.offset);
 if(s.speed===undefined&&s.timeOffset===undefined&&!s.loop)return child.start+rel;
 const t=Math.round(rel*(s.speed??100)/100)+(s.timeOffset??0);
 if(!s.loop||child.duration<1)return child.start+t;
 return child.start+(((t%child.duration)+child.duration)%child.duration);
}
export function precompImage(l:Layer,tick:number,assets:readonly InterfaceAsset[]):{href:string;width:number;height:number}|null{
 const child=renderComps.find(c=>c.id===l.source.compId);if(!child||nest>=MAX_PRECOMP_DEPTH+1)return null;
 const local=precompLocal(l,child,tick);const keep=nest;nest++;
 try{const svg=frameSvg(child,local,true,assets,renderComps);return {href:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,width:l.source.width??child.width,height:l.source.height??child.height};}
 finally{nest=keep;}
}
function layerSvg(layer:Layer,assets:readonly InterfaceAsset[],tick:number,fillOverride?:string,strokePaint?:string):string{
 const l=layerColorsAt(layer,tick),s=l.source;const fill=fillOverride??esc(s.color??'#000');
 if(l.kind==='comp'){const p=precompImage(l,tick,assets);return p?`<image href="${p.href}" width="${num(p.width)}" height="${num(p.height)}"/>`:'';}
 if(l.kind==='raster'){const asset=assets.find(a=>a.id===s.assetId);if(!asset)throw new ExportError('Missing image asset.','raster');return `<image href="${asset.data}" width="${num(s.width??asset.width)}" height="${num(s.height??asset.height)}"/>`;}

 if(l.kind==='solid')return `<rect x="0" y="0" width="${num(s.width??0)}" height="${num(s.height??0)}" fill="${fill}"/>`;
 const stroke=strokeAttributes(l,tick,strokePaint);const strokeSvg=stroke?` stroke="${stroke.stroke}" stroke-width="${stroke.strokeWidth}" pathLength="100" stroke-dasharray="${stroke.strokeDasharray}" stroke-dashoffset="${stroke.strokeDashoffset}"${stroke.strokeLinejoin?` stroke-linejoin="${stroke.strokeLinejoin}"`:''}${stroke.strokeLinecap?` stroke-linecap="${stroke.strokeLinecap}"`:''}${stroke.strokeMiterlimit!==undefined?` stroke-miterlimit="${num(stroke.strokeMiterlimit)}"`:''}${stroke.strokeOpacity!==undefined?` stroke-opacity="${num(stroke.strokeOpacity)}"`:''}`:'';
 if(l.kind==='shape'){
  const fl=` fill="${fill}"`,star=['star','polygon'].includes(s.shape??''),pathShape=s.shape==='path'&&!!s.path;
  const el=(sv:string,f:string,clip=false):string=>star?`<path d="${radialPath(s)}"${sv}${f}/>`
   :pathShape?`<path d="${layerPathD(l,tick)}"${layerFillRule(l)?` ${clip?'clip-rule':'fill-rule'}="evenodd"`:''}${sv}${f}/>`
   :s.shape==='ellipse'?`<ellipse cx="${num((s.width??0)/2)}" cy="${num((s.height??0)/2)}" rx="${num((s.width??0)/2)}"${sv} ry="${num((s.height??0)/2)}"${f}/>`
   :`<rect x="0" y="0" width="${num(s.width??0)}" height="${num(s.height??0)}" rx="${s.shape==='roundedRect'?Math.min(s.radius??24,(s.width??0)/2,(s.height??0)/2):0}"${sv}${f}/>`;
  const align=l.stroke?.align;
  if(stroke&&(align==='inside'||align==='outside')&&!(pathShape&&!s.path!.closed)){
   const id=`stroke-align-${esc(l.id)}-${tick}`,wide=strokeSvg.replace(/stroke-width="[^"]*"/,`stroke-width="${num(stroke.strokeWidth*2)}"`);
   const cut=align==='inside'?`<clipPath id="${id}">${el('',' fill="#fff"',true)}</clipPath>`:`<mask id="${id}" maskUnits="userSpaceOnUse" x="-4096" y="-4096" width="9000" height="9000"><rect x="-4096" y="-4096" width="9000" height="9000" fill="#fff"/>${el('',' fill="#000"')}</mask>`;
   return `${el('',fl)}<defs>${cut}</defs><g ${align==='inside'?'clip-path':'mask'}="url(#${id})">${el(wide,' fill="none"')}</g>`;
  }
  return el(strokeSvg,fl);
 }
 const tp=textPathD(l);
 if(tp)return `<defs><path id="${textPathId(l)}" d="${tp}"/></defs><text font-size="${num(s.size??48)}" fill="${esc(s.color??'#fff')}" font-family="${esc(textFontStack(s.font))}"><textPath href="#${textPathId(l)}" startOffset="${num(s.textPathStart??0)}%">${textBody(l,tick,num(s.size??48))}</textPath></text>`;
 return `<text x="0" y="${num(s.size??48)}" font-size="${num(s.size??48)}" fill="${esc(s.color??'#fff')}" font-family="${esc(textFontStack(s.font))}">${textBody(l,tick,num(s.size??48))}</text>`;
}
/** Standalone SVG of the composition at `tick`. `transparent` omits the background rectangle so PNG output keeps real alpha. */
export function frameSvg(comp:Composition,tick:number,transparent=false,assets:readonly InterfaceAsset[]=[],comps?:readonly Composition[]):string{
 const prev=renderComps;if(comps)renderComps=comps;
 try{return frameSvgBody(comp,tick,transparent,assets);}finally{renderComps=prev;}
}
function frameSvgBody(comp:Composition,tick:number,transparent:boolean,assets:readonly InterfaceAsset[]):string{
 /** Audio layers are not drawn and their files are not part of frame export, so only the pictures are checked here. */
 validateAnimationAssets({assets,compositions:[{...comp,layers:comp.layers.filter(l=>l.kind!=='audio')}]});
 if(comp.layers.some(l=>!validSource(l.source)||!validEffects(l.effects)))throw new ExportError('Invalid layer source/effects.','raster');
 const defs=comp.layers.map((l,i)=>{const b=effectBounds(l,tick);return `<filter id="effect-${i}" filterUnits="userSpaceOnUse" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" color-interpolation-filters="sRGB">${effectPrimitives(l,tick)}</filter>`;}).join('');
 const gradients=comp.layers.map((l,i)=>l.source.gradient?gradientDefSvg(`gradient-${i}`,l.source.gradient):'').join('')+comp.layers.map((l,i)=>l.stroke?.gradient?gradientDefSvg(`stroke-gradient-${i}`,l.stroke.gradient):'').join('');
 const body=sceneAt(comp,tick).map(({layer,matrix,opacity})=>{const i=comp.layers.indexOf(layer);
  const wrap=(inner:string)=>hasMasks(layer)?`<g mask="url(#${maskId('',i)})">${inner}</g>`:inner;
  const masked=wrap(layerBody(layer,i,assets,tick,''));
  const blur=motionBlurTicks(comp,layer,tick),each=contentSampled(layer);
  const drawn=blur.length?`<g opacity="${num(opacity)}">${blur.map((m,j)=>`<g transform="matrix(${m.matrix.map(num).join(' ')})" opacity="${num(1/(j+1))}">${each?wrap(layerBody(layer,i,assets,m.tick,'')):masked}</g>`).join('')}</g>`:`<g transform="matrix(${matrix.map(num).join(' ')})" opacity="${num(opacity)}">${masked}</g>`;
  return layer.matte?`<g mask="url(#${matteId('',i)})">${drawn}</g>`:drawn;}).join('');
 const maskDefsSvg=maskDefs(comp,tick,'',(l,i)=>layerBody(l,i,assets,tick,''));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${comp.width}" height="${comp.height}" viewBox="0 0 ${comp.width} ${comp.height}"><defs>${defs}${gradients}${maskDefsSvg}</defs>${transparent?'':`<rect width="${comp.width}" height="${comp.height}" fill="${esc(comp.background)}"/>`}${body}</svg>`;
}
export const exportSlug=(name:string)=>name.normalize('NFKD').replace(/[^\w.-]+/g,'_').replace(/^[_.]+|[_.]+$/g,'').slice(0,80)||'animation';
export const frameFileName=(name:string,frameNumber:number)=>`${exportSlug(name)}_${String(frameNumber).padStart(5,'0')}.png`;
/** Ticks of every frame in the work area, in order. Frame numbers in file names count from the composition start (frame 0). */
export function sequencePlan(comp:Composition){
 const {first,count}=workAreaFrames(comp.workArea,comp.fps);const startFrame=tickToFrame(comp.start,comp.fps);
 checkExportable(comp,count);return Array.from({length:count},(_,i)=>({frame:first+i-startFrame,tick:frameToTick(first+i,comp.fps)}));
}
export function checkExportable(comp:Composition,frames:number){
 if(comp.width*comp.height>MAX_PIXELS)throw new ExportError(`Frame size ${comp.width}x${comp.height} is above the supported limit.`,'too-large');
 if(frames<1)throw new ExportError('The work area has no frames.','empty');
 if(frames>MAX_FRAMES)throw new ExportError(`${frames} frames is above the limit of ${MAX_FRAMES} for one ZIP. Shorten the work area.`,'too-many');
}
export type Rasterize=(svg:string,width:number,height:number)=>Promise<Uint8Array>;
export interface OutputSize{width:number;height:number}
export interface SequenceOptions{size?:OutputSize;rasterize:Rasterize;assets?:readonly InterfaceAsset[];transparent?:boolean;signal?:AbortSignal;onProgress?:(done:number,total:number)=>void;maxBytes?:number}
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
  try{png=await o.rasterize(frameSvg(comp,plan[i].tick,!!o.transparent,o.assets),o.size?.width??comp.width,o.size?.height??comp.height);}
  catch(e){if(e instanceof ExportError)throw e;throw new ExportError(`Frame ${plan[i].frame} could not be rendered: ${(e as Error).message}`,'raster');}
  stop();bytes+=png.byteLength;
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
export async function exportFramePng(comp:Composition,tick:number,name:string,rasterize:Rasterize,transparent=false,assets:readonly InterfaceAsset[]=[],size?:OutputSize){
 checkExportable(comp,1);
 try{const png=await rasterize(frameSvg(comp,tick,transparent,assets),size?.width??comp.width,size?.height??comp.height);
  return {blob:new Blob([png as BlobPart],{type:'image/png'}),fileName:frameFileName(name,tickToFrame(tick,comp.fps)-tickToFrame(comp.start,comp.fps))};}
 catch(e){if(e instanceof ExportError)throw e;throw new ExportError(`The frame could not be rendered: ${(e as Error).message}`,'raster');}
}
/** Browser rasteriser: SVG as an image into a canvas, then PNG bytes. Needs DOM; covered by the CI app test, not by unit tests. */
/** Browser pixel rasteriser for palette-based formats: SVG into a canvas, RGBA bytes out. Needs DOM. */
export const canvasPixels:RasterizePixels=async(svg,width,height)=>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();img.decoding='async';
  await new Promise<void>((ok,no)=>{img.onload=()=>ok();img.onerror=()=>no(new Error('image decode failed'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D canvas is unavailable');
  ctx.drawImage(img,0,0,width,height);
  return ctx.getImageData(0,0,width,height).data;
 }finally{URL.revokeObjectURL(url);}
};
export type RasterizePixels=(svg:string,width:number,height:number)=>Promise<Uint8ClampedArray>;
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

/** Text content of a text layer: plain, or one span per character when animators apply. Shifts and fill-opacity are exact; scale resizes the glyph. */
function textBody(l:Layer,tick:number,size:string):string{
 const shown=revealedText(l,tick),spans=animatedChars(l,l.source.text??'',tick);
 if(!spans)return esc(shown);
 const count=Array.from(shown).length;
 return spans.slice(0,count).map(c=>`<tspan dx="${num(c.dx)}" dy="${num(c.dy)}" font-size="${num(Number(size)*c.scale)}" fill-opacity="${num(c.opacity)}"${c.rotate?` rotate="${num(c.rotate)}"`:''}${c.fill?` fill="${c.fill}"`:''}>${esc(c.ch)}</tspan>`).join('');
}
