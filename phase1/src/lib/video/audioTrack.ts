/**
 * The audio track: freely placed clips (music, voiceover) mixed over the video edit list.
 * Unlike the gap-free video timeline, audio clips sit at an explicit `at` time, may leave gaps and may overlap
 * (overlaps sum in the mix - that is the voiceover-over-music case). Pure model - no DOM, no engine.
 */
import {MAX_GAIN,MIN_CLIP_SECONDS} from './timeline';

export interface AudioClip{
 id:string;
 /** Media file name; audio files and videos both work (a video contributes its audio track). */
 source:string;
 /** Source seconds. */
 in_s:number;out_s:number;
 /** Timeline position (start, seconds). Free placement, gaps allowed. */
 at:number;
 gain:number;
 /** Equal-power edge fades, seconds. */
 fadeIn:number;fadeOut:number;
}

export const audioClipDuration=(c:AudioClip)=>Math.max(0,c.out_s-c.in_s);
/** The timeline second where the audio track ends; 0 when empty. */
export const audioTrackEnd=(clips:AudioClip[])=>clips.reduce((end,c)=>Math.max(end,c.at+audioClipDuration(c)),0);

let nextId=1;
export const newAudioClipId=()=>`aclip-${nextId++}-${Math.random().toString(36).slice(2,7)}`;

export const fullAudioClip=(source:string,duration:number,at:number):AudioClip=>({id:newAudioClipId(),source,in_s:0,out_s:Math.max(MIN_CLIP_SECONDS,duration),at:Math.max(0,at),gain:1,fadeIn:0,fadeOut:0});

/** Clamps every clip into its source bounds (when known), rounds to milliseconds, drops degenerate ranges and caps the fades at the clip length. */
export function sanitizeAudioClips(clips:AudioClip[],durations:Record<string,number|undefined>):AudioClip[]{
 return clips.flatMap(c=>{
  const d=durations[c.source];
  if(d!==undefined&&d<=0)return[];
  const in_s=Math.max(0,c.in_s);
  let out_s=Math.max(in_s,c.out_s);
  if(d!==undefined){if(in_s>=d)return[];out_s=Math.min(out_s,d);}
  if(out_s-in_s<MIN_CLIP_SECONDS)return[];
  const dur=out_s-in_s;
  const gain=Math.min(MAX_GAIN,Math.max(0,typeof c.gain==='number'&&Number.isFinite(c.gain)?c.gain:1));
  const fadeIn=Math.min(Math.max(0,Number.isFinite(c.fadeIn)?c.fadeIn:0),dur);
  const fadeOut=Math.min(Math.max(0,Number.isFinite(c.fadeOut)?c.fadeOut:0),Math.max(0,dur-fadeIn));
  return[{...c,in_s:Number(in_s.toFixed(3)),out_s:Number(out_s.toFixed(3)),at:Number(Math.max(0,Number.isFinite(c.at)?c.at:0).toFixed(3)),gain,fadeIn:Number(fadeIn.toFixed(3)),fadeOut:Number(fadeOut.toFixed(3))}];
 });
}

/** The equal-power envelope gain at local time `t` (0 = clip start). */
export function audioEnvelope(c:AudioClip,t:number):number{
 const dur=audioClipDuration(c);
 let e=1;
 if(c.fadeIn>0&&t<c.fadeIn)e*=Math.sin(Math.min(1,t/c.fadeIn)*Math.PI/2);
 if(c.fadeOut>0&&t>dur-c.fadeOut)e*=Math.cos(Math.min(1,(t-(dur-c.fadeOut))/c.fadeOut)*Math.PI/2);
 return e*c.gain;
}

export const removeAudioClip=(clips:AudioClip[],id:string)=>clips.filter(c=>c.id!==id);
/** Repositions a clip on the timeline (clamped at 0). */
export const moveAudioClip=(clips:AudioClip[],id:string,at:number)=>clips.map(c=>c.id===id?{...c,at:Math.max(0,at)}:c);
/** Moves one clip edge to a source time, keeping the clip inside its bounds and above the minimum length. */
export function setAudioClipEdge(clips:AudioClip[],id:string,edge:'in'|'out',at:number):AudioClip[]{
 return clips.map(c=>{
  if(c.id!==id)return c;
  const in_s=edge==='in'?Math.min(at,c.out_s-MIN_CLIP_SECONDS):c.in_s;
  const out_s=edge==='out'?Math.max(at,c.in_s+MIN_CLIP_SECONDS):c.out_s;
  return{...c,in_s:Number(Math.max(0,in_s).toFixed(3)),out_s:Number(Math.max(out_s,c.in_s+MIN_CLIP_SECONDS).toFixed(3))};
 });
}
export const setAudioClipGain=(clips:AudioClip[],id:string,gain:number)=>clips.map(c=>c.id===id?{...c,gain}:c);
export const setAudioClipFades=(clips:AudioClip[],id:string,fadeIn:number,fadeOut:number)=>clips.map(c=>c.id===id?{...c,fadeIn,fadeOut}:c);
