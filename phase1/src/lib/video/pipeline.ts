/** Worker-side media pipeline: probe, capability scan and multi-clip timeline export on mediabunny + WebCodecs. No UI imports. */
import {ALL_FORMATS,AudioSample,AudioSampleSink,AudioSampleSource,BufferSource,BufferTarget,CanvasSink,CanvasSource,Input,Mp4OutputFormat,Output,QUALITY_HIGH,WebMOutputFormat,getFirstEncodableAudioCodec,getFirstEncodableVideoCodec} from 'mediabunny';
import type {AudioCodec,VideoCodec} from 'mediabunny';
import type {VideoFormat} from './recipe';
import {clipRanges,fadeOf,timelineDuration,type ClipRange,type TimelineClip} from './timeline';
import {drawTitleCard,isTitleClip,needsSourceFile} from './titles';
import {renderTitleSpan} from './titleExport';
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
/**
 * Streams one zone's decoded audio into the encoder as 48 kHz stereo f32 chunks:
 * linear resample, mono duplication, per-zone gain, 100 ms flushes so long clips never buffer.
 */
async function emitZoneAudio(aSink:AudioSampleSink,srcStart:number,srcEnd:number,zoneStart:number,gain:number,audioSource:AudioSampleSource):Promise<void>{
 let rate=0,ch=0,phase=0,consumed=0,prevL=0,prevR=0,havePrev=false,emitted=0;
 let out:number[]=[];
 const flush=async()=>{
  if(!out.length)return;
  await audioSource.add(new AudioSample({data:new Float32Array(out),format:'f32',numberOfChannels:2,sampleRate:48_000,timestamp:zoneStart+emitted/48_000}));
  emitted+=out.length/2;out=[];
 };
 for await(const sample of aSink.samples(srcStart,srcEnd)){
  checkCancel();
  if(!rate){rate=sample.sampleRate;ch=sample.numberOfChannels;}
  const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
  sample.copyTo(data,{planeIndex:0,format:'f32'});
  const step=rate/48_000,inFrames=data.length/ch;
  for(let f=0;f<inFrames;f++){
   const l=ch===1?data[f]:data[f*ch],r=ch===1?data[f]:data[f*ch+1];
   if(!havePrev){prevL=l;prevR=r;havePrev=true;consumed=1;continue;}
   const g=consumed;
   while(phase<g){
    const frac=phase-(g-1);
    out.push((prevL+(l-prevL)*frac)*gain,(prevR+(r-prevR)*frac)*gain);
    phase+=step;
    if(out.length>=9600)await flush();
   }
   prevL=l;prevR=r;consumed++;
  }
 }
 await flush();
}

/**
 * Renders the timeline: every clip is decoded (CanvasSink/AudioSampleSink over its source range),
 * letterboxed to the first clip's size, retimestamped onto the timeline clock and encoded once. Crossfade overlaps
 * decode both sides on a fixed frame grid and dissolve linearly; audio is crossfaded equal-power. All audio is
 * normalized to 48 kHz stereo before encoding (per-zone gain included), muted clips contribute silence.
 */
