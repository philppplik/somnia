/** Worker-side media pipeline: probe, capability scan and multi-clip timeline export on mediabunny + WebCodecs. No UI imports. */
import {ALL_FORMATS,AudioSample,AudioSampleSink,AudioSampleSource,BufferSource,BufferTarget,CanvasSink,CanvasSource,Input,Mp4OutputFormat,Output,QUALITY_HIGH,WebMOutputFormat,getFirstEncodableAudioCodec,getFirstEncodableVideoCodec} from 'mediabunny';
import type {AudioCodec,VideoCodec} from 'mediabunny';
import type {VideoFormat} from './recipe';
import {clipRanges,timelineDuration,type TimelineClip} from './timeline';
import type {VideoCapabilities,VideoProbe,VideoReport} from './protocol';
const inputOf=(bytes:ArrayBuffer)=>new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
/** Container facts without decoding a single frame; safe in Node and in the worker. */
export async function probeVideo(bytes:ArrayBuffer):Promise<VideoProbe>{
 const input=inputOf(bytes);
 try{
  const [duration,videos,audios]=await Promise.all([input.computeDuration(),input.getVideoTracks(),input.getAudioTracks()]);
  const v=videos[0]??null,a=audios[0]??null;
  let fps:number|null=null;
  if(v)try{const stats=await v.computePacketStats(50);fps=stats.averagePacketRate>0?Math.round(stats.averagePacketRate*100)/100:null;}catch{fps=null;}
  return{
   duration,
   video:v?{codec:v.codec,width:v.displayWidth,height:v.displayHeight,fps}:null,
   audio:a?{codec:a.codec,channels:a.numberOfChannels,rate:a.sampleRate}:null,
  };
 }finally{input.dispose();}
}
/** Probes real encoder support once; the export dialog only offers what comes back true here. */
export async function probeCapabilities(width=1280,height=720):Promise<VideoCapabilities>{
 const [webmVideo,mp4Video,opus,aac]=await Promise.all([
  getFirstEncodableVideoCodec(['vp9','vp8'] as VideoCodec[],{width,height,quality:QUALITY_HIGH}).catch(()=>null),
  getFirstEncodableVideoCodec(['avc'] as VideoCodec[],{width,height,quality:QUALITY_HIGH}).catch(()=>null),
  getFirstEncodableAudioCodec(['opus'] as AudioCodec[],{numberOfChannels:2,sampleRate:48_000,quality:QUALITY_HIGH}).then(c=>c!==null).catch(()=>false),
  getFirstEncodableAudioCodec(['aac'] as AudioCodec[],{numberOfChannels:2,sampleRate:48_000,quality:QUALITY_HIGH}).then(c=>c!==null).catch(()=>false),
 ]);
 return{webmVideo,mp4Video,opus,aac};
}
export class ExportCancelled extends Error{constructor(){super('Export cancelled');this.name='ExportCancelled';}}
let cancelled=false;
/** Cancels the running export, if any; the render loop stops at the next frame/sample. */
export function cancelExport(){cancelled=true;}
const checkCancel=()=>{if(cancelled)throw new ExportCancelled();};
/** Scales a decoded, resampled sample by the gain of the timeline clip it belongs to. Runs inside mediabunny's transform chain. */
const gainAt=(ranges:{start:number;end:number;gain:number}[],t:number)=>ranges.find(r=>t<r.end)?.gain??ranges[ranges.length-1]?.gain??1;
/**
 * Renders the timeline: every clip is decoded (CanvasSink/AudioSampleSink over its source range),
 * letterboxed to the first clip's size, retimestamped onto the timeline clock and encoded once.
 * Audio runs through mediabunny's resample/remix transform; per-clip gain is applied per sample, muted clips contribute silence.
 */
