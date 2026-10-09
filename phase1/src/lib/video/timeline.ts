/** The multi-clip timeline: an ordered, gap-free edit list over any opened video sources. Pure model - no DOM, no engine. */
import {clampTitleSeconds,isTitleClip,splitTitleClip} from './titles';

/**
 * One clip: a source-time range of a media item, with per-clip audio treatment. `in_s`/`out_s` are source seconds.
 * `crossfade_s` overlaps this clip's tail with the next clip's head (0 or absent = hard cut; always 0 on the last clip).
 * Title clips (`kind:'title'`) carry no source: `in_s` stays 0 and `out_s` is the card duration.
 */
export interface TimelineClip{id:string;source:string;in_s:number;out_s:number;gain:number;muted:boolean;crossfade_s?:number;kind?:'media'|'title';title?:import('./titles').TitleSpec}
/** The shortest clip worth keeping; below it splits and trims only produce broken files. */
export const MIN_CLIP_SECONDS=0.05;
export const MAX_GAIN=2;
export const clipDuration=(c:TimelineClip)=>Math.max(0,c.out_s-c.in_s);
/** The crossfade from this clip into the next one, in seconds. 0 means a hard cut. */
export const fadeOf=(c:TimelineClip)=>c.crossfade_s??0;
/** A neutral timeline is one untrimmed full-length clip of its root source at unity gain - it exports the original. */
export const isNeutralTimeline=(clips:TimelineClip[],root:string,rootDuration:number)=>clips.length===1&&!isTitleClip(clips[0])&&clips[0].source===root&&clips[0].in_s===0&&Math.abs(clips[0].out_s-rootDuration)<0.01&&clips[0].gain===1&&!clips[0].muted;
/** Total timeline length: the clip durations minus the crossfade overlaps. */
export const timelineDuration=(clips:TimelineClip[])=>{const r=clipRanges(clips);return r.length?r[r.length-1].end:0;};
export interface ClipRange{clip:TimelineClip;index:number;start:number;end:number}
/** Start/end of every clip on the timeline clock. A crossfade pulls the next clip's start earlier by the overlap. */
export function clipRanges(clips:TimelineClip[]):ClipRange[]{
 const out:ClipRange[]=[];let t=0;
 clips.forEach((clip,index)=>{const d=clipDuration(clip);out.push({clip,index,start:t,end:t+d});t+=d-fadeOf(clip);});
 return out;
}
/** The clip under a timeline time, with the matching source time. During an overlap this is the outgoing clip. Times past the end land on the last clip's out point. */
export function locate(clips:TimelineClip[],time:number):{range:ClipRange;sourceTime:number}|null{
 const ranges=clipRanges(clips);if(!ranges.length)return null;
 const r=ranges.find(r=>time<r.end)??ranges[ranges.length-1];
 const sourceTime=Math.min(r.clip.out_s,r.clip.in_s+Math.max(0,time-r.start));
 return{range:r,sourceTime};
}
export interface BlendEntry{range:ClipRange;sourceTime:number;video:number;audio:number}
/**
 * The 1-2 clips visible at a timeline time. `video` is the linear dissolve weight of each side (outgoing 1-p,
 * incoming p; they sum to 1 and composite over black). `audio` is the equal-power fade gain; multiply it by the clip's own gain/mute.
 */
