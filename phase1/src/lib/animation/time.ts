/** Integer tick time for the Animation studio. Never accumulate floating-point seconds. */
export const TICKS_PER_SECOND=240000;
export interface Rational{num:number;den:number}
export const isPositiveInt=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>0;
export const validRate=(r:Rational)=>!!r&&isPositiveInt(r.num)&&isPositiveInt(r.den)&&r.num/r.den<=240;
/** Ticks of the start of frame `frame` (rounded to the nearest tick). */
export const frameToTick=(frame:number,fps:Rational)=>Math.round(frame*fps.den*TICKS_PER_SECOND/fps.num);
/** Frame index containing `tick` (floor, so a tick inside a frame maps to that frame). */
export const tickToFrame=(tick:number,fps:Rational)=>Math.floor((tick*fps.num)/(fps.den*TICKS_PER_SECOND)+1e-9);
export const snapToFrame=(tick:number,fps:Rational)=>frameToTick(Math.round(tick*fps.num/(fps.den*TICKS_PER_SECOND)),fps);
export const secondsToTicks=(s:number)=>Math.round(s*TICKS_PER_SECOND);
export const ticksToSeconds=(t:number)=>t/TICKS_PER_SECOND;
export const frameCount=(durationTicks:number,fps:Rational)=>Math.max(1,Math.round(durationTicks*fps.num/(fps.den*TICKS_PER_SECOND)));
/** Display label. Drop-frame would only change labels, never the real frame count; P0 shows non-drop timecode. */
export function timecode(tick:number,fps:Rational):string{
 const rate=Math.max(1,Math.round(fps.num/fps.den));const f=Math.max(0,tickToFrame(Math.max(0,tick),fps));
 const p=(n:number,w=2)=>String(n).padStart(w,'0');
 return `${p(Math.floor(f/(rate*3600)))}:${p(Math.floor(f/(rate*60))%60)}:${p(Math.floor(f/rate)%60)}:${p(f%rate)}`;
}