export async function exportTimeline(sources:Record<string,ArrayBuffer>,clips:TimelineClip[],format:VideoFormat,onProgress?:(ratio:number,processed_s:number)=>void):Promise<{bytes:ArrayBuffer;mime:string;report:VideoReport}>{
 cancelled=false;
 if(!clips.length)throw new Error('The timeline is empty.');
 const steps:string[]=[];
 const inputs=new Map<string,{input:Input;probe:VideoProbe}>();
 const names=[...new Set(clips.map(c=>c.source))];
 try{
  for(const n of names){
   const bytes=sources[n];
   if(!bytes)throw new Error(`Clip source "${n}" is no longer available. Re-open the file to export this timeline.`);
   const input=inputOf(bytes);
   const probe=await probeVideo(bytes.slice(0));
   if(!probe.video){input.dispose();throw new Error(`"${n}" has no video track and cannot be on a video timeline.`);}
   inputs.set(n,{input,probe});
  }
  const first=inputs.get(clips[0].source)!.probe.video!;
  const outW=first.width,outH=first.height;
  const caps=await probeCapabilities(outW,outH);
  const videoCodec=format==='webm'?caps.webmVideo:caps.mp4Video;
  if(!videoCodec)throw new Error(format==='webm'?'This platform cannot encode VP9 or VP8 video.':'This platform cannot encode H.264 (AVC) video. Try WebM instead.');
  const anyAudio=clips.some(c=>!c.muted&&inputs.get(c.source)!.probe.audio!==null);
  let audioCodec:string|null=null;
  if(anyAudio){
   audioCodec=format==='webm'?(caps.opus?'opus':null):(caps.aac?'aac':null);
   if(!audioCodec)steps.push(format==='webm'?'Audio dropped: no Opus encoder on this platform.':'Audio dropped: no AAC encoder on this platform.');
  }
  const total=timelineDuration(clips);
  const ranges=clipRanges(clips).map(r=>({start:r.start,end:r.end,gain:r.clip.muted?0:r.clip.gain}));
  const output=new Output({format:format==='webm'?new WebMOutputFormat():new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  const canvas=new OffscreenCanvas(outW,outH);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('No 2D context for the render canvas.');
  ctx.fillStyle='#000';ctx.fillRect(0,0,outW,outH);
  const videoSource=new CanvasSource(canvas,{codec:videoCodec as VideoCodec,quality:QUALITY_HIGH});
  output.addVideoTrack(videoSource);
  let audioSource:AudioSampleSource|null=null;
  if(audioCodec){
   audioSource=new AudioSampleSource({codec:audioCodec as AudioCodec,quality:QUALITY_HIGH,transform:{numberOfChannels:2,sampleRate:48_000,sampleFormat:'f32',
    process:sample=>{
     const g=gainAt(ranges,sample.timestamp);
     if(g===1)return sample;
     if(g===0)return null;
     const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
     sample.copyTo(data,{planeIndex:0,format:'f32'});
     for(let i=0;i<data.length;i++)data[i]*=g;
     return new AudioSample({data,format:'f32',numberOfChannels:sample.numberOfChannels,sampleRate:sample.sampleRate,timestamp:sample.timestamp});
    }}});
   output.addAudioTrack(audioSource);
  }
  await output.start();
  let processed=0;
  for(const range of clipRanges(clips)){
   checkCancel();
   const c=range.clip,{input,probe}=inputs.get(c.source)!;
   const in_s=c.in_s,out_s=c.out_s;
   const vTrack=(await input.getVideoTracks())[0];
   const sink=new CanvasSink(vTrack,{width:outW,height:outH,fit:'contain',poolSize:3});
   let base:number|null=null;
   for await(const frame of sink.canvases(in_s,out_s)){
    checkCancel();
    if(base===null)base=frame.timestamp;
    ctx.drawImage(frame.canvas,0,0);
    await videoSource.add(range.start+(frame.timestamp-base),frame.duration);
    processed=Math.max(processed,range.start+(frame.timestamp-base));
    if(processed>0)onProgress?.(Math.min(0.99,processed/total),processed);
   }
   if(probe.audio&&audioSource&&!c.muted){
    const aTrack=(await input.getAudioTracks())[0];
    const aSink=new AudioSampleSink(aTrack);
    let aBase:number|null=null;
    for await(const sample of aSink.samples(in_s,out_s)){
     checkCancel();
     if(aBase===null)aBase=sample.timestamp;
     sample.setTimestamp(range.start+(sample.timestamp-aBase));
     await audioSource.add(sample);
    }
   }else if(probe.audio===null&&audioSource)steps.push(`No audio track in ${c.source}.`);
  }
  await output.finalize();
  const buffer=(output.target as BufferTarget).buffer;
  if(!buffer)throw new Error('The export produced no output.');
  if(clips.length>1)steps.unshift(`${clips.length} clips joined.`);
  if(clips.some(c=>c.muted))steps.push('Muted clips kept as silence.');
  if(clips.some(c=>c.gain!==1&&!c.muted))steps.push('Per-clip gain applied.');
  const report:VideoReport={format,duration_s:total,bytes:buffer.byteLength,videoCodec,audioCodec,steps};
  return{bytes:buffer,mime:format==='webm'?'video/webm':'video/mp4',report};
 }catch(error){
  if(error instanceof ExportCancelled)throw error;
  if(error instanceof Error&&/cancel/i.test(error.message))throw new ExportCancelled();
  throw error;
 }finally{
  cancelled=false;
  for(const{input}of inputs.values())input.dispose();
 }
}
