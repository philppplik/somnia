/** Geometry of the clip timeline. Pure, so dragging maths runs under tsx --test. */
import {snapKeyTime,MAX_CLIP_SECONDS} from './clips';
export const SNAP_STEP=0.01;
/** Time for a pointer x position inside a lane. The result is clamped to the clip and snapped to 10 ms. */
export function timeFromX(x:number,left:number,width:number,duration:number):number{
 if(!Number.isFinite(x)||!Number.isFinite(left)||!(width>0)||!(duration>0))return 0;
 const u=Math.min(1,Math.max(0,(x-left)/width));return snapKeyTime(Math.round(u*duration/SNAP_STEP)*SNAP_STEP);
}
/** Position of a time in percent of the lane. Times beyond the clip are clamped to the edges. */
export const percentOf=(time:number,duration:number):number=>duration>0?Math.min(100,Math.max(0,time/duration*100)):0;
/** Time after pressing an arrow key on a key: 50 ms, or 500 ms with Shift. Stays within 0 and the clip length (or the hard limit when extend). */
export function nudgeTime(time:number,dir:-1|1,big:boolean,duration:number,extend=false):number{
 const t=snapKeyTime(time+dir*(big?0.5:0.05));return Math.min(extend?MAX_CLIP_SECONDS:duration,Math.max(0,t));
}
/** A window into the clip shown by the timeline: start time and visible span in seconds. */
export interface TimeView{start:number;span:number}
export const MIN_VIEW_SPAN=0.1;
/** The whole clip in view. */
export const fitView=(duration:number):TimeView=>({start:0,span:Math.max(MIN_VIEW_SPAN,duration)});
/** Keeps the view inside the clip: span between MIN_VIEW_SPAN and the clip length, start so the window stays within the clip. */
export function clampView(v:TimeView,duration:number):TimeView{
 const limit=Math.max(MIN_VIEW_SPAN,duration);
 const span=Math.min(limit,Math.max(MIN_VIEW_SPAN,Number.isFinite(v?.span)?v.span:limit));
 const start=Math.min(Math.max(0,Number.isFinite(v?.start)?v.start:0),Math.max(0,limit-span));
 return{start,span};
}
/** Zooms by factor around an anchor time (factor above 1 zooms in). The anchor stays at its position in the window. */
export function zoomView(v:TimeView,duration:number,factor:number,anchor?:number):TimeView{
 const c=clampView(v,duration);const f=Math.min(20,Math.max(0.05,Number.isFinite(factor)?factor:1));
 const a=anchor===undefined||!Number.isFinite(anchor)?c.start+c.span/2:Math.min(Math.max(anchor,c.start),c.start+c.span);
 const span=Math.min(Math.max(MIN_VIEW_SPAN,duration),Math.max(MIN_VIEW_SPAN,c.span/f));
 const start=Math.min(Math.max(0,a-(a-c.start)*(span/c.span)),Math.max(0,Math.max(MIN_VIEW_SPAN,duration)-span));
 return{start,span};
}
/** Pans by dt seconds, clamped to the clip. */
export function panView(v:TimeView,duration:number,dt:number):TimeView{
 const c=clampView(v,duration);if(!Number.isFinite(dt))return c;
 const limit=Math.max(MIN_VIEW_SPAN,duration);const start=Math.min(Math.max(0,c.start+dt),Math.max(0,limit-c.span));
 return{start,span:c.span};
}
/** Time for a pointer x position inside a lane under a view window, snapped to 10 ms. Times outside the window clamp to its edges. */
export function timeInView(x:number,left:number,width:number,v:TimeView):number{
 if(!Number.isFinite(x)||!Number.isFinite(left)||!(width>0))return v.start;
 const u=Math.min(1,Math.max(0,(x-left)/width));return snapKeyTime(Math.round((v.start+u*v.span)/SNAP_STEP)*SNAP_STEP);
}
/** Position of a time in percent of the viewed window. Not clamped: times outside the window land outside 0 to 100 and the caller hides them. */
export const viewPercent=(time:number,v:TimeView):number=>v.span>0?(time-v.start)/v.span*100:0;
/** Evenly spaced ruler tick times inside the view. The step is a round number of milliseconds (1, 2 or 5 times a power of ten). */
export function viewTicks(v:TimeView,maxTicks=6):number[]{
 if(!(v.span>0)||maxTicks<1)return[];
 const raw=v.span/maxTicks;const p=10**Math.floor(Math.log10(raw));const m=raw/p;
 const step=(m>=5?5:m>=2?2:1)*p;const out:number[]=[];
 for(let t=Math.ceil(v.start/step-1e-9)*step+0;t<=v.start+v.span+1e-9;t+=step)out.push(snapKeyTime(t));
 return out;
}
