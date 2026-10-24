import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Composition} from './model';
import {layerSetIds} from './layerSet';
import {worldMatrix,applyMatrix} from './scene';
import {snapToFrame,frameToTick} from './time';
import {setExportSettings} from './exportJob';
import {ExportError} from './exportFrames';
import type {ExportCrop} from './exportSettings';
/** Export crop from layers: the rectangle that holds the chosen layers, over one frame or the whole work area. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_CROP_LAYERS=50,MAX_CROP_PADDING=500,CROP_SAMPLES=48;
/** Rectangle (whole pixels, inside the composition) around the boxes of `ids` at the given ticks, grown by `padding`. Layers without a known size are counted in `unsized`. */
export function layerCrop(c:Composition,ids:readonly string[],ticks:readonly number[],padding:number):{crop:ExportCrop|null;unsized:number}{
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,unsized=0;
 for(const id of ids){const l=findLayer(c,id);if(!l||l.kind==='audio')continue;const w=l.source.width,h=l.source.height;
  if(!(w&&h&&w>0&&h>0)){unsized++;continue;}
  for(const t of ticks){const m=worldMatrix(c,l,t);for(const q of [[0,0],[w,0],[0,h],[w,h]] as const){const p=applyMatrix(m,[q[0],q[1]]);x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}}}
 if(!Number.isFinite(x0))return {crop:null,unsized};
 const ax=Math.max(0,Math.floor(x0-padding)),ay=Math.max(0,Math.floor(y0-padding)),bx=Math.min(c.width,Math.ceil(x1+padding)),by=Math.min(c.height,Math.ceil(y1+padding));
 if(bx-ax<1||by-ay<1)return {crop:null,unsized};
 return {crop:{x:ax,y:ay,width:bx-ax,height:by-ay},unsized};
}
/** Up to CROP_SAMPLES ticks evenly spread over the work area (always its first and last frame). */
export function workAreaTicks(c:Composition):number[]{
 const a=snapToFrame(c.workArea.in,c.fps),b=Math.max(a,snapToFrame(Math.max(a,c.workArea.out-frameToTick(1,c.fps)),c.fps)),n=Math.min(CROP_SAMPLES,Math.max(2,Math.round((b-a)/frameToTick(1,c.fps))+1));
 return [...new Set(Array.from({length:n},(_,i)=>snapToFrame(a+(b-a)*i/(n-1),c.fps)))];
}
export const exportCropSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.export.cropToLayers',title:'Set the export crop to the selected layers',category:'Project',level:'ui',keywords:['animation','export','crop','layers','bounds','trim','sprite','fit','area'],
 params:{type:'object',properties:{padding:{type:'integer',minimum:0,maximum:MAX_CROP_PADDING},range:{enum:['frame','workarea']},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_CROP_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{padding?:number;range?:'frame'|'workarea';layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const padding=p.padding??8;if(!Number.isInteger(padding)||padding<0||padding>MAX_CROP_PADDING)return expected(`The padding must be 0 to ${MAX_CROP_PADDING} pixels.`);
  const range=p.range??'workarea';if(range!=='frame'&&range!=='workarea')return expected('The range must be frame or workarea.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_CROP_LAYERS);
  if(!ids.length)return expected('Select at least one layer.');
  const r=layerCrop(c,ids,range==='frame'?[snapToFrame(s.getState().view.playhead,c.fps)]:workAreaTicks(c),padding);
  if(!r.crop)return expected(r.unsized?'The selected layers have no known size (text, groups and similar). Type the crop by hand.':'The layers lie outside the composition.');
  try{setExportSettings({crop:r.crop});}catch(e){throw e instanceof ExportError?Object.assign(e,{expected:true}):e;}
  return {...r.crop,unsized:r.unsized};
 }) as (p:unknown)=>unknown}];
