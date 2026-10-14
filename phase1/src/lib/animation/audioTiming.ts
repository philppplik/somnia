import {evaluate} from './interpolate';
import {MAX_PRECOMP_DEPTH,type AnimationDocument,type Composition,type Layer} from './model';
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
 const {start,end}=clipSpan(l);return l.audio&&t>=start&&t<end?l.audio.trimIn+(l.audio.rate===undefined?t-start:Math.round((t-start)*l.audio.rate)):null;
}
export interface Segment{layer:string;assetId:string;/** Seconds after the pass start at which the clip begins. */when:number;/** Seconds into the file. */offset:number;/** Seconds on the composition timeline. */duration:number;/** Playback rate of the file (1 = normal). */rate:number;/** Seconds of file data the segment consumes (duration times rate). */fileDuration:number;/** Composition ticks of the segment. */from:number;to:number}
/** Clip segments audible while the playhead moves over composition ticks [from,to). */
export function segmentsBetween(comp:Composition,from:number,to:number,layers:readonly Layer[]=audibleLayers(comp)):Segment[]{
 const out:Segment[]=[];
 for(const l of layers){
  const {start,end}=clipSpan(l);const a=Math.max(from,start),b=Math.min(to,end);if(b<=a||!l.audio)continue;
  const rate=l.audio.rate??1;out.push({layer:l.id,assetId:l.audio.assetId,when:(a-from)/TICKS_PER_SECOND,offset:(l.audio.trimIn+(rate===1?a-start:(a-start)*rate))/TICKS_PER_SECOND,duration:(b-a)/TICKS_PER_SECOND,rate,fileDuration:(b-a)*rate/TICKS_PER_SECOND,from:a,to:b});
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
export function audioSignature(doc:AnimationDocument|null,comp0:Composition|undefined):string{
 if(!doc||!comp0)return '';const comp=withPrecompAudio(comp0,doc.compositions);const ls=comp.layers.filter(isAudioLayer);if(!ls.length)return '';
 return JSON.stringify([comp.layers.some(l=>l.solo),ls.map(l=>[l.id,l.visible,l.solo,l.inT,l.outT,l.offset,l.audio!.assetId,l.audio!.trimIn,l.audio!.volume,l.audio!.rate??1])]);
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

export const MAX_PRECOMP_AUDIO_LAYERS=200;
/**
 * Audio of nested compositions mapped into `comp` time: each child clip becomes a copy on the parent timeline, moved by the comp layer's start and start-time offset, scaled by its speed (the file plays faster or slower, so pitch follows speed), cut to the comp layer's span and to the child's length, and repeated while the comp layer loops. Comp layers that are hidden (or not soloed during a solo) stay silent. Returns `comp` itself when there is nothing to add.
 */
export function withPrecompAudio(comp:Composition,comps:readonly Composition[]|undefined):Composition{
 if(!comps||!comp.layers.some(l=>l.kind==='comp'))return comp;
 const added=nestedAudio(comp,comps,0);return added.length?{...comp,layers:[...comp.layers,...added]}:comp;
}
function nestedAudio(comp:Composition,comps:readonly Composition[],depth:number):Layer[]{
 if(depth>MAX_PRECOMP_DEPTH)return [];
 const solo=comp.layers.some(l=>l.solo),out:Layer[]=[];
 for(const pl of comp.layers){
  if(pl.kind!=='comp'||!pl.visible||(solo&&!pl.solo))continue;
  const child=comps.find(c=>c.id===pl.source.compId);if(!child||child.id===comp.id)continue;
  const clips=[...audibleLayers(child),...nestedAudio(child,comps,depth+1)];
  const plStart=pl.inT+pl.offset,plEnd=pl.outT+pl.offset,cStart=child.start,cEnd=child.start+child.duration,dur=Math.max(1,child.duration);
  const speed=(pl.source.speed??100)/100,gain=(pl.source.volume??100)/100,t0=pl.source.timeOffset??0;
  /** Parent tick of child tick `x` in pass `k`. */
  const at=(x:number,k:number)=>plStart+Math.round((x-cStart-t0+k*dur)/speed);
  for(let k=0;k<(pl.source.loop?64:1);k++){
   if(at(cStart,k)>=plEnd)break;
   for(const cl of clips){
    if(!cl.audio)continue;
    const s=cl.inT+cl.offset,e=Math.min(cl.outT+cl.offset,cEnd);if(e<=s)continue;
    const ps=at(s,k),pe=at(e,k),ns=Math.max(ps,plStart),ne=Math.min(pe,plEnd);if(ne<=ns)continue;
    if(out.length>=MAX_PRECOMP_AUDIO_LAYERS)return out;
    const rate=(cl.audio.rate??1)*speed,vol=cl.audio.volume;
    out.push({...cl,id:`${pl.id}:${k}:${cl.id}`,inT:ns,outT:ne,offset:0,solo:solo,visible:true,
     audio:{...cl.audio,trimIn:cl.audio.trimIn+Math.round((ns-ps)*rate),...(rate!==1?{rate}:{}),
      volume:gain===1?{...vol,keys:vol.keys.map(x=>({...x,t:at(x.t,k)}))}:{...vol,value:(vol.value as number)*gain,keys:vol.keys.map(x=>({...x,t:at(x.t,k),v:(x.v as number)*gain}))}}});
   }
  }
 }
 return out;
}
