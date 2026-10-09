/** Output choices of a video project. The edit itself lives in the timeline clips (timeline.ts). */
export type VideoFormat='webm'|'mp4';
export const DEFAULT_FORMAT:VideoFormat='webm';
/** Names the rendered download. A neutral timeline copies; any edit (multi-clip, trim, gain, mute) marks the name. */
export function exportName(name:string,edited:boolean,format:VideoFormat):string{
 const base=name.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
 return `${base}${edited?'-edited':'-copy'}.${format}`;
}
/** Whole-clock formatting for the transport (m:ss.d), matching the Sound Studio. */
export const formatTime=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`;
