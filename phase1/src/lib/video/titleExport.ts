/**
 * Export of a title clip: video frames for its span plus matching silent audio, so A/V stays in sync.
 * No mediabunny import: the pipeline passes thin callbacks, which also makes this testable in Node with fakes.
 */
import {drawTitleCard,titleFrameKey,type TitleClip,type TitleContext} from './titles';

export const SILENCE_RATE=48_000;
export const SILENCE_CHANNELS=2;
/** Audio layout of the silence. It must equal the layout of the real audio fed to the same audio source (the encoder rejects changes), i.e. the INPUT clips' channels/rate. */
export interface SilenceFormat{channels:number;rate:number}
export const DEFAULT_SILENCE_FORMAT:SilenceFormat={channels:SILENCE_CHANNELS,rate:SILENCE_RATE};
/** Silence is produced in chunks of at most this many seconds. */
export const SILENCE_CHUNK_SECONDS=0.5;
export interface SilenceChunk{timestamp:number;frames:number}
/** Chunk plan for `duration` seconds of silence starting at `start`; frame counts add up to round(duration*rate) exactly. */
export function silencePlan(start:number,duration:number,rate=SILENCE_RATE,chunkSeconds=SILENCE_CHUNK_SECONDS):SilenceChunk[]{
 const total=Math.max(0,Math.round(duration*rate)),per=Math.max(1,Math.round(chunkSeconds*rate)),out:SilenceChunk[]=[];
 for(let done=0;done<total;done+=per)out.push({timestamp:start+done/rate,frames:Math.min(per,total-done)});
 return out;
}
export interface FramePlan{timestamp:number;duration:number;local:number}
/** Frame times on the timeline clock for a span; the last frame is shortened so the span ends exactly at start+duration. */
export function framePlan(start:number,duration:number,fps:number):FramePlan[]{
 const f=Math.max(1,Math.min(120,fps)),n=Math.max(1,Math.ceil(duration*f-1e-9)),out:FramePlan[]=[];
 for(let i=0;i<n;i++){const local=i/f;out.push({timestamp:start+local,duration:Math.min(1/f,duration-local),local});}
 return out;
}
export interface TitleSpanOptions{
 clip:TitleClip;
 /** Start of the clip on the timeline clock, in seconds. */
 start:number;width:number;height:number;fps:number;
 /** Canvas context the video source reads from (the pipeline's shared render canvas). */
 ctx:TitleContext;
 /** Adds the current canvas as a frame at (timestamp, duration), like `CanvasSource.add`. */
 addFrame:(timestamp:number,duration:number)=>Promise<void>;
 /** Present only when the output has an audio track; receives interleaved f32 stereo zeros. */
 /** Layout of the silence; default stereo 48 kHz. Use the first audible source clip's channels/rate. */
 silenceFormat?:SilenceFormat;
 addSilence?:(chunk:{timestamp:number;data:Float32Array;rate:number;channels:number})=>Promise<void>;
 checkCancel?:()=>void;
 onFrame?:(timelineSeconds:number)=>void;
}
/** Renders one title clip into the output. Returns frame and silence-chunk counts (for the report/tests). */
export async function renderTitleSpan(o:TitleSpanOptions):Promise<{frames:number;silenceChunks:number}>{
 const duration=o.clip.out_s-o.clip.in_s,spec=o.clip.title;
 let drawn='';let frames=0;
 for(const f of framePlan(o.start,duration,o.fps)){
  o.checkCancel?.();
  const key=titleFrameKey(spec,duration,f.local);
  if(key!==drawn){drawTitleCard(o.ctx,o.clip,o.width,o.height,f.local);drawn=key;}
  await o.addFrame(f.timestamp,f.duration);frames++;
  o.onFrame?.(f.timestamp+f.duration);
 }
 let silenceChunks=0;
 if(o.addSilence){
  const fmt=o.silenceFormat??DEFAULT_SILENCE_FORMAT;
  for(const c of silencePlan(o.start,duration,fmt.rate)){
   o.checkCancel?.();
   await o.addSilence({timestamp:c.timestamp,data:new Float32Array(c.frames*fmt.channels),rate:fmt.rate,channels:fmt.channels});silenceChunks++;
  }
 }
 return{frames,silenceChunks};
}
