import type {AnimationDocument,Composition} from './model';
import {dataUrlBytes} from './audioCore';
import {audibleLayers,gainCurve,playbackPlan,segmentsBetween} from './audioTiming';
/** Minimal Web Audio surface, so the scheduler is testable with a fake clock. */
export interface BufferLike{duration:number}
export interface ParamLike{value:number;setValueAtTime(v:number,t:number):unknown;setValueCurveAtTime(c:Float32Array,t:number,d:number):unknown}
export interface NodeLike{connect(n:unknown):unknown;disconnect():unknown}
export interface SourceLike extends NodeLike{buffer:BufferLike|null;playbackRate?:ParamLike;start(when:number,offset:number,duration:number):void;stop(when?:number):void}
export interface GainLike extends NodeLike{gain:ParamLike}
export interface AudioContextLike{currentTime:number;state:string;destination:unknown;outputLatency?:number;baseLatency?:number;resume():Promise<void>;close?():Promise<void>;decodeAudioData(b:ArrayBuffer):Promise<BufferLike>;createBufferSource():SourceLike;createGain():GainLike;createMediaStreamDestination?():NodeLike&{stream:MediaStream}}
/** Seconds between "now" and the first audio sample, so the sources can be scheduled before the clock passes them. */
export const START_LEAD=0.06;
/** Outside this, the reported output latency is not believable and is ignored. */
export const MAX_LATENCY=0.25;
export class AudioUnavailable extends Error{}
/**
 * Clock-synced preview. The Web Audio clock is the master: `elapsedMs()` is what the playhead must follow, so picture and sound cannot drift.
 * Sources are scheduled at absolute context times (never by timers), one work-area pass at a time with one pass of lookahead.
 */
export class AudioPreview{
 private ctx:AudioContextLike|null=null;private dest:NodeLike|null=null;private t0=0;private latency=0;private nodes:{src:SourceLike;gain:GainLike;end:number}[]=[];private scheduled=0;
 private plan:ReturnType<typeof playbackPlan>|null=null;private comp:Composition|null=null;private layers:ReturnType<typeof audibleLayers>=[];
 private buffers=new Map<string,Promise<BufferLike>>();private bufferCtx:AudioContextLike|null=null;
 constructor(private readonly make:()=>AudioContextLike|null){}
 get active(){return this.ctx!==null;}
 private decode(ctx:AudioContextLike,doc:AnimationDocument,assetId:string){
  if(this.bufferCtx!==ctx){this.buffers.clear();this.bufferCtx=ctx;}
  let p=this.buffers.get(assetId);
  if(!p){const a=doc.audioAssets?.find(x=>x.id===assetId);if(!a)return Promise.reject(new AudioUnavailable('Audio file is missing.'));
   const bytes=dataUrlBytes(a.data,a.mime);p=ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);this.buffers.set(assetId,p);p.catch(()=>this.buffers.delete(assetId));}
  return p;
 }
 /** Returns the tick playback really starts from (the same rule as `playbackAt`), or null when nothing is audible, in which case the caller keeps its own clock. */
 async start(doc:AnimationDocument,comp:Composition,startTick:number,loop:boolean,destination?:NodeLike):Promise<number|null>{
  this.stop();
  const layers=audibleLayers(comp);if(!layers.length)return null;
  const ctx=this.make();if(!ctx)throw new AudioUnavailable('Audio playback is not available.');
  try{
   if(ctx.state!=='running')await ctx.resume();
   if(ctx.state==='closed')throw new AudioUnavailable('Audio playback is not available.');
   const buffers=new Map<string,BufferLike>();
   for(const id of new Set(layers.map(l=>l.audio!.assetId)))buffers.set(id,await this.decode(ctx,doc,id));
   this.ctx=ctx;this.comp=comp;this.layers=layers;this.plan=playbackPlan(startTick,comp.workArea,comp.fps,loop);this.scheduled=0;
   this.dest=destination??null;
   this.latency=Math.min(MAX_LATENCY,Math.max(0,ctx.outputLatency||ctx.baseLatency||0));
   this.t0=ctx.currentTime+START_LEAD;this.buffersNow=buffers;
   this.fill(1);
   return this.plan.startTick;
  }catch(e){this.stop();throw e instanceof AudioUnavailable?e:new AudioUnavailable((e as Error).message||'Audio could not be decoded.');}
 }
 private buffersNow=new Map<string,BufferLike>();
 /** Milliseconds of playback so far on the audio clock, minus output latency so the picture matches what is heard. Never negative. */
 elapsedMs():number{return this.ctx?Math.max(0,(this.ctx.currentTime-this.t0-this.latency)*1000):0;}
 private fill(k:number){
  const ctx=this.ctx,plan=this.plan,comp=this.comp;if(!ctx||!plan||!comp)return;
  for(;this.scheduled<=k;this.scheduled++){
   const pass=plan.passes(this.scheduled);if(!pass)break;
   for(const seg of segmentsBetween(comp,pass.from,pass.to,this.layers)){
    const layer=this.layers.find(l=>l.id===seg.layer)!,buf=this.buffersNow.get(seg.assetId);if(!buf)continue;
    const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=buf;src.connect(gain);gain.connect(this.dest??ctx.destination);
    const when=this.t0+pass.startSec+seg.when,g=gainCurve(layer,seg.from,seg.to);
    if('constant' in g)gain.gain.value=g.constant;else{gain.gain.value=g.curve[0];gain.gain.setValueAtTime(g.curve[0],when);gain.gain.setValueCurveAtTime(g.curve,when,seg.duration);}
    if(seg.rate!==1&&src.playbackRate)src.playbackRate.value=seg.rate;
    src.start(when,seg.offset,Math.min(seg.fileDuration,Math.max(0,buf.duration-seg.offset)));
    this.nodes.push({src,gain,end:when+seg.duration});
   }
  }
 }
 /** Call every animation frame: keeps one pass of lookahead scheduled for looped playback. */
 poll(){
  if(!this.ctx||!this.plan)return;
  const elapsed=this.elapsedMs()/1000;let k=0;while(true){const p=this.plan.passes(k+1);if(!p||p.startSec>elapsed)break;k++;}
  this.fill(k+1);
  const now=this.ctx.currentTime;this.nodes=this.nodes.filter(n=>{if(n.end>=now)return true;try{n.src.disconnect();n.gain.disconnect();}catch{/* detached */}return false;});
 }
 stop(){
  for(const n of this.nodes){try{n.src.stop();}catch{/* never started or already ended */}try{n.src.disconnect();n.gain.disconnect();}catch{/* detached */}}
  this.nodes=[];this.plan=null;this.comp=null;this.layers=[];this.ctx=null;this.dest=null;this.scheduled=0;
 }
 dispose(){this.stop();this.buffers.clear();const c=this.bufferCtx;this.bufferCtx=null;void c?.close?.();}
}
/** Browser factory: one shared context, created lazily on a user gesture. */
let shared:AudioContextLike|null=null;
export function browserAudioContext():AudioContextLike|null{
 if(shared&&shared.state!=='closed')return shared;
 const C=(globalThis as unknown as {AudioContext?:new()=>AudioContextLike;webkitAudioContext?:new()=>AudioContextLike}).AudioContext??(globalThis as unknown as {webkitAudioContext?:new()=>AudioContextLike}).webkitAudioContext;
 return shared=C?new C():null;
}
