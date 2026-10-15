/** The multi-clip timeline: an ordered, gap-free edit list over any opened video sources. Pure model - no DOM, no engine. */
import {clampTitleSeconds,isTitleClip,splitTitleClip} from './titles';
import {sanitizeKeys,upsertKey,valueAt,lerpNumber,type Key} from './keyframes';

/**
 * One clip: a source-time range of a media item, with per-clip audio treatment. `in_s`/`out_s` are source seconds.
 * `crossfade_s` overlaps this clip's tail with the next clip's head (0 or absent = hard cut; always 0 on the last clip).
 * Title clips (`kind:'title'`) carry no source: `in_s` stays 0 and `out_s` is the card duration.
 * Image clips (`kind:'image'`) reference a photo file: `in_s` stays 0, `out_s` is how long the still shows.
 */
export interface TimelineClip{id:string;source:string;in_s:number;out_s:number;gain:number;muted:boolean;crossfade_s?:number;/** Freeze frame: source time (seconds) of the single held frame. Set = the clip is a freeze; it takes the still shape (in_s 0, out_s = display duration), has no audio and no speed. Absent = normal playback. */freeze?:number;/** Audio fade-in of a media clip, in timeline seconds. Absent/0 = none; titles and images carry no audio fades. */fadeIn?:number;/** Audio fade-out of a media clip, in timeline seconds. Absent/0 = none. */fadeOut?:number;/** Mirroring of the clip's picture (media and image clips). Absent = not flipped. */flip?:ClipFlip;/** Rotation of the clip's picture in degrees clockwise (media and image clips). Absent/0 = not rotated. */rotation?:ClipRotation;/** Crop of the clip's fitted frame: fractions cut from each edge, then the remaining region is contain-fitted back into the frame (media and image clips). Absent/all-zero = full picture. */crop?:ClipCrop;/** Playback speed of a media clip (timeline seconds = source seconds / speed). Absent = 1; title cards have no speed. */speed?:number;/** Transition style of this clip's crossfade into the next clip (only visible while `crossfade_s` > 0). Absent = dissolve. */transition?:ClipTransition;/** Reversed playback (media clips only): the export renders the source range backwards. The preview steps frames backwards and no audio is exported. Absent = normal. */reversed?:boolean;/** Animated crop (image clips only, e.g. Ken Burns): keys in clip-local seconds. Absent = static crop. */cropKeys?:Key<ClipCrop>[];/** Animated gain 0..MAX_GAIN (media clips only): volume ramps in clip-local seconds, composed with the audio fades. Absent = static gain. */gainKeys?:Key<number>[];kind?:'media'|'title'|'image';title?:import('./titles').TitleSpec}
/** The shortest clip worth keeping; below it splits and trims only produce broken files. */
export const MIN_CLIP_SECONDS=0.05;
export const MAX_GAIN=2;
export const MIN_SPEED=0.25,MAX_SPEED=4;
/** Default on-screen time of an image clip. */
export const IMAGE_DEFAULT_SECONDS=5;
/** Image clips are stills with a duration, not seekable media. */
export const isImageClip=(c:TimelineClip)=>c.kind==='image';
/** A media clip played backwards on export. Title cards, images and freeze frames never reverse. */
export const isReversed=(c:TimelineClip)=>c.reversed===true&&!isTitleClip(c)&&!isImageClip(c)&&!isFreeze(c);
/** A media clip frozen on one source frame (freeze = that frame's source time). */
export const isFreeze=(c:TimelineClip)=>typeof c.freeze==='number'&&Number.isFinite(c.freeze)&&!isTitleClip(c)&&!isImageClip(c);
/** Mirroring of a media or image clip: horizontal, vertical, or both. Dimension-preserving; quarter turns live in `rotation` instead. */
export type ClipFlip='none'|'h'|'v'|'hv';
export const CLIP_FLIPS:readonly ClipFlip[]=['none','h','v','hv'];
export const flipOf=(c:TimelineClip):ClipFlip=>CLIP_FLIPS.includes(c.flip as ClipFlip)?(c.flip as ClipFlip):'none';
/** Quarter-turn rotation of a media or image clip's picture, degrees clockwise. 90/270 swap width and height; title cards never rotate. */
export type ClipRotation=0|90|180|270;
export const CLIP_ROTATIONS:readonly ClipRotation[]=[0,90,180,270];
export const rotationOf=(c:TimelineClip):ClipRotation=>CLIP_ROTATIONS.includes(c.rotation as ClipRotation)?(c.rotation as ClipRotation):0;
/** Transition style of a crossfade zone: dissolve (alpha blend), wipe (the incoming clip is revealed from one edge) or slide (the incoming clip moves in from one edge). The direction names the edge where the new picture first appears. */
export type ClipTransition='dissolve'|'wipe-l'|'wipe-r'|'wipe-t'|'wipe-b'|'slide-l'|'slide-r'|'slide-t'|'slide-b';
export const CLIP_TRANSITIONS:readonly ClipTransition[]=['dissolve','wipe-l','wipe-r','wipe-t','wipe-b','slide-l','slide-r','slide-t','slide-b'];
export const transitionOf=(c:TimelineClip):ClipTransition=>CLIP_TRANSITIONS.includes(c.transition as ClipTransition)?(c.transition as ClipTransition):'dissolve';
/** Geometry of a transition at progress p (0-1) on a w x h frame: dissolve = alpha only; wipe = reveal rect of the incoming clip; slide = its pixel offset. Pure - shared by export and preview. */
export interface TransitionVisual{kind:'dissolve'|'wipe'|'slide';dx:number;dy:number;rect:{x:number;y:number;w:number;h:number}|null}
export function transitionVisual(tr:ClipTransition,p:number,w:number,h:number):TransitionVisual{
 const q=Math.min(1,Math.max(0,p));
 switch(tr){
  case'wipe-l':return{kind:'wipe',dx:0,dy:0,rect:{x:0,y:0,w:q*w,h}};
  case'wipe-r':return{kind:'wipe',dx:0,dy:0,rect:{x:(1-q)*w,y:0,w:q*w,h}};
  case'wipe-t':return{kind:'wipe',dx:0,dy:0,rect:{x:0,y:0,w,h:q*h}};
  case'wipe-b':return{kind:'wipe',dx:0,dy:0,rect:{x:0,y:(1-q)*h,w,h:q*h}};
  case'slide-l':return{kind:'slide',dx:-(1-q)*w,dy:0,rect:null};
  case'slide-r':return{kind:'slide',dx:(1-q)*w,dy:0,rect:null};
  case'slide-t':return{kind:'slide',dx:0,dy:-(1-q)*h,rect:null};
  case'slide-b':return{kind:'slide',dx:0,dy:(1-q)*h,rect:null};
  default:return{kind:'dissolve',dx:0,dy:0,rect:null};
 }
}
/** Edge fractions cut from a clip's frame; an axis pair may remove at most 90% together. */
export interface ClipCrop{left:number;top:number;right:number;bottom:number}
const cropEdge=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.min(0.9,Math.max(0,v)):0;
/** Normalized crop of a clip: every edge in [0,0.9], axis pairs capped at 0.9 combined. */
export const cropOf=(c:TimelineClip):ClipCrop=>{
 const o=c.crop;
 let left=cropEdge(o?.left),top=cropEdge(o?.top),right=cropEdge(o?.right),bottom=cropEdge(o?.bottom);
 if(left+right>0.9){const k=0.9/(left+right);left*=k;right*=k;}
 if(top+bottom>0.9){const k=0.9/(top+bottom);top*=k;bottom*=k;}
 return{left:Number(left.toFixed(3)),top:Number(top.toFixed(3)),right:Number(right.toFixed(3)),bottom:Number(bottom.toFixed(3))};
};
/** True when the clip actually cuts anything. */
export const hasCrop=(c:TimelineClip)=>{const r=cropOf(c);return r.left>0||r.top>0||r.right>0||r.bottom>0;};
/** The gain at a clip-local time: animated when gain keys exist (media clips), else the static gain. */
export const gainAt=(c:TimelineClip,local:number)=>valueAt(c.gainKeys,local,lerpNumber,c.gain);
/** The crop at a clip-local time: animated when crop keys exist (image clips), else the static crop. */
export const cropAt=(c:TimelineClip,local:number)=>valueAt(c.cropKeys,local,(a,b,p)=>({left:lerpNumber(a.left,b.left,p),top:lerpNumber(a.top,b.top,p),right:lerpNumber(a.right,b.right,p),bottom:lerpNumber(a.bottom,b.bottom,p)}),cropOf(c));
/** A media clip's playback speed, clamped to the supported range. Title cards always play at 1. */
export const speedOf=(c:TimelineClip)=>c.kind==='title'||isFreeze(c)?1:Math.min(MAX_SPEED,Math.max(MIN_SPEED,typeof c.speed==='number'&&Number.isFinite(c.speed)?c.speed:1));
/** Source time shown at a local (clip-relative) timeline time: speed applies, reversed clips run from out_s back to in_s, freezes hold their frame. */
export const clipSourceTime=(c:TimelineClip,local:number)=>isFreeze(c)?c.freeze!:isReversed(c)?Math.max(c.in_s,c.out_s-1e-3-Math.max(0,local)*speedOf(c)):Math.min(c.out_s,c.in_s+Math.max(0,local)*speedOf(c));
/** Timeline seconds the clip occupies: its source range played at its speed. */
export const clipDuration=(c:TimelineClip)=>Math.max(0,(c.out_s-c.in_s)/speedOf(c));
/** The crossfade from this clip into the next one, in seconds. 0 means a hard cut. */
export const fadeOf=(c:TimelineClip)=>c.crossfade_s??0;
/** Audio fade-in of a clip in timeline seconds (0 for titles/images: they have no source audio). */
export const fadeInOf=(c:TimelineClip)=>isTitleClip(c)||isImageClip(c)||isFreeze(c)?0:Math.max(0,typeof c.fadeIn==='number'&&Number.isFinite(c.fadeIn)?c.fadeIn:0);
export const fadeOutOf=(c:TimelineClip)=>isTitleClip(c)||isImageClip(c)||isFreeze(c)?0:Math.max(0,typeof c.fadeOut==='number'&&Number.isFinite(c.fadeOut)?c.fadeOut:0);
/** Equal-power multiplier of a clip's own audio fades at timeline time t, the clip's range being [start,end). Independent of the crossfade weight. */
export function clipFadeGain(c:TimelineClip,start:number,end:number,t:number):number{
 const fI=fadeInOf(c),fO=fadeOutOf(c);if(fI<=0&&fO<=0)return 1;
 const local=t-start,dur=end-start;let e=1;
 if(fI>0&&local<fI)e*=Math.sin(Math.min(1,Math.max(0,local)/fI)*Math.PI/2);
 if(fO>0&&local>dur-fO)e*=Math.cos(Math.min(1,Math.max(0,local-(dur-fO))/fO)*Math.PI/2);
 return e;
}
/** A neutral timeline is one untrimmed full-length clip of its root source at unity gain - it exports the original. */
export const isNeutralTimeline=(clips:TimelineClip[],root:string,rootDuration:number)=>clips.length===1&&!isTitleClip(clips[0])&&clips[0].source===root&&clips[0].in_s===0&&Math.abs(clips[0].out_s-rootDuration)<0.01&&clips[0].gain===1&&!clips[0].muted&&speedOf(clips[0])===1&&fadeInOf(clips[0])===0&&fadeOutOf(clips[0])===0&&!isFreeze(clips[0])&&!isReversed(clips[0]);
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
 return{range:r,sourceTime:clipSourceTime(r.clip,time-r.start)};
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
 const entry=(r:ClipRange,video:number,audio:number):BlendEntry=>({range:r,sourceTime:clipSourceTime(r.clip,time-r.start),video,audio});
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
 // Unknown styles and the default dissolve are dropped so the stored clip stays minimal.
 const norm=(o:TimelineClip):TimelineClip=>{const tr=transitionOf(o);if(tr==='dissolve')delete o.transition;else o.transition=tr;return o;};
 const clean=clips.flatMap(c=>{
  // Clip shape only: the spec itself is sanitized where it is drawn, so a valid spec survives sanitation untouched.
  if(isTitleClip(c)){const o:TimelineClip={...c,kind:'title' as const,source:'',in_s:0,out_s:clampTitleSeconds(c.out_s),gain:1,muted:false};delete o.fadeIn;delete o.fadeOut;delete o.rotation;delete o.crop;delete o.reversed;delete o.cropKeys;delete o.gainKeys;return[norm(o)];}
  if(isImageClip(c)){const o:TimelineClip={...c,kind:'image' as const,in_s:0,out_s:clampTitleSeconds(c.out_s),gain:1,muted:false};delete o.fadeIn;delete o.fadeOut;delete o.reversed;delete o.gainKeys;if(rotationOf(o)===0)delete o.rotation;else o.rotation=rotationOf(o);if(hasCrop(o))o.crop=cropOf(o);else delete o.crop;const ck=sanitizeKeys(c.cropKeys,o.out_s,v=>v&&typeof v==='object'?cropOf({crop:v} as TimelineClip):null);if(ck&&ck.length>1)o.cropKeys=ck;else delete o.cropKeys;return[norm(o)];}
  if(isFreeze(c)){
   const d=durations[c.source];
   const fr=d===undefined?Math.max(0,c.freeze!):Math.min(Math.max(0,c.freeze!),Math.max(0,d-MIN_CLIP_SECONDS));
   const o:TimelineClip={...c,in_s:0,out_s:clampTitleSeconds(c.in_s===0?c.out_s:c.out_s-c.in_s),gain:Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1)),muted:!!c.muted,flip:flipOf(c)==='none'?undefined:flipOf(c),freeze:Number(fr.toFixed(3))};
   delete o.speed;delete o.fadeIn;delete o.fadeOut;delete o.reversed;delete o.cropKeys;delete o.gainKeys;if(rotationOf(o)===0)delete o.rotation;else o.rotation=rotationOf(o);if(hasCrop(o))o.crop=cropOf(o);else delete o.crop;
   return[norm(o)];
  }
  const d=durations[c.source];
  if(d===undefined)return[c];
  if(d<=0)return[];
  const in_s=Math.min(Math.max(0,c.in_s),d),out_s=Math.min(Math.max(in_s,c.out_s),d);
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  const dur=(out_s-in_s)/speedOf(c),fI=Math.min(fadeInOf(c),dur),fO=Math.min(fadeOutOf(c),Math.max(0,dur-fI));
  const o:TimelineClip={...c,in_s:Number(in_s.toFixed(3)),out_s:Number(out_s.toFixed(3)),gain:Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1)),muted:!!c.muted,speed:speedOf(c),flip:flipOf(c)==='none'?undefined:flipOf(c)};
  delete o.fadeIn;delete o.fadeOut;delete o.cropKeys;if(rotationOf(o)===0)delete o.rotation;else o.rotation=rotationOf(o);if(hasCrop(o))o.crop=cropOf(o);else delete o.crop;
  const gk=sanitizeKeys(c.gainKeys,dur,v=>typeof v==='number'&&Number.isFinite(v)?Math.min(MAX_GAIN,Math.max(0,v)):null);
  const m=norm({...o,...(fI>0?{fadeIn:Number(fI.toFixed(3))}:{}),...(fO>0?{fadeOut:Number(fO.toFixed(3))}:{})});
  if(m.reversed===true)m.reversed=true;else delete m.reversed;
  if(gk&&gk.length>1)m.gainKeys=gk;else delete m.gainKeys;
  return[m];
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
 if(isFreeze(c)){
  const halves=splitTitleClip(c as Parameters<typeof splitTitleClip>[0],Math.max(0,time-range.start));if(!halves)return null;
  const[l,r2]=halves;
  return[...clips.slice(0,range.index),{...l,crossfade_s:0},{...r2,crossfade_s:fadeOf(c)},...clips.slice(range.index+1)];
 }
 if(isTitleClip(c)||isImageClip(c)){
  const halves=splitTitleClip(c as Parameters<typeof splitTitleClip>[0],sourceTime-c.in_s);if(!halves)return null;
  const[l,r2]=halves;
  // Crop keys live on the clip-local clock: the left half ends with the cut's value, the right half re-bases to it.
  if(isImageClip(c)&&c.cropKeys?.length){
   const cut=Math.max(0,time-range.start),v=cropAt(c,cut);
   (l as TimelineClip).cropKeys=[...c.cropKeys.filter(k=>k.t<cut),{t:cut,v}];
   (r2 as TimelineClip).cropKeys=[{t:0,v},...c.cropKeys.map(k=>({...k,t:Number((k.t-cut).toFixed(3))})).filter(k=>k.t>0)];
  }
  return[...clips.slice(0,range.index),{...l,crossfade_s:0},{...r2,crossfade_s:fadeOf(c)},...clips.slice(range.index+1)];
 }
 const left:TimelineClip={...c,id:newClipId(),out_s:Number(sourceTime.toFixed(3)),crossfade_s:0};
 const right:TimelineClip={...c,id:newClipId(),in_s:Number(sourceTime.toFixed(3))};
 // Gain keys live on the clip-local clock: the left part ends with the cut's value, the right re-bases to it.
 if(c.gainKeys?.length){
  const cut=Math.max(0,time-range.start),v=gainAt(c,cut);
  left.gainKeys=[...c.gainKeys.filter(k=>k.t<cut),{t:cut,v}];
  right.gainKeys=[{t:0,v},...c.gainKeys.map(k=>({...k,t:Number((k.t-cut).toFixed(3))})).filter(k=>k.t>0)];
 }
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
  if(c.id!==id||isTitleClip(c)||isImageClip(c))return c;
  if(isFreeze(c)){if(edge==='in')return c;return{...c,out_s:Number(Math.max(at,MIN_CLIP_SECONDS).toFixed(3))};}
  const in_s=edge==='in'?Math.min(at,c.out_s-MIN_CLIP_SECONDS):c.in_s;
  const out_s=edge==='out'?Math.max(at,c.in_s+MIN_CLIP_SECONDS):c.out_s;
  return{...c,in_s:Number(Math.max(0,in_s).toFixed(3)),out_s:Number(Math.max(out_s,c.in_s+MIN_CLIP_SECONDS).toFixed(3))};
 });
}
/** Sets a media clip's playback speed (0.25-4, clamped); title cards are left untouched. */
export function setClipSpeed(clips:TimelineClip[],id:string,speed:number):TimelineClip[]{
 return clips.map(c=>c.id===id&&c.kind!=='title'&&c.kind!=='image'&&!isFreeze(c)?{...c,speed:speedOf({...c,speed})}:c);
}
/** Cuts the timeline to [start,end) for a range export: edges become hard cuts (a cut crossfade dissolves into nothing), interior fades survive. Title and image clips shrink by the cut amount; media clips shift their source window. */
export function sliceTimeline(clips:TimelineClip[],start:number,end:number):TimelineClip[]{
 if(!(end>start))return[];
 const out:TimelineClip[]=[];
 for(const r of clipRanges(clips)){
  const s=Math.max(r.start,start),e=Math.min(r.end,end);
  if(e-s<MIN_CLIP_SECONDS)continue;
  const c=r.clip,sp=speedOf(c);
  const isStill=isTitleClip(c)||isImageClip(c)||isFreeze(c);
  const cutTail=r.end-e>1e-9;
  out.push({...c,id:newClipId(),
   in_s:isStill?0:Number((c.in_s+(s-r.start)*sp).toFixed(3)),
   out_s:isStill?Number((e-s).toFixed(3)):Number((c.out_s-(r.end-e)*sp).toFixed(3)),
   crossfade_s:cutTail?0:c.crossfade_s});
 }
 return out;
}
/** Sets the crossfade from one clip into the next, clamped to both clip lengths; the last clip takes none. */
export function setCrossfade(clips:TimelineClip[],id:string,seconds:number):TimelineClip[]{
 const i=clips.findIndex(c=>c.id===id);if(i<0)return clips;
 const max=i+1<clips.length?Math.min(clipDuration(clips[i]),clipDuration(clips[i+1])):0;
 const fade=Number(Math.min(Math.max(0,Number.isFinite(seconds)?seconds:0),max).toFixed(3));
 return clips.map((c,j)=>j===i?{...c,crossfade_s:fade}:c);
}
/** Sets or replaces a crop key at clip-local time t on an image clip (the first key seeds t=0 with the current static crop). */
export const setCropKey=(clips:TimelineClip[],id:string,t:number,crop:ClipCrop)=>clips.map(c=>c.id===id?{...c,cropKeys:upsertKey(c.cropKeys,{t:0,v:cropOf(c)},t,crop)}:c);
/** Clears the gain keys of a clip. */
export const clearGainKeys=(clips:TimelineClip[],id:string)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};delete o.gainKeys;return o;});
/** Replaces the whole crop key list of an image clip (undefined clears). */
export const setCropKeys=(clips:TimelineClip[],id:string,keys:Key<ClipCrop>[]|undefined)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};if(keys?.length)o.cropKeys=keys;else delete o.cropKeys;return o;});
/** One-click Ken Burns: a smooth drift from the full frame into a centered 76% window over the clip's duration. */
export const kenBurnsPreset=(duration:number):Key<ClipCrop>[]=>[{t:0,v:{left:0,top:0,right:0,bottom:0},e:'smooth'},{t:Number(Math.max(0.1,duration).toFixed(3)),v:{left:0.12,top:0.12,right:0.12,bottom:0.12}}];
/** Clears the crop animation of an image clip back to its static crop. */
export const clearCropKeys=(clips:TimelineClip[],id:string)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};delete o.cropKeys;return o;});
/** Sets or replaces a gain key at clip-local time t on a media clip (the first key seeds t=0 with the current static gain). */
export const setGainKey=(clips:TimelineClip[],id:string,t:number,gain:number)=>clips.map(c=>c.id===id?{...c,gainKeys:upsertKey(c.gainKeys,{t:0,v:c.gain},t,Math.min(MAX_GAIN,Math.max(0,gain)))}:c);
/** Replaces the whole gain key list of a media clip (undefined clears). */
export const setGainKeys=(clips:TimelineClip[],id:string,keys:Key<number>[]|undefined)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};if(keys?.length)o.gainKeys=keys;else delete o.gainKeys;return o;});
/** Marks a media clip for reversed playback on export; false clears the field. */
export const setReversed=(clips:TimelineClip[],id:string,on:boolean)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};if(on)o.reversed=true;else delete o.reversed;return o;});
/** Sets the transition style of a clip's crossfade into the next clip; 'dissolve' clears the field. */
export const setTransition=(clips:TimelineClip[],id:string,tr:ClipTransition)=>clips.map(c=>{if(c.id!==id)return c;const o={...c};if(tr==='dissolve')delete o.transition;else o.transition=tr;return o;});
/** Sets a clip's audio fades in timeline seconds; sanitize clamps them into the clip's length. */
export const setClipFades=(clips:TimelineClip[],id:string,fadeIn:number,fadeOut:number)=>clips.map(c=>c.id===id?{...c,fadeIn,fadeOut}:c);
