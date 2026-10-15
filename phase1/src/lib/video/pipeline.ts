/** Worker-side media pipeline: probe, capability scan and multi-clip timeline export on mediabunny + WebCodecs. No UI imports. */
import {ALL_FORMATS,AudioSample,AudioSampleSink,AudioSampleSource,BufferSource,BufferTarget,CanvasSink,CanvasSource,Input,Mp4OutputFormat,Output,QUALITY_HIGH,QUALITY_LOW,QUALITY_MEDIUM,WebMOutputFormat,getFirstEncodableAudioCodec,getFirstEncodableVideoCodec} from 'mediabunny';
import type {AudioCodec,VideoCodec} from 'mediabunny';
import {cappedFps,sanitizeExportOptions,type VideoExportOptions,type VideoFormat} from './recipe';
import {clipFadeGain,clipRanges,fadeInOf,fadeOf,fadeOutOf,flipOf,isFreeze,isImageClip,speedOf,timelineDuration,type ClipRange,type TimelineClip} from './timeline';
import {audioEnvelope,duckGainAt,type AudioClip} from './audioTrack';
import {WindowMixer} from './mixer';
import {drawTitleCard,isTitleClip,needsSourceFile,type TitleClip} from './titles';
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
 * linear resample, mono duplication, per-sample gain (clip gain x audio fades), 100 ms flushes so long clips never buffer.
 */
