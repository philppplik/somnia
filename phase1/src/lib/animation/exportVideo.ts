import {frameSvg,MAX_PIXELS,ExportError} from './exportFrames';
import {audibleLayers} from './audioTiming';
import {AudioPreview,type AudioContextLike} from './audioPreview';
import {playbackAt,workAreaFrames} from './playback';
import {frameToTick,tickToFrame} from './time';
import {exportSlug} from './exportFrames';
import type {AnimationDocument,Composition} from './model';
/** Real-time WebM capture through canvas.captureStream and MediaRecorder. VP9/VP8 in WebM, optional Opus track mixed from the audio layers. */
export const WEBM_MAX_SECONDS=60;
export const WEBM_MAX_BYTES=64*1024*1024;
const MIMES=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
export interface WebmPlan{frames:number;seconds:number;mime:string}
/** Pure feasibility plan. Throws ExportError when the work area, frame size or browser support does not allow a WebM. */
export function webmPlan(comp:Composition,isSupported:(mime:string)=>boolean):WebmPlan{
 const {count}=workAreaFrames(comp.workArea,comp.fps);
 if(count<1)throw new ExportError('The work area has no frames.','empty');
 const seconds=count*comp.fps.den/comp.fps.num;
 if(seconds>WEBM_MAX_SECONDS)throw new ExportError(`WebM records in real time and is limited to ${WEBM_MAX_SECONDS} seconds. Shorten the work area.`,'too-many');
 if(comp.width*comp.height>MAX_PIXELS)throw new ExportError(`Frame size ${comp.width}x${comp.height} is above the supported limit.`,'too-large');
 const mime=MIMES.find(isSupported);
 if(!mime)throw new ExportError('WebM recording is not available in this browser.','unsupported');
 return {frames:count,seconds,mime};
}
export interface RecorderLike{mimeType:string;ondataavailable:((e:{data:Blob})=>void)|null;onstop:(()=>void)|null;start(timeslice?:number):void;stop():void}
export interface WebmDeps{
 createCanvas:()=>{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;stream:MediaStream};
 recorder:(stream:MediaStream,mime:string)=>RecorderLike;
 isSupported:(mime:string)=>boolean;
 audio?:()=>AudioContextLike|null;
 draw?:(ctx:CanvasRenderingContext2D,svg:string,width:number,height:number)=>Promise<void>;
 now?:()=>number;
 schedule?:(cb:()=>void)=>void;
 /** Output size when it differs from the drawing size (the SVG is scaled into the canvas). */
 size?:{width:number;height:number};
 signal?:AbortSignal;
 onProgress?:(done:number,total:number)=>void;
}
/** Browser default: draw the SVG frame into the recorder canvas. */
export async function drawSvgFrame(ctx:CanvasRenderingContext2D,svg:string,width:number,height:number):Promise<void>{
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();img.decoding='async';
  await new Promise<void>((ok,no)=>{img.onload=()=>ok();img.onerror=()=>no(new Error('image decode failed'));img.src=url;});
  ctx.drawImage(img,0,0,width,height);
 }finally{URL.revokeObjectURL(url);}
}
/**
 * Records the work area once (never looped) in real time. The audio clock is the master when audio layers are audible
 * (same rule as the preview), so picture and sound stay in sync in the file. Cancellation discards everything.
 */
export async function recordWebm(doc:AnimationDocument,comp:Composition,d:WebmDeps):Promise<{blob:Blob;fileName:string;seconds:number}>{
 const plan=webmPlan(comp,d.isSupported);
 const {ctx,stream}=d.createCanvas();
 const startTick=frameToTick(workAreaFrames(comp.workArea,comp.fps).first,comp.fps);
 const now=d.now??(()=>performance.now());
 const schedule=d.schedule??((cb:()=>void)=>requestAnimationFrame(()=>cb()));
 const draw=d.draw??drawSvgFrame;
 let audio:AudioPreview|null=null;let audioClock=false;
 if(audibleLayers(comp).length&&d.audio){
  const actx=d.audio();
  const dest=actx?.createMediaStreamDestination?.();
  if(actx&&dest){
   audio=new AudioPreview(()=>actx);
   await audio.start(doc,comp,startTick,false,dest);
   for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
   audioClock=true;
  }
 }
 const recorder=d.recorder(stream,plan.mime);
 const chunks:Blob[]=[];let bytes=0,oversize=false;
 recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>WEBM_MAX_BYTES)oversize=true;}};
 return new Promise((resolve,reject)=>{
  let drawing=false,lastFrame=-1,finished=false;
  const cleanup=()=>{audio?.stop();};
  recorder.onstop=()=>{
   if(finished)return;finished=true;cleanup();
   if(d.signal?.aborted)return void reject(new ExportError('Export cancelled.','cancelled'));
   if(oversize)return void reject(new ExportError('The WebM is larger than 64 MB. Shorten the work area.','too-large'));
   resolve({blob:new Blob(chunks,{type:plan.mime}),fileName:`${exportSlug(doc.name)}.webm`,seconds:plan.seconds});
  };
  const fail=(e:unknown)=>{if(finished)return;finished=true;cleanup();try{recorder.stop();}catch{/* not recording */}reject(e instanceof Error?e:new ExportError(String(e),'raster'));};
  const tickLoop=()=>{
   if(finished)return;
   if(d.signal?.aborted){try{recorder.stop();}catch{/* not recording */}return;}
   const elapsed=audioClock&&audio?audio.elapsedMs():now()-t0;
   const r=playbackAt(startTick,elapsed,comp.workArea,comp.fps,false);
   if(audio)audio.poll();
   const frame=tickToFrame(r.tick,comp.fps);
   if(frame!==lastFrame&&!drawing){
    lastFrame=frame;drawing=true;
    draw(ctx,frameSvg(comp,r.tick,false,doc.assets),d.size?.width??comp.width,d.size?.height??comp.height)
     .then(()=>{drawing=false;d.onProgress?.(Math.min(plan.frames,frame-first+1),plan.frames);if(r.ended){try{recorder.stop();}catch(e){fail(e);}return;}schedule(tickLoop);},fail)
     .catch(fail);
    return;
   }
   if(r.ended){try{recorder.stop();}catch(e){fail(e);}return;}
   schedule(tickLoop);
  };
  const first=workAreaFrames(comp.workArea,comp.fps).first;
  const t0=now();
  try{recorder.start(250);}catch(e){fail(e);return;}
  schedule(tickLoop);
 });
}