export async function exportTimeline(sources:Record<string,ArrayBuffer>,clips:TimelineClip[],format:VideoFormat,onProgress?:(ratio:number,processed_s:number)=>void):Promise<{bytes:ArrayBuffer;mime:string;report:VideoReport}>{
 cancelled=false;
 if(!clips.length)throw new Error('The timeline is empty.');
 const steps:string[]=[];
 const inputs=new Map<string,{input:Input;probe:VideoProbe}>();
 const names=[...new Set(clips.filter(needsSourceFile).map(c=>c.source))];
 try{
  for(const n of names){
   const bytes=sources[n];
   if(!bytes)throw new Error(`Clip source "${n}" is no longer available. Re-open the file to export this timeline.`);
   const input=inputOf(bytes);
   const probe=await probeVideo(bytes.slice(0));
   if(!probe.video){input.dispose();throw new Error(`"${n}" has no video track and cannot be on a video timeline.`);}
   inputs.set(n,{input,probe});
  }
  const firstMedia=clips.find(needsSourceFile);
  const first=firstMedia?inputs.get(firstMedia.source)!.probe.video!:{codec:null,width:1280,height:720,fps:null};
  const outW=first.width,outH=first.height;
  const caps=await probeCapabilities(outW,outH);
  const videoCodec=format==='webm'?caps.webmVideo:caps.mp4Video;
  if(!videoCodec)throw new Error(format==='webm'?'This platform cannot encode VP9 or VP8 video.':'This platform cannot encode H.264 (AVC) video. Try WebM instead.');
  const anyAudio=clips.some(c=>needsSourceFile(c)&&!c.muted&&inputs.get(c.source)!.probe.audio!==null);
  let audioCodec:string|null=null;
  if(anyAudio){
   audioCodec=format==='webm'?(caps.opus?'opus':null):(caps.aac?'aac':null);
   if(!audioCodec)steps.push(format==='webm'?'Audio dropped: no Opus encoder on this platform.':'Audio dropped: no AAC encoder on this platform.');
  }
  const total=timelineDuration(clips);
  const ranges=clipRanges(clips);
  // Solo stretches alternate with crossfade overlaps; both video and audio walk this zone list.
  interface Zone{kind:'solo'|'fade';start:number;end:number;a:number;b:number}
  const zones:Zone[]=[];
  ranges.forEach((r,i)=>{
   const fadeIn=i>0?fadeOf(ranges[i-1].clip):0;
   const fadeOut=i<ranges.length-1?fadeOf(r.clip):0;
   if(fadeIn>0)zones.push({kind:'fade',start:r.start,end:r.start+fadeIn,a:i-1,b:i});
   const s0=r.start+fadeIn,s1=r.end-fadeOut;
   if(s1>s0+1e-6)zones.push({kind:'solo',start:s0,end:s1,a:i,b:i});
  });

  const output=new Output({format:format==='webm'?new WebMOutputFormat():new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
  const canvas=new OffscreenCanvas(outW,outH);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('No 2D context for the render canvas.');
  ctx.fillStyle='#000';ctx.fillRect(0,0,outW,outH);
  const videoSource=new CanvasSource(canvas,{codec:videoCodec as VideoCodec,quality:QUALITY_HIGH});
  output.addVideoTrack(videoSource);
  let audioSource:AudioSampleSource|null=null;
  if(audioCodec){
   // Every sample is normalized to 48 kHz stereo f32 before it is added: the source rejects mixed raw parameters.
   audioSource=new AudioSampleSource({codec:audioCodec as AudioCodec,quality:QUALITY_HIGH});
   output.addAudioTrack(audioSource);
  }
  await output.start();
  let processed=0;
  const note=(t:number)=>{processed=Math.max(processed,t);if(processed>0)onProgress?.(Math.min(0.99,processed/total),processed);};
  // One CanvasSink per clip index, shared by the clip's solo zone and its neighbouring fades.
  const videoSinks=new Map<number,CanvasSink>();
  const sinkFor=async(i:number)=>{
   let s=videoSinks.get(i);
   if(!s){const{input}=inputs.get(ranges[i].clip.source)!;const track=(await input.getVideoTracks())[0];s=new CanvasSink(track,{width:outW,height:outH,fit:'contain',poolSize:3});videoSinks.set(i,s);}
   return s;
  };
  const fpsOf=(i:number)=>{const c=ranges[i].clip;if(isTitleClip(c))return first.fps&&first.fps>1?first.fps:30;const f=inputs.get(c.source)!.probe.video!.fps;return f&&f>1?f:30;};
  let titlesRendered=false;
  // One scratch canvas per clip index for the card side of a dissolve; keyed redraws skip static frames.
  const cards=new Map<number,{canvas:OffscreenCanvas;ctx:OffscreenCanvasRenderingContext2D;key:string}>();
  const sideFrame=async(i:number,t:number):Promise<OffscreenCanvas|HTMLCanvasElement|ImageBitmap|VideoFrame|null>=>{
   const r=ranges[i],c=r.clip;
   if(isTitleClip(c)){
    let card=cards.get(i);
    if(!card){
     const canvas=new OffscreenCanvas(outW,outH),ctx2=canvas.getContext('2d');
     if(!ctx2)return null;
     card={canvas,ctx:ctx2,key:''};cards.set(i,card);
    }
    const local=Math.max(0,t-r.start),key=`${local.toFixed(4)}`;
    if(card.key!==key){drawTitleCard(card.ctx,c,outW,outH,local);card.key=key;}
    return card.canvas;
   }
   const sink=await sinkFor(i);
   const src=Math.min(c.out_s-1e-3,c.in_s+(t-r.start));
   const f=await sink.getCanvas(src);
   return f?f.canvas:null;
  };
  for(const z of zones){
   checkCancel();
   if(z.kind==='solo'){
    const r=ranges[z.a],c=r.clip;
    if(isTitleClip(c)){
     titlesRendered=true;
     await renderTitleSpan({clip:c,start:z.start,width:outW,height:outH,fps:fpsOf(z.a),ctx,checkCancel,
      addFrame:(t,d)=>videoSource.add(t,d),
      silenceFormat:{channels:2,rate:48_000},
      addSilence:audioSource?async chunk=>{await audioSource.add(new AudioSample({data:chunk.data,format:'f32',numberOfChannels:chunk.channels,sampleRate:chunk.rate,timestamp:chunk.timestamp}));}:undefined,
      onFrame:note});
     note(z.end);
     continue;
    }
    const{input,probe}=inputs.get(c.source)!;
    const srcStart=c.in_s+(z.start-r.start),srcEnd=c.out_s-(r.end-z.end);
    const sink=await sinkFor(z.a);
    let base:number|null=null;
    for await(const frame of sink.canvases(srcStart,srcEnd)){
     checkCancel();
     if(base===null)base=frame.timestamp;
     ctx.globalAlpha=1;ctx.drawImage(frame.canvas,0,0);
     await videoSource.add(z.start+(frame.timestamp-base),frame.duration);
     note(z.start+(frame.timestamp-base));
    }
    if(probe.audio&&audioSource&&!c.muted){
     const aTrack=(await input.getAudioTracks())[0];
     await emitZoneAudio(new AudioSampleSink(aTrack),srcStart,srcEnd,z.start,c.gain,audioSource);
    }else if(probe.audio===null&&audioSource&&z===zones[0])steps.push(`No audio track in ${c.source}.`);
   }else{
    const ra=ranges[z.a],rb=ranges[z.b],d=z.end-z.start;
    if(isTitleClip(ra.clip)||isTitleClip(rb.clip))titlesRendered=true;
    const fps=fpsOf(z.a),n=Math.max(1,Math.ceil(d*fps));
    for(let k=0;k<n;k++){
     checkCancel();
     const t=z.start+k/fps,p=Math.min(1,(t-z.start)/d);
     const[fa,fb]=await Promise.all([sideFrame(z.a,t),sideFrame(z.b,t)]);
     ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,outW,outH);
     if(fa){ctx.globalAlpha=1;ctx.drawImage(fa as CanvasImageSource,0,0);}
     if(fb){ctx.globalAlpha=p;ctx.drawImage(fb as CanvasImageSource,0,0);}
     ctx.globalAlpha=1;
     await videoSource.add(t,1/fps);
     note(t);
    }
    if(audioSource){
     // Equal-power mix of both sides, resampled by hand to 48 kHz stereo; the transform passes it through untouched.
     const len=Math.max(1,Math.round(d*48_000));
     const mix=new Float32Array(len*2);
     let any=false;
     for(const side of[{r:ra,sign:'out' as const},{r:rb,sign:'in' as const}]){
      const c=side.r.clip;
      if(c.muted||isTitleClip(c))continue;
      const{input,probe}=inputs.get(c.source)!;
      if(!probe.audio)continue;
      const srcStart=c.in_s+(z.start-side.r.start),srcEnd=c.in_s+(z.end-side.r.start);
      const aSink=new AudioSampleSink((await input.getAudioTracks())[0]);
      let rate=0,ch=0,total2=0;
      const chunks:Float32Array[]=[];
      for await(const sample of aSink.samples(srcStart,srcEnd)){
       checkCancel();
       rate=sample.sampleRate;ch=sample.numberOfChannels;
       const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
       sample.copyTo(data,{planeIndex:0,format:'f32'});
       chunks.push(data);total2+=data.length;
      }
      if(!total2||!rate||!ch)continue;
      const raw=new Float32Array(total2);let o=0;
      for(const part of chunks){raw.set(part,o);o+=part.length;}
      const frames=total2/ch;
      any=true;
      for(let i=0;i<len;i++){
       const pr=i/len;
       const env=(side.sign==='out'?Math.cos(pr*Math.PI/2):Math.sin(pr*Math.PI/2))*c.gain;
       const srcPos=i/48_000*rate,f0=Math.floor(srcPos),f1=Math.min(frames-1,f0+1),fr=srcPos-f0;
       const l=ch===1?raw[f0]*(1-fr)+raw[f1]*fr:raw[f0*ch]*(1-fr)+raw[f1*ch]*fr;
       const rgt=ch===1?l:raw[f0*ch+1]*(1-fr)+raw[f1*ch+1]*fr;
       mix[i*2]+=l*env;mix[i*2+1]+=rgt*env;
      }
     }
     if(any){
      for(let off=0;off<len;off+=4800){
       const count=Math.min(4800,len-off);
       await audioSource.add(new AudioSample({data:mix.slice(off*2,(off+count)*2),format:'f32',numberOfChannels:2,sampleRate:48_000,timestamp:z.start+off/48_000}));
      }
     }
    }
   }
  }
  await output.finalize();
  const buffer=(output.target as BufferTarget).buffer;
  if(!buffer)throw new Error('The export produced no output.');
  if(clips.length>1)steps.unshift(`${clips.length} clips joined.`);
  if(ranges.some((r,i)=>i<ranges.length-1&&fadeOf(r.clip)>0))steps.push('Crossfades applied.');
  if(titlesRendered)steps.push('Title cards rendered.');
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