async function emitZoneAudio(aSink:AudioSampleSink,srcStart:number,srcEnd:number,zoneStart:number,gainAt:(t:number)=>number,speed:number,mix:WindowMixer):Promise<void>{
 let rate=0,ch=0,phase=0,consumed=0,prevL=0,prevR=0,havePrev=false,emitted=0;
 let out:number[]=[];
 const flush=async()=>{
  if(!out.length)return;
  mix.addChunk(zoneStart+emitted/48_000,new Float32Array(out));
  emitted+=out.length/2;out=[];
 };
 for await(const sample of aSink.samples(srcStart,srcEnd)){
  checkCancel();
  if(!rate){rate=sample.sampleRate;ch=sample.numberOfChannels;}
  const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
  sample.copyTo(data,{planeIndex:0,format:'f32'});
  // speed>1 consumes that many more source frames per output frame: the zone is (srcEnd-srcStart)/speed long, and the pitch rises (no pitch correction, same as the preview's playbackRate with preservesPitch off).
  const step=rate/48_000*speed,inFrames=data.length/ch;
  for(let f=0;f<inFrames;f++){
   const l=ch===1?data[f]:data[f*ch],r=ch===1?data[f]:data[f*ch+1];
   if(!havePrev){prevL=l;prevR=r;havePrev=true;consumed=1;continue;}
   const g=consumed;
   while(phase<g){
    const frac=phase-(g-1);
    const g2=gainAt(zoneStart+(emitted+out.length/2)/48_000);
    out.push((prevL+(l-prevL)*frac)*g2,(prevR+(r-prevR)*frac)*g2);
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
export async function exportTimeline(sources:Record<string,ArrayBuffer>,clips:TimelineClip[],audioClips:AudioClip[],format:VideoFormat,onProgress?:(ratio:number,processed_s:number)=>void,exportOptions?:VideoExportOptions):Promise<{bytes:ArrayBuffer;mime:string;report:VideoReport}>{
 cancelled=false;
 if(!clips.length)throw new Error('The timeline is empty.');
 const steps:string[]=[];
 const inputs=new Map<string,{input:Input;probe:VideoProbe}>();
 const imageNames=new Set(clips.filter(isImageClip).map(c=>c.source));
 const videoNames=new Set(clips.filter(c=>needsSourceFile(c)&&!isImageClip(c)).map(c=>c.source));
 const names=[...new Set([...videoNames,...audioClips.map(c=>c.source)])];
 // Stills decode straight to bitmaps, contain-fit onto the output canvas size decided below.
 const bitmaps=new Map<string,ImageBitmap>();
 try{
  for(const n of names){
   const bytes=sources[n];
   if(!bytes)throw new Error(`Clip source "${n}" is no longer available. Re-open the file to export this timeline.`);
   const input=inputOf(bytes);
   const probe=await probeVideo(bytes.slice(0));
   // Audio-only sources (music, voiceover) are fine as long as no VIDEO clip uses them.
   if(!probe.video&&videoNames.has(n)){input.dispose();throw new Error(`"${n}" has no video track and cannot be on a video timeline.`);}
   if(!probe.audio&&!videoNames.has(n)){input.dispose();throw new Error(`"${n}" has no audio track and cannot be on the audio timeline.`);}
   inputs.set(n,{input,probe});
  }
  const firstMedia=clips.find(c=>needsSourceFile(c)&&!isImageClip(c));
  const first=firstMedia?inputs.get(firstMedia.source)!.probe.video!:{codec:null,width:1280,height:720,fps:null};
  const opts=sanitizeExportOptions(exportOptions);
  // Even dimensions: H.264 cannot encode odd sizes. Everything downstream (letterbox, titles, stills) follows outW/outH.
  const outW=Math.max(2,Math.round(first.width*opts.scale/2)*2),outH=Math.max(2,Math.round(first.height*opts.scale/2)*2);
  const encQuality=opts.quality==='medium'?QUALITY_MEDIUM:opts.quality==='low'?QUALITY_LOW:QUALITY_HIGH;
  if(opts.scale!==1)steps.push(`Resolution scaled to ${outW}×${outH}.`);
  if(opts.fps)steps.push(`Frame rate capped at ${opts.fps} fps.`);
  if(opts.quality!=='high')steps.push(`Encoder quality: ${opts.quality}.`);
  for(const n of imageNames){
   const bytes=sources[n];
   if(!bytes)throw new Error(`Clip source "${n}" is no longer available. Re-open the file to export this timeline.`);
   try{bitmaps.set(n,await createImageBitmap(new Blob([bytes])));}
   catch{throw new Error(`"${n}" could not be decoded as an image.`);}
  }
  const caps=await probeCapabilities(outW,outH);
  const videoCodec=format==='webm'?caps.webmVideo:caps.mp4Video;
  if(!videoCodec)throw new Error(format==='webm'?'This platform cannot encode VP9 or VP8 video.':'This platform cannot encode H.264 (AVC) video. Try WebM instead.');
  const anyAudio=clips.some(c=>needsSourceFile(c)&&!isImageClip(c)&&!isFreeze(c)&&!c.muted&&inputs.get(c.source)!.probe.audio!==null)||audioClips.length>0;
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
  const videoSource=new CanvasSource(canvas,{codec:videoCodec as VideoCodec,quality:encQuality});
  output.addVideoTrack(videoSource);
  let audioSource:AudioSampleSource|null=null;
  if(audioCodec){
   // Every sample is normalized to 48 kHz stereo f32 before it is added: the source rejects mixed raw parameters.
   audioSource=new AudioSampleSource({codec:audioCodec as AudioCodec,quality:encQuality});
   output.addAudioTrack(audioSource);
  }
  await output.start();
  let processed=0;
  const note=(t:number)=>{processed=Math.max(processed,t);if(processed>0)onProgress?.(Math.min(0.99,processed/total),processed);};
  const total_s=total;
  // All audio flows through the windowed mixer: zones, title silence and audio-track clips sum by timeline time,
  // then flush strictly left to right so the encoder sees monotonic timestamps. Flushes are capped at the
  // video duration so an over-long music clip never stretches the file.
  const mixer=audioSource?new WindowMixer():null;
  const writeMixedThrough=async(through:number)=>{
   if(!mixer||!audioSource)return;
   for(const w of mixer.flushThrough(through)){
    const maxFrames=Math.max(0,Math.ceil((total_s-w.start)*48_000));
    if(maxFrames<=0)continue;
    const frames=Math.min(w.data.length/2,maxFrames);
    await audioSource.add(new AudioSample({data:w.data.slice(0,frames*2),format:'f32',numberOfChannels:2,sampleRate:48_000,timestamp:w.start}));
   }
  };
  // Audio-track clips feed once the zone walk passes their start; overlaps sum in the mixer.
  let audioMutedNote=false,audioTrimmedNote=false;
  let audioMuteSkip=false;
  const audioFeed=audioClips.filter(c=>{
   if(c.muted){audioMuteSkip=true;return false;}
   const probe=inputs.get(c.source)?.probe;
   if(!probe?.audio){audioMutedNote=true;return false;}
   if(c.at>=total_s){audioTrimmedNote=true;return false;}
   if(c.at+(c.out_s-c.in_s)>total_s)audioTrimmedNote=true;
   return true;
  }).sort((a,b)=>a.at-b.at);
  let feedIdx=0;
  const mixAudioClip=async(ac:AudioClip)=>{
   const{input}=inputs.get(ac.source)!;
   const aSink=new AudioSampleSink((await input.getAudioTracks())[0]);
   const chunks:Float32Array[]=[];let rate=0,ch=0,count=0;
   for await(const sample of aSink.samples(ac.in_s,ac.out_s)){
    checkCancel();
    rate=sample.sampleRate;ch=sample.numberOfChannels;
    const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
    sample.copyTo(data,{planeIndex:0,format:'f32'});
    chunks.push(data);count+=data.length;
   }
   if(!count||!rate||!ch)return;
   const raw=new Float32Array(count);let o=0;
   for(const part of chunks){raw.set(part,o);o+=part.length;}
   const srcFrames=count/ch,dur=ac.out_s-ac.in_s,len=Math.max(1,Math.round(dur*48_000));
   const out=new Float32Array(len*2);
   for(let i=0;i<len;i++){
    const localT=i/48_000,env=audioEnvelope(ac,localT)*duckGainAt(audioClips,ac,ac.at+localT);
    const srcPos=localT*rate,f0=Math.min(srcFrames-1,Math.floor(srcPos)),f1=Math.min(srcFrames-1,f0+1),fr=Math.min(1,Math.max(0,srcPos-f0));
    const l=ch===1?raw[f0]*(1-fr)+raw[f1]*fr:raw[f0*ch]*(1-fr)+raw[f1*ch]*fr;
    const r=ch===1?l:raw[f0*ch+1]*(1-fr)+raw[f1*ch+1]*fr;
    out[i*2]=l*env;out[i*2+1]=r*env;
   }
   mixer!.addChunk(ac.at,out);
  };
  const feedAudioThrough=async(through:number)=>{while(feedIdx<audioFeed.length&&audioFeed[feedIdx].at<through-1e-9)await mixAudioClip(audioFeed[feedIdx++]);};

  // One CanvasSink per clip index, shared by the clip's solo zone and its neighbouring fades.
  const videoSinks=new Map<number,CanvasSink>();
  const sinkFor=async(i:number)=>{
   let s=videoSinks.get(i);
   if(!s){const{input}=inputs.get(ranges[i].clip.source)!;const track=(await input.getVideoTracks())[0];s=new CanvasSink(track,{width:outW,height:outH,fit:'contain',poolSize:3});videoSinks.set(i,s);}
   return s;
  };
  const fpsOf=(i:number)=>{const c=ranges[i].clip;if(isTitleClip(c)||isImageClip(c)||isFreeze(c))return cappedFps(first.fps,opts.fps);const f=inputs.get(c.source)!.probe.video!.fps;return cappedFps(f,opts.fps);};
  let titlesRendered=false;
  // One scratch canvas per clip index for the card side of a dissolve; keyed redraws skip static frames.
  const cards=new Map<number,{canvas:OffscreenCanvas;ctx:OffscreenCanvasRenderingContext2D;key:string}>();
  const sideFrame=async(i:number,t:number):Promise<OffscreenCanvas|HTMLCanvasElement|ImageBitmap|VideoFrame|null>=>{
   const r=ranges[i],c=r.clip;
   if(isTitleClip(c)||isImageClip(c)){
    let card=cards.get(i);
    if(!card){
     const canvas=new OffscreenCanvas(outW,outH),ctx2=canvas.getContext('2d');
     if(!ctx2)return null;
     card={canvas,ctx:ctx2,key:''};cards.set(i,card);
    }
    if(isImageClip(c)){
     // Static still, drawn once: contain-fit and centered like the video letterbox.
     if(card.key!=='img'){
      const bmp=bitmaps.get(c.source);if(!bmp)return null;
      const scale=Math.min(outW/bmp.width,outH/bmp.height),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
      card.ctx.fillStyle='#000';card.ctx.fillRect(0,0,outW,outH);
      card.ctx.drawImage(bmp,Math.round((outW-w)/2),Math.round((outH-h)/2),w,h);
      card.key='img';
     }
     return card.canvas;
    }
    const local=Math.max(0,t-r.start),key=`${local.toFixed(4)}`;
    if(card.key!==key){drawTitleCard(card.ctx,c as TitleClip,outW,outH,local);card.key=key;}
    return card.canvas;
   }
   const sink=await sinkFor(i);
   const src=isFreeze(c)?c.freeze!:Math.min(c.out_s-1e-3,c.in_s+(t-r.start)*speedOf(c));
   const f=await sink.getCanvas(src);
   return f?f.canvas:null;
  };
  // Mirrored clips draw through this instead of a bare drawImage; titles never pass a flip.
  const drawFlip=(img:CanvasImageSource,flip:string)=>{
   if(flip==='none'){ctx.drawImage(img,0,0);return;}
   ctx.save();
   ctx.translate(flip.includes('h')?outW:0,flip.includes('v')?outH:0);
   ctx.scale(flip.includes('h')?-1:1,flip.includes('v')?-1:1);
   ctx.drawImage(img,0,0);
   ctx.restore();
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
      addSilence:mixer?async chunk=>{mixer.addSilence(chunk.timestamp,chunk.data.length/chunk.channels/chunk.rate);}:undefined,
      onFrame:note});
     note(z.end);
     continue;
    }
    const rec=inputs.get(c.source);
    const speed=speedOf(c);
    const srcStart=c.in_s+(z.start-r.start)*speed,srcEnd=c.out_s-(r.end-z.end)*speed;
    const sink=rec?await sinkFor(z.a):null;
    if(speed!==1||isImageClip(c)||isFreeze(c)){
     // Sped clips render on a fixed output grid (source fps): frames drop or repeat naturally.
     const fps=fpsOf(z.a),n=Math.max(1,Math.ceil((z.end-z.start)*fps));
     for(let k=0;k<n;k++){
      checkCancel();
      const t=z.start+k/fps,f=await sideFrame(z.a,t);
      if(f){ctx.globalAlpha=1;drawFlip(f as CanvasImageSource,flipOf(c));}
      await videoSource.add(t,Math.max(1e-3,Math.min(1/fps,z.end-t)));
      note(t);
     }
    }else if(sink){
     let base:number|null=null;
     for await(const frame of sink.canvases(srcStart,srcEnd)){
      checkCancel();
      if(base===null)base=frame.timestamp;
      ctx.globalAlpha=1;drawFlip(frame.canvas,flipOf(c));
      await videoSource.add(z.start+(frame.timestamp-base),frame.duration);
      note(z.start+(frame.timestamp-base));
     }
    }
    if(rec?.probe.audio&&mixer&&!c.muted&&!isFreeze(c)){
     const aTrack=(await rec.input.getAudioTracks())[0];
     await emitZoneAudio(new AudioSampleSink(aTrack),srcStart,srcEnd,z.start,(t)=>c.gain*clipFadeGain(c,r.start,r.end,t),speed,mixer);
    }else if(rec&&rec.probe.audio===null&&audioSource&&z===zones[0])steps.push(`No audio track in ${c.source}.`);
   }else{
    const ra=ranges[z.a],rb=ranges[z.b],d=z.end-z.start;
    if(isTitleClip(ra.clip)||isTitleClip(rb.clip))titlesRendered=true;
    const fps=fpsOf(z.a),n=Math.max(1,Math.ceil(d*fps));
    for(let k=0;k<n;k++){
     checkCancel();
     const t=z.start+k/fps,p=Math.min(1,(t-z.start)/d);
     const[fa,fb]=await Promise.all([sideFrame(z.a,t),sideFrame(z.b,t)]);
     ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,outW,outH);
     if(fa){ctx.globalAlpha=1;drawFlip(fa as CanvasImageSource,flipOf(ra.clip));}
     if(fb){ctx.globalAlpha=p;drawFlip(fb as CanvasImageSource,flipOf(rb.clip));}
     ctx.globalAlpha=1;
     await videoSource.add(t,1/fps);
     note(t);
    }
    if(mixer){
     // Equal-power mix of both sides, resampled by hand to 48 kHz stereo; the transform passes it through untouched.
     const len=Math.max(1,Math.round(d*48_000));
     const mix=new Float32Array(len*2);
     let any=false;
     for(const side of[{r:ra,sign:'out' as const},{r:rb,sign:'in' as const}]){
      const c=side.r.clip;
      if(c.muted||isTitleClip(c)||isImageClip(c)||isFreeze(c))continue;
      const{input,probe}=inputs.get(c.source)!;
      if(!probe.audio)continue;
      const srcStart=c.in_s+(z.start-side.r.start)*speedOf(c),srcEnd=c.in_s+(z.end-side.r.start)*speedOf(c);
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
       const env=(side.sign==='out'?Math.cos(pr*Math.PI/2):Math.sin(pr*Math.PI/2))*c.gain*clipFadeGain(c,side.r.start,side.r.end,z.start+i/48_000);
       const srcPos=i/48_000*rate*speedOf(c),f0=Math.min(frames-1,Math.floor(srcPos)),f1=Math.min(frames-1,f0+1),fr=Math.min(1,Math.max(0,srcPos-f0));
       const l=ch===1?raw[f0]*(1-fr)+raw[f1]*fr:raw[f0*ch]*(1-fr)+raw[f1*ch]*fr;
       const rgt=ch===1?l:raw[f0*ch+1]*(1-fr)+raw[f1*ch+1]*fr;
       mix[i*2]+=l*env;mix[i*2+1]+=rgt*env;
      }
     }
     if(any)mixer!.addChunk(z.start,mix);
    }
   }
   await feedAudioThrough(z.end);
   await writeMixedThrough(z.end);
  }
  await feedAudioThrough(Number.MAX_SAFE_INTEGER);
  await writeMixedThrough(Number.MAX_SAFE_INTEGER);
  await output.finalize();
  const buffer=(output.target as BufferTarget).buffer;
  if(!buffer)throw new Error('The export produced no output.');
  if(clips.length>1)steps.unshift(`${clips.length} clips joined.`);
  if(ranges.some((r,i)=>i<ranges.length-1&&fadeOf(r.clip)>0))steps.push('Crossfades applied.');
  if(titlesRendered)steps.push('Title cards rendered.');
  if(clips.some(c=>c.muted))steps.push('Muted clips kept as silence.');
  if(clips.some(c=>c.gain!==1&&!c.muted))steps.push('Per-clip gain applied.');
  if(clips.some(c=>fadeInOf(c)>0||fadeOutOf(c)>0))steps.push('Clip audio fades applied.');
  if(clips.some(isFreeze))steps.push('Freeze frames held.');
  if(clips.some(c=>needsSourceFile(c)&&speedOf(c)!==1))steps.push('Clip speed applied; audio is resampled (pitch shifts).');
  if(audioFeed.length)steps.push(`${audioFeed.length} audio-track clip(s) mixed in.`);
  if(audioClips.some(c=>c.duck>0&&!c.muted))steps.push('Auto-duck applied under foreground audio.');
  if(audioMuteSkip)steps.push('Muted audio clips kept as silence.');
  if(audioMutedNote)steps.push('Some audio-track sources have no audio track and were skipped.');
  if(audioTrimmedNote)steps.push('Audio-track clips past the end of the video were trimmed.');
  const report:VideoReport={format,duration_s:total,bytes:buffer.byteLength,videoCodec,audioCodec,steps};
  return{bytes:buffer,mime:format==='webm'?'video/webm':'video/mp4',report};
 }catch(error){
  if(error instanceof ExportCancelled)throw error;
  if(error instanceof Error&&/cancel/i.test(error.message))throw new ExportCancelled();
  throw error;
 }finally{
  cancelled=false;
  for(const{input}of inputs.values())input.dispose();
  for(const b of bitmaps.values())b.close();
 }
}
