/** Output choices of a video project. The edit itself lives in the timeline clips (timeline.ts). */
export type VideoFormat='webm'|'mp4';
export const DEFAULT_FORMAT:VideoFormat='webm';
/** Encoder quality for exports: mediabunny's qualitative levels, capped at high (the previous fixed default). */
export type VideoExportQuality='high'|'medium'|'low';
/** Resolution scale and encoder quality of an export. Scale 1 keeps the timeline's native size. */
export interface VideoExportOptions{scale:number;quality:VideoExportQuality}
export const EXPORT_SCALES=[1,0.5,0.25] as const;
export const EXPORT_QUALITIES:readonly VideoExportQuality[]=['high','medium','low'];
export const DEFAULT_EXPORT_OPTIONS:VideoExportOptions={scale:1,quality:'high'};
/** Clamps partial/foreign export options to the supported set. */
export function sanitizeExportOptions(o:Partial<VideoExportOptions>|undefined):VideoExportOptions{
 return{scale:EXPORT_SCALES.includes(o?.scale as 1)?(o?.scale??1):1,quality:EXPORT_QUALITIES.includes(o?.quality as VideoExportQuality)?(o?.quality??'high'):'high'};
}
/** Names the rendered download. A neutral timeline copies; any edit (multi-clip, trim, gain, mute) marks the name. */
export function exportName(name:string,edited:boolean,format:VideoFormat):string{
 const base=name.replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
 return `${base}${edited?'-edited':'-copy'}.${format}`;
}
/** Whole-clock formatting for the transport (m:ss.d), matching the Sound Studio. */
export const formatTime=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`;