export function blendAt(clips:TimelineClip[],time:number):BlendEntry[]{
 const ranges=clipRanges(clips);if(!ranges.length)return[];
 const hit=ranges.findIndex(r=>time<r.end);
 const i=hit<0?ranges.length-1:hit;
 const entry=(r:ClipRange,video:number,audio:number):BlendEntry=>({range:r,sourceTime:Math.min(r.clip.out_s,r.clip.in_s+Math.max(0,time-r.start)),video,audio});
 const r=ranges[i],next=ranges[i+1];
 const d=fadeOf(r.clip);
 if(next&&d>0&&time>=next.start){
  const p=Math.min(1,Math.max(0,(time-next.start)/d));
  return[entry(r,1-p,Math.cos(p*Math.PI/2)),entry(next,p,Math.sin(p*Math.PI/2))];
 }
 return[entry(r,1,1)];
}
let nextId=1;
/** Unique, stable-enough ids for clips in one session. */
export const newClipId=()=>`clip-${nextId++}-${Math.random().toString(36).slice(2,7)}`;
export const fullClip=(source:string,duration:number):TimelineClip=>({id:newClipId(),source,in_s:0,out_s:Math.max(MIN_CLIP_SECONDS,duration),gain:1,muted:false});
/** A title card clip of a given duration; the timeline treats it like any other clip, the renderers draw the card. */
/** Clamps every clip into its source duration, rounds to milliseconds and drops degenerate ranges. Fades clamp to both neighbours; the last clip never fades. */
export function sanitizeClips(clips:TimelineClip[],durations:Record<string,number|undefined>):TimelineClip[]{
 const clean=clips.flatMap(c=>{
  // Clip shape only: the spec itself is sanitized where it is drawn, so a valid spec survives sanitation untouched.
  if(isTitleClip(c))return[{...c,kind:'title' as const,source:'',in_s:0,out_s:clampTitleSeconds(c.out_s),gain:1,muted:false}];
  const d=durations[c.source];
  if(d===undefined)return[c];
  if(d<=0)return[];
  const in_s=Math.min(Math.max(0,c.in_s),d),out_s=Math.min(Math.max(in_s,c.out_s),d);
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  return[{...c,in_s:Number(in_s.toFixed(3)),out_s:Number(out_s.toFixed(3)),gain:Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1)),muted:!!c.muted}];
 });
 return clean.map((c,i)=>{
  const max=i+1<clean.length?Math.min(clipDuration(c),clipDuration(clean[i+1])):0;
  const raw=fadeOf(c);
  const fade=Number(Math.min(Math.max(0,Number.isFinite(raw)?raw:0),max).toFixed(3));
  return fade===raw?c:{...c,crossfade_s:fade};
 });
}
/** Splits the clip under a timeline time in two. The left part cuts hard into the right, the right keeps the original fade into the next clip. Refuses cuts too close to an edge; returns null there. */
export function splitAt(clips:TimelineClip[],time:number):TimelineClip[]|null{
 const hit=locate(clips,time);if(!hit)return null;
 const{range,sourceTime}=hit,c=range.clip;
 if(sourceTime-c.in_s<MIN_CLIP_SECONDS||c.out_s-sourceTime<MIN_CLIP_SECONDS)return null;
 if(isTitleClip(c)){
  const halves=splitTitleClip(c,sourceTime-c.in_s);if(!halves)return null;
  const[l,r2]=halves;
  return[...clips.slice(0,range.index),{...l,crossfade_s:0},{...r2,crossfade_s:fadeOf(c)},...clips.slice(range.index+1)];
 }
 const left:TimelineClip={...c,id:newClipId(),out_s:Number(sourceTime.toFixed(3)),crossfade_s:0};
 const right:TimelineClip={...c,id:newClipId(),in_s:Number(sourceTime.toFixed(3))};
 return[...clips.slice(0,range.index),left,right,...clips.slice(range.index+1)];
}
/** Removes a clip and closes the gap (ripple). */
export const rippleDelete=(clips:TimelineClip[],id:string)=>clips.filter(c=>c.id!==id);
/** Moves a clip to a new index, clamped; returns the same array when the move is a no-op. */
export function moveClip(clips:TimelineClip[],id:string,toIndex:number):TimelineClip[]{
 const from=clips.findIndex(c=>c.id===id);if(from<0)return clips;
 const to=Math.min(clips.length-1,Math.max(0,toIndex));if(to===from)return clips;
 const next=[...clips];const[clip]=next.splice(from,1);next.splice(to,0,clip);return next;
}
/** Moves one clip edge to a source time, keeping the clip inside its bounds and above the minimum length. */
export function setClipEdge(clips:TimelineClip[],id:string,edge:'in'|'out',at:number):TimelineClip[]{
 return clips.map(c=>{
  if(c.id!==id||isTitleClip(c))return c;
  const in_s=edge==='in'?Math.min(at,c.out_s-MIN_CLIP_SECONDS):c.in_s;
  const out_s=edge==='out'?Math.max(at,c.in_s+MIN_CLIP_SECONDS):c.out_s;
  return{...c,in_s:Number(Math.max(0,in_s).toFixed(3)),out_s:Number(Math.max(out_s,c.in_s+MIN_CLIP_SECONDS).toFixed(3))};
 });
}
/** Sets the crossfade from one clip into the next, clamped to both clip lengths; the last clip takes none. */
export function setCrossfade(clips:TimelineClip[],id:string,seconds:number):TimelineClip[]{
 const i=clips.findIndex(c=>c.id===id);if(i<0)return clips;
 const max=i+1<clips.length?Math.min(clipDuration(clips[i]),clipDuration(clips[i+1])):0;
 const fade=Number(Math.min(Math.max(0,Number.isFinite(seconds)?seconds:0),max).toFixed(3));
 return clips.map((c,j)=>j===i?{...c,crossfade_s:fade}:c);
}
