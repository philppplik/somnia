import {useSyncExternalStore} from 'react';
import {setRenderComps,canvasPixels,canvasRasterize,downloadBlob,exportFramePng,exportSequenceZip,exportSlug,ExportError,frameSvg,sequencePlan,type Rasterize,type RasterizePixels} from './exportFrames';
import {encodeGif,GIF_MAX_FRAMES,type GifFrame} from './gifEncode';
import {encodeApng} from './apngEncode';
import {recordWebm} from './exportVideo';
import {browserAudioContext} from './audioPreview';
import {findComp} from './model';
import {defaultExportSettings,exportPlan,problemMessage,settingsProblems,EXPORT_PRESETS,EXPORT_LIMITS,type ExportFormat,type ExportSettings} from './exportSettings';
import {animationSession} from './session';
import {exportFrameSvg} from './exportSvg';
import {Zip,ZipPassThrough,strToU8} from 'fflate';
import {sheetPlan,packSheet,encodePngRgba,sheetManifest,SheetError} from './spriteSheet';
/** Observable state of the one export job the studio runs at a time. The UI shows real progress and real failures; nothing reports success before the file was handed to the browser. */
export interface ExportState{status:'idle'|'running'|'done'|'error';kind:'frame'|'sequence'|'gif'|'apng'|'webm'|null;done:number;total:number;message:string;fileName:string;transparent:boolean;settings:ExportSettings}
const idle:ExportState={status:'idle',kind:null,done:0,total:0,message:'',fileName:'',transparent:false,settings:defaultExportSettings()};
let state=idle;let ctl:AbortController|null=null;const listeners=new Set<()=>void>();
const set=(s:Partial<ExportState>)=>{state={...state,...s};listeners.forEach(l=>l());};
export const exportState=()=>state;
export const subscribeExport=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useExportState=()=>useSyncExternalStore(subscribeExport,exportState,exportState);
export function setExportTransparent(on:boolean){set({transparent:on});}
/** Changes export settings (session state, no undo step). Invalid values are refused and leave the settings as they were. */
export function setExportSettings(patch:Partial<ExportSettings>){
 if(state.status==='running')throw new ExportError('An export is running.','cancelled');
 const next={...state.settings,...patch};const bad=settingsProblems(next);
 if(bad.length)throw new ExportError(problemMessage(bad[0]),'unsupported');
 set({settings:next});
}
export function resetExportSettings(){if(state.status!=='running')set({settings:defaultExportSettings()});}
/** Applies a named preset: scale, frame rate and transparency. The range is kept. Returns the format the preset is meant for. */
export function applyExportPreset(id:string):ExportFormat{
 const p=EXPORT_PRESETS.find(x=>x.id===id);if(!p)throw new ExportError('Unknown export preset.','unsupported');
 setExportSettings({scale:p.scale,fps:p.fps});set({transparent:p.transparent});return p.format;
}
export function cancelExport(){ctl?.abort();}
export function resetExport(){if(state.status!=='running'){state={...idle,transparent:state.transparent,settings:state.settings};listeners.forEach(l=>l());}}
interface Deps{rasterize?:Rasterize;pixels?:RasterizePixels;save?:(b:Blob,name:string)=>void}
let forced:string|undefined;
/** Runs `fn` with exports aimed at composition `compId` instead of the active one (render queue). No document edit. */
export async function withExportComp<T>(compId:string,fn:()=>Promise<T>):Promise<T>{forced=compId;try{return await fn();}finally{forced=undefined;}}
export const exportSetupSnapshot=()=>({settings:state.settings,transparent:state.transparent});
export function restoreExportSetup(x:{settings:ExportSettings;transparent:boolean}){if(state.status!=='running')set({settings:x.settings,transparent:x.transparent});}
function target(format?:ExportFormat){
 const doc=animationSession().document;const comp=doc&&findComp(doc,forced);
 if(!doc||!comp)throw new ExportError('Open an animation first.','empty');
 setRenderComps(doc.compositions);
 if(!format){const out={width:Math.max(1,Math.round(comp.width*state.settings.scale/100)),height:Math.max(1,Math.round(comp.height*state.settings.scale/100))};
  if(out.width*out.height>EXPORT_LIMITS.maxPixels||out.width>16384||out.height>16384)throw new ExportError(problemMessage('size'),'too-large');
  return {doc,comp,out,ec:comp};}
 const plan=exportPlan(comp,format,state.settings);
 if(plan.problems.length)throw new ExportError(problemMessage(plan.problems[0]),plan.problems[0]==='size'?'too-large':plan.problems[0]==='range'?'empty':'too-many');
 return {doc,comp,out:{width:plan.width,height:plan.height},ec:plan.comp};
}
async function guarded(kind:'frame'|'sequence'|'gif'|'apng'|'webm',fn:(signal:AbortSignal)=>Promise<{blob:Blob;fileName:string}>,save:(b:Blob,n:string)=>void){
 if(state.status==='running')throw new ExportError('An export is already running.','cancelled');
 ctl=new AbortController();set({status:'running',kind,done:0,total:kind==='frame'?1:0,message:'',fileName:''});
 try{const r=await fn(ctl.signal);save(r.blob,r.fileName);set({status:'done',done:state.total,fileName:r.fileName});return r.fileName;}
 catch(e){const msg=e instanceof Error?e.message:String(e);set({status:'error',message:msg});throw e;}
 finally{ctl=null;}
}
export function exportCurrentFrame(d:Deps={}){
 const {doc,comp,out}=target();const at=animationSession().getState().view.playhead;
 return guarded('frame',()=>exportFramePng(comp,at,doc.name,d.rasterize??canvasRasterize,state.transparent,doc.assets,out),d.save??downloadBlob);
}
/** The playhead frame as a vector SVG file (drawing size, the scale setting does not apply). */
export function exportCurrentFrameSvg(d:Deps={}){
 const {doc,comp}=target();const at=animationSession().getState().view.playhead;
 return guarded('frame',async()=>exportFrameSvg(comp,at,doc.name,state.transparent,doc.assets),d.save??downloadBlob);
}
export function exportWorkAreaSequence(d:Deps={}){
 const {doc,out,ec}=target('sequence');
 return guarded('sequence',signal=>exportSequenceZip(ec,doc.name,{size:out,assets:doc.assets,rasterize:d.rasterize??canvasRasterize,transparent:state.transparent,signal,onProgress:(done,total)=>set({done,total})}),d.save??downloadBlob);
}
/** Animated GIF of the work area, composited onto the background (GIF has no alpha here), capped at 300 frames and 64 MB. */
export function exportGif(d:Deps={}){
 const {doc,out,ec:comp}=target('gif');
 return guarded('gif',async signal=>{
  const plan=sequencePlan(comp);
  if(plan.length>GIF_MAX_FRAMES)throw new ExportError(`A GIF is limited to ${GIF_MAX_FRAMES} frames. Shorten the work area.`,'too-many');
  const pixels=d.pixels??canvasPixels;const frames:GifFrame[]=[];
  for(let i=0;i<plan.length;i++){
   if(signal.aborted)throw new ExportError('Export cancelled.','cancelled');
   frames.push({pixels:await pixels(frameSvg(comp,plan[i].tick,false,doc.assets),out.width,out.height),delayCs:100*comp.fps.den/comp.fps.num});
   set({done:i+1,total:plan.length});
  }
  return {blob:new Blob([encodeGif(out.width,out.height,frames) as unknown as BlobPart],{type:'image/gif'}),fileName:`${exportSlug(doc.name)}.gif`};
 },d.save??downloadBlob);
}
/** Animated PNG of the work area; honours the transparency setting. PNG frames bounded like the sequence export, result capped at 64 MB. */
export function exportApng(d:Deps={}){
 const {doc,out,ec:comp}=target('apng');
 return guarded('apng',async signal=>{
  const plan=sequencePlan(comp);
  const rasterize=d.rasterize??canvasRasterize;const frames:Uint8Array[]=[];
  for(let i=0;i<plan.length;i++){
   if(signal.aborted)throw new ExportError('Export cancelled.','cancelled');
   frames.push(await rasterize(frameSvg(comp,plan[i].tick,state.transparent,doc.assets),out.width,out.height));
   set({done:i+1,total:plan.length});
  }
  return {blob:new Blob([encodeApng(frames,{delayNum:comp.fps.den,delayDen:comp.fps.num}) as unknown as BlobPart],{type:'image/apng'}),fileName:`${exportSlug(doc.name)}.apng`};
 },d.save??downloadBlob);
}
/** WebM video of the work area, recorded in real time with the audio layers mixed in when the browser supports it. */
export function exportWebM(d:Deps={}){
 const {doc,out,ec:comp}=target('webm');
 return guarded('webm',signal=>recordWebm(doc,comp,{size:out,
  createCanvas:()=>{
   const canvas=document.createElement('canvas');canvas.width=out.width;canvas.height=out.height;
   const ctx=canvas.getContext('2d');if(!ctx)throw new ExportError('2D canvas is unavailable.','raster');
   return {canvas,ctx,stream:canvas.captureStream(comp.fps.num/comp.fps.den)};
  },
  recorder:(stream,mime)=>new MediaRecorder(stream,{mimeType:mime}) as unknown as import('./exportVideo').RecorderLike,
  isSupported:m=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m),
  audio:browserAudioContext,
  signal,onProgress:(done,total)=>set({done,total}),
 }),d.save??downloadBlob);
}
/** Work-area frames packed into one PNG grid plus atlas.json, delivered as a ZIP. Honours the scale and transparency settings. */
export function exportSpriteSheet(columns?:number,d:Deps={}){
 const {doc,out,ec:comp}=target('sheet');
 return guarded('sequence',async signal=>{
  const plan=sequencePlan(comp);let grid;
  try{grid=sheetPlan(plan.length,out.width,out.height,columns??state.settings.columns??undefined);}catch(e){if(e instanceof SheetError)throw new ExportError(e.message,e.code==='too-many'?'too-many':e.code==='empty'?'empty':'too-large');throw e;}
  const pixels=d.pixels??canvasPixels;const frames:Uint8ClampedArray[]=[];
  for(let i=0;i<plan.length;i++){
   if(signal.aborted)throw new ExportError('Export cancelled.','cancelled');
   frames.push(await pixels(frameSvg(comp,plan[i].tick,state.transparent,doc.assets),out.width,out.height));
   set({done:i+1,total:plan.length});
  }
  const slug=exportSlug(doc.name),sheetFile=`${slug}_sheet.png`;
  const png=encodePngRgba(grid.width,grid.height,packSheet(grid,frames));
  const parts:Uint8Array[]=[];const zip=new Zip((err,chunk)=>{if(!err)parts.push(chunk);});
  const a=new ZipPassThrough(sheetFile);zip.add(a);a.push(png,true);
  const b=new ZipPassThrough('atlas.json');zip.add(b);b.push(strToU8(JSON.stringify(sheetManifest(grid,plan,doc.name,sheetFile,comp.fps),null,1)),true);
  zip.end();
  return {blob:new Blob(parts as BlobPart[],{type:'application/zip'}),fileName:`${slug}_spritesheet.zip`};
 },d.save??downloadBlob);
}
