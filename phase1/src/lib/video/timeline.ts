/** The multi-clip timeline: an ordered, gap-free edit list over any opened video sources. Pure model - no DOM, no engine. */

/** One clip: a source-time range of a media item, with per-clip audio treatment. `in_s`/`out_s` are source seconds. */
export interface TimelineClip{id:string;source:string;in_s:number;out_s:number;gain:number;muted:boolean}
/** The shortest clip worth keeping; below it splits and trims only produce broken files. */
export const MIN_CLIP_SECONDS=0.05;
export const MAX_GAIN=2;
export const clipDuration=(c:TimelineClip)=>Math.max(0,c.out_s-c.in_s);
/** A neutral timeline is one untrimmed full-length clip of its root source at unity gain - it exports the original. */
export const isNeutralTimeline=(clips:TimelineClip[],root:string,rootDuration:number)=>clips.length===1&&clips[0].source===root&&clips[0].in_s===0&&Math.abs(clips[0].out_s-rootDuration)<0.01&&clips[0].gain===1&&!clips[0].muted;
export const timelineDuration=(clips:TimelineClip[])=>clips.reduce((t,c)=>t+clipDuration(c),0);
export interface ClipRange{clip:TimelineClip;index:number;start:number;end:number}
/** Start/end of every clip on the timeline clock. */
export function clipRanges(clips:TimelineClip[]):ClipRange[]{
 const out:ClipRange[]=[];let t=0;
 clips.forEach((clip,index)=>{const d=clipDuration(clip);out.push({clip,index,start:t,end:t+d});t+=d;});
 return out;
}
/** The clip under a timeline time, with the matching source time. Times past the end land on the last clip's out point. */
export function locate(clips:TimelineClip[],time:number):{range:ClipRange;sourceTime:number}|null{
 const ranges=clipRanges(clips);if(!ranges.length)return null;
 const r=ranges.find(r=>time<r.end)??ranges[ranges.length-1];
 const sourceTime=Math.min(r.clip.out_s,r.clip.in_s+Math.max(0,time-r.start));
 return{range:r,sourceTime};
}
let nextId=1;
/** Unique, stable-enough ids for clips in one session. */
export const newClipId=()=>`clip-${nextId++}-${Math.random().toString(36).slice(2,7)}`;
export const fullClip=(source:string,duration:number):TimelineClip=>({id:newClipId(),source,in_s:0,out_s:Math.max(MIN_CLIP_SECONDS,duration),gain:1,muted:false});
/** Clamps every clip into its source duration, rounds to milliseconds and drops degenerate ranges. */
export function sanitizeClips(clips:TimelineClip[],durations:Record<string,number|undefined>):TimelineClip[]{
 return clips.flatMap(c=>{
  const d=durations[c.source];
  if(d===undefined)return[c];
  if(d<=0)return[];
  const in_s=Math.min(Math.max(0,c.in_s),d),out_s=Math.min(Math.max(in_s,c.out_s),d);
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  return[{...c,in_s:Number(in_s.toFixed(3)),out_s:Number(out_s.toFixed(3)),gain:Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1)),muted:!!c.muted}];
 });
}
/** Splits the clip under a timeline time in two. Refuses cuts too close to an edge; returns null there. */
export function splitAt(clips:TimelineClip[],time:number):TimelineClip[]|null{
 const hit=locate(clips,time);if(!hit)return null;
 const{range,sourceTime}=hit,c=range.clip;
 if(sourceTime-c.in_s<MIN_CLIP_SECONDS||c.out_s-sourceTime<MIN_CLIP_SECONDS)return null;
 const left:TimelineClip={...c,id:newClipId(),out_s:Number(sourceTime.toFixed(3))};
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
  if(c.id!==id)return c;
  const in_s=edge==='in'?Math.min(at,c.out_s-MIN_CLIP_SECONDS):c.in_s;
  const out_s=edge==='out'?Math.max(at,c.in_s+MIN_CLIP_SECONDS):c.out_s;
  return{...c,in_s:Number(Math.max(0,in_s).toFixed(3)),out_s:Number(Math.max(out_s,c.in_s+MIN_CLIP_SECONDS).toFixed(3))};
 });
}
