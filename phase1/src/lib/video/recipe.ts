/** The non-destructive edit recipe of one clip. Preview narrows playback to the trim; export materializes it. */
export interface VideoTrim{start_s:number;end_s:number}
export type VideoFormat='webm'|'mp4';
export type VideoAudio='auto'|'mute';
export interface VideoRecipe{trim:VideoTrim|null;format:VideoFormat;audio:VideoAudio}
export const DEFAULT_RECIPE:VideoRecipe={trim:null,format:'webm',audio:'auto'};
/** The shortest range worth encoding; below it players and muxers only produce broken files. */
export const MIN_TRIM_SECONDS=0.05;
/** A neutral recipe plays and exports the original. Format and audio are output choices; mute is an edit. */
export const isNeutral=(r:VideoRecipe)=>r.trim===null&&r.audio==='auto';
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const finite=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?n:fallback;
/** Clamps the trim into the clip and drops unknown values instead of clamping them silently. */
export function sanitizeRecipe(r:VideoRecipe,duration:number):VideoRecipe{
 const format:VideoFormat=r.format==='mp4'?'mp4':'webm';
 const audio:VideoAudio=r.audio==='mute'?'mute':'auto';
 if(!r.trim)return{trim:null,format,audio};
 const d=Math.max(0,finite(duration,0));
 let start=clamp(finite(r.trim.start_s,0),0,d);
 let end=clamp(finite(r.trim.end_s,d),0,d);
 if(end-start<MIN_TRIM_SECONDS)end=Math.min(d,start+MIN_TRIM_SECONDS);
 if(end-start<MIN_TRIM_SECONDS)return{trim:null,format,audio};
 return{trim:{start_s:Number(start.toFixed(3)),end_s:Number(end.toFixed(3))},format,audio};
}
export function exportName(name:string,recipe:VideoRecipe):string{
 const base=name.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
 const suffix=isNeutral(recipe)?'-copy':recipe.trim?'-trimmed':'-edited';
 return `${base}${suffix}.${recipe.format}`;
}
/** Whole-clock formatting for the transport (m:ss.d), matching the Sound Studio. */
export const formatTime=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`;
