import {useSyncExternalStore} from 'react';
import {canvasPixels,canvasRasterize,downloadBlob,exportFramePng,exportSequenceZip,exportSlug,ExportError,frameSvg,sequencePlan,type Rasterize,type RasterizePixels} from './exportFrames';
import {encodeGif,GIF_MAX_FRAMES,type GifFrame} from './gifEncode';
import {encodeApng} from './apngEncode';
import {recordWebm} from './exportVideo';
import {browserAudioContext} from './audioPreview';
import {findComp} from './model';
import {animationSession} from './session';
/** Observable state of the one export job the studio runs at a time. The UI shows real progress and real failures; nothing reports success before the file was handed to the browser. */
export interface ExportState{status:'idle'|'running'|'done'|'error';kind:'frame'|'sequence'|'gif'|'apng'|'webm'|null;done:number;total:number;message:string;fileName:string;transparent:boolean}
const idle:ExportState={status:'idle',kind:null,done:0,total:0,message:'',fileName:'',transparent:false};
let state=idle;let ctl:AbortController|null=null;const listeners=new Set<()=>void>();
const set=(s:Partial<ExportState>)=>{state={...state,...s};listeners.forEach(l=>l());};
export const exportState=()=>state;
export const subscribeExport=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useExportState=()=>useSyncExternalStore(subscribeExport,exportState,exportState);
export function setExportTransparent(on:boolean){set({transparent:on});}
export function cancelExport(){ctl?.abort();}
export function resetExport(){if(state.status!=='running'){state={...idle,transparent:state.transparent};listeners.forEach(l=>l());}}
interface Deps{rasterize?:Rasterize;pixels?:RasterizePixels;save?:(b:Blob,name:string)=>void}
function target(){
 const doc=animationSession().document;const comp=doc&&findComp(doc);
 if(!doc||!comp)throw new ExportError('Open an animation first.','empty');
 return {doc,comp};
}
async function guarded(kind:'frame'|'sequence'|'gif'|'apng'|'webm',fn:(signal:AbortSignal)=>Promise<{blob:Blob;fileName:string}>,save:(b:Blob,n:string)=>void){
 if(state.status==='running')throw new ExportError('An export is already running.','cancelled');
 ctl=new AbortController();set({status:'running',kind,done:0,total:kind==='frame'?1:0,message:'',fileName:''});
 try{const r=await fn(ctl.signal);save(r.blob,r.fileName);set({status:'done',done:state.total,fileName:r.fileName});return r.fileName;}
 catch(e){const msg=e instanceof Error?e.message:String(e);set({status:'error',message:msg});throw e;}
 finally{ctl=null;}
}
export function exportCurrentFrame(d:Deps={}){
 const {doc,comp}=target();const at=animationSession().getState().view.playhead;
 return guarded('frame',()=>exportFramePng(comp,at,doc.name,d.rasterize??canvasRasterize,state.transparent,doc.assets),d.save??downloadBlob);
}
export function exportWorkAreaSequence(d:Deps={}){
 const {doc,comp}=target();
 return guarded('sequence',signal=>exportSequenceZip(comp,doc.name,{assets:doc.assets,rasterize:d.rasterize??canvasRasterize,transparent:state.transparent,signal,onProgress:(done,total)=>set({done,total})}),d.save??downloadBlob);
}
/** Animated GIF of the work area, composited onto the background (GIF has no alpha here), capped at 300 frames and 64 MB. */
export function exportGif(d:Deps={}){
 const {doc,comp}=target();
 return guarded('gif',async signal=>{
  const plan=sequencePlan(comp);
  if(plan.length>GIF_MAX_FRAMES)throw new ExportError(`A GIF is limited to ${GIF_MAX_FRAMES} frames. Shorten the work area.`,'too-many');
  const pixels=d.pixels??canvasPixels;const frames:GifFrame[]=[];
  for(let i=0;i<plan.length;i++){
   if(signal.aborted)throw new ExportError('Export cancelled.','cancelled');
   frames.push({pixels:await pixels(frameSvg(comp,plan[i].tick,false,doc.assets),comp.width,comp.height),delayCs:100*comp.fps.den/comp.fps.num});
   set({done:i+1,total:plan.length});
  }
  return {blob:new Blob([encodeGif(comp.width,comp.height,frames) as unknown as BlobPart],{type:'image/gif'}),fileName:`${exportSlug(doc.name)}.gif`};
 },d.save??downloadBlob);
}
/** Animated PNG of the work area; honours the transparency setting. PNG frames bounded like the sequence export, result capped at 64 MB. */
export function exportApng(d:Deps={}){
 const {doc,comp}=target();
 return guarded('apng',async signal=>{
  const plan=sequencePlan(comp);
  const rasterize=d.rasterize??canvasRasterize;const frames:Uint8Array[]=[];
  for(let i=0;i<plan.length;i++){
   if(signal.aborted)throw new ExportError('Export cancelled.','cancelled');
   frames.push(await rasterize(frameSvg(comp,plan[i].tick,state.transparent,doc.assets),comp.width,comp.height));
   set({done:i+1,total:plan.length});
  }
  return {blob:new Blob([encodeApng(frames,{delayNum:comp.fps.den,delayDen:comp.fps.num}) as unknown as BlobPart],{type:'image/apng'}),fileName:`${exportSlug(doc.name)}.apng`};
 },d.save??downloadBlob);
}
/** WebM video of the work area, recorded in real time with the audio layers mixed in when the browser supports it. */
export function exportWebM(d:Deps={}){
 const {doc,comp}=target();
 return guarded('webm',signal=>recordWebm(doc,comp,{
  createCanvas:()=>{
   const canvas=document.createElement('canvas');canvas.width=comp.width;canvas.height=comp.height;
   const ctx=canvas.getContext('2d');if(!ctx)throw new ExportError('2D canvas is unavailable.','raster');
   return {canvas,ctx,stream:canvas.captureStream(comp.fps.num/comp.fps.den)};
  },
  recorder:(stream,mime)=>new MediaRecorder(stream,{mimeType:mime}) as unknown as import('./exportVideo').RecorderLike,
  isSupported:m=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m),
  audio:browserAudioContext,
  signal,onProgress:(done,total)=>set({done,total}),
 }),d.save??downloadBlob);
}
