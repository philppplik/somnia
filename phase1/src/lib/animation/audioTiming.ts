import {evaluate} from './interpolate';
import type {AnimationDocument,Composition,Layer} from './model';
import type {Rational} from './time';
import {TICKS_PER_SECOND,frameToTick,tickToFrame} from './time';
import {MAX_AUDIO_VOLUME} from './audioCore';
/** Pure audio timing for clock-synced preview. Everything is integer ticks until the final conversion to seconds. */
export const isAudioLayer=(l:Layer)=>l.kind==='audio'&&!!l.audio;
/** Audible like the viewer's visible rule: eye on, and solo respected. */
export function audibleLayers(comp:Composition):Layer[]{
 const solo=comp.layers.some(l=>l.solo);return comp.layers.filter(l=>isAudioLayer(l)&&l.visible&&(!solo||l.solo));
}
/** Clip span on the composition timeline, [start,end). */
export const clipSpan=(l:Layer)=>({start:l.inT+l.offset,end:l.outT+l.offset});
/** File position (ticks) heard at composition tick `t`, or null outside the clip. */
export function sourceTickAt(l:Layer,t:number):number|null{
 const {start,end}=clipSpan(l);return l.audio&&t>=start&&t<end?l.audio.trimIn+(t-start):null;
}
export interface Segment{layer:string;assetId:string;/** Seconds after the pass start at which the clip begins. */when:number;/** Seconds into the file. */offset:number;duration:number;/** Composition ticks of the segment. */from:number;to:number}
/** Clip segments audible while the playhead moves over composition ticks [from,to). */
export function segmentsBetween(comp:Composition,from:number,to:number,layers:readonly Layer[]=audibleLayers(comp)):Segment[]{
 const out:Segment[]=[];
 for(const l of layers){
  const {start,end}=clipSpan(l);const a=Math.max(from,start),b=Math.min(to,end);if(b<=a||!l.audio)continue;
  out.push({layer:l.id,assetId:l.audio.assetId,when:(a-from)/TICKS_PER_SECOND,offset:(l.audio.trimIn+(a-start))/TICKS_PER_SECOND,duration:(b-a)/TICKS_PER_SECOND,from:a,to:b});
 }
 return out;
}
/** Plan of passes through the work area, matching `playbackAt`: pass 0 starts at `start` and runs to the work-area end; later passes (loop only) cover the whole area. */
export interface Plan{startTick:number;passes:(k:number)=>{startSec:number;from:number;to:number}|null}
export function playbackPlan(startTick:number,area:{in:number;out:number},fps:Rational,loop:boolean):Plan{
 const first=tickToFrame(area.in,fps),endFrame=Math.max(first+1,tickToFrame(area.out,fps)),last=endFrame-1,count=endFrame-first;
 let from=tickToFrame(startTick,fps);if(from<first||from>last||(!loop&&from===last))from=first;
 const sec=(frames:number)=>frames*fps.den/fps.num;
 const endTick=frameToTick(endFrame,fps),areaStart=frameToTick(first,fps);
 return {startTick:frameToTick(from,fps),passes:k=>{
  if(k===0)return {startSec:0,from:frameToTick(from,fps),to:endTick};
  if(!loop)return null;
  return {startSec:sec(endFrame-from)+(k-1)*sec(count),from:areaStart,to:endTick};
 }};
}
/** Gain (0..2) samples for composition ticks [from,to], at most 30 per second and 1024 in total. A constant volume returns one value. */
export function gainCurve(l:Layer,from:number,to:number):{constant:number}|{curve:Float32Array}{
 const vol=l.audio!.volume,clamp=(v:number)=>Math.min(MAX_AUDIO_VOLUME,Math.max(0,v))/100;
 if(!vol.keys.length||to<=from)return {constant:clamp(vol.value as number)};
 const n=Math.max(2,Math.min(1024,Math.ceil((to-from)/TICKS_PER_SECOND*30)+1)),curve=new Float32Array(n);
 for(let i=0;i<n;i++)curve[i]=clamp(evaluate(vol,Math.round(from+(to-from)*i/(n-1))) as number);
 return {curve};
}
/** Signature of everything that changes what is heard. A change while playing pauses playback instead of drifting out of sync. */
export function audioSignature(doc:AnimationDocument|null,comp:Composition|undefined):string{
 if(!doc||!comp)return '';const ls=comp.layers.filter(isAudioLayer);if(!ls.length)return '';
 return JSON.stringify([comp.layers.some(l=>l.solo),ls.map(l=>[l.id,l.visible,l.solo,l.inT,l.outT,l.offset,l.audio!.assetId,l.audio!.trimIn,l.audio!.volume])]);
}
/** Waveform columns (0..1) for file range [from,from+length) ticks, at most `columns` (hard cap 400) so the drawing stays bounded whatever the zoom. */
export function visiblePeaks(peaks:readonly number[],durationTicks:number,from:number,length:number,columns:number):number[]{
 const n=Math.max(1,Math.min(400,Math.floor(columns))),bins=peaks.length;if(!bins||durationTicks<=0||length<=0)return [];
 const out:number[]=[];
 for(let c=0;c<n;c++){
  const a=Math.floor((from+length*c/n)/durationTicks*bins),z=Math.max(a+1,Math.ceil((from+length*(c+1)/n)/durationTicks*bins));let m=0;
  for(let i=Math.max(0,a);i<Math.min(bins,z);i++)if(peaks[i]>m)m=peaks[i];
  out.push(m/255);
 }
 return out;
}
