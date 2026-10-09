/** Worker-side media pipeline: probe, capability scan and trim export on mediabunny + WebCodecs. No UI imports. */
import {ALL_FORMATS,BufferSource,BufferTarget,Conversion,Input,Mp4OutputFormat,Output,QUALITY_HIGH,WebMOutputFormat,getFirstEncodableAudioCodec,getFirstEncodableVideoCodec} from 'mediabunny';
import type {AudioCodec,VideoCodec} from 'mediabunny';
import type {VideoRecipe} from './recipe';
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
/** Re-encodes the trim range (frame-precise, never a silent keyframe cut). Progress is 0..1 plus processed seconds. */
export async function exportVideo(bytes:ArrayBuffer,recipe:VideoRecipe,onProgress?:(ratio:number,processed_s:number)=>void):Promise<{bytes:ArrayBuffer;mime:string;report:VideoReport}>{
 const input=inputOf(bytes);
 try{
  const probe=await probeVideo(bytes.slice(0));
  if(!probe.video)throw new Error('This file has no video track.');
  const caps=await probeCapabilities(probe.video.width,probe.video.height);
  const steps:string[]=[];
  const format=recipe.format;
  const videoCodec=format==='webm'?caps.webmVideo:caps.mp4Video;
  if(!videoCodec)throw new Error(format==='webm'?'This platform cannot encode VP9 or VP8 video.':'This platform cannot encode H.264 (AVC) video. Try WebM instead.');
  let audioCodec:string|null=null;
  const wantsAudio=recipe.audio!=='mute'&&probe.audio!==null;
  if(wantsAudio){
   audioCodec=format==='webm'?(caps.opus?'opus':null):(caps.aac?'aac':null);
   if(!audioCodec)steps.push(format==='webm'?'Audio dropped: no Opus encoder on this platform.':'Audio dropped: no AAC encoder on this platform.');
  }
  const output=new Output({format:format==='webm'?new WebMOutputFormat():new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  const conversion=await Conversion.init({
   input,output,showWarnings:false,copy:false,
   video:{codec:videoCodec as VideoCodec,quality:QUALITY_HIGH},
   ...(audioCodec?{audio:{codec:audioCodec as AudioCodec,quality:QUALITY_HIGH}}:{audio:{discard:true}}),
   ...(recipe.trim?{trim:{start:recipe.trim.start_s,end:recipe.trim.end_s}}:{}),
  });
  active=conversion;
  if(!conversion.isValid){
   const reasons=conversion.discardedTracks.map(d=>`${d.track.type}: ${d.reason}`).join('; ');
   throw new Error(`Nothing usable to export. ${reasons}`);
  }
  conversion.onProgress=(ratio,processed)=>onProgress?.(ratio,processed);
  await conversion.execute();
  const buffer=output.target.buffer;
  if(!buffer)throw new Error('The export produced no output.');
  if(recipe.trim)steps.unshift(`Trimmed to ${recipe.trim.start_s.toFixed(2)}-${recipe.trim.end_s.toFixed(2)} s`);
  if(recipe.audio==='mute'&&probe.audio)steps.push('Audio muted.');
  const report:VideoReport={format,duration_s:recipe.trim?recipe.trim.end_s-recipe.trim.start_s:probe.duration,bytes:buffer.byteLength,videoCodec,audioCodec,steps};
  return{bytes:buffer,mime:format==='webm'?'video/webm':'video/mp4',report};
 }catch(error){
  if(error instanceof Error&&/cancel/i.test(error.message))throw new ExportCancelled();
  throw error;
 }finally{active=null;input.dispose();}
}
let active:Conversion|null=null;
/** Cancels the running export, if any; Conversion rejects with a cancellation error. */
export function cancelExport(){void active?.cancel();}
