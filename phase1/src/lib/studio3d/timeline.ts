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
