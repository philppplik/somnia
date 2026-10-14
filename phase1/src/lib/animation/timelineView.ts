import {useSyncExternalStore} from 'react';
import type {Composition} from './model';
/** Pure geometry of the timeline: zoom window, scrolling, fit, and snapping to markers, work-area edges and the playhead. View state only, never saved in the document. */
export const ZOOM_MIN=1,ZOOM_MAX=64;
export interface TimeWindow{zoom:number;scroll:number;/** First visible tick. */t0:number;/** Visible ticks. */span:number}
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
/** Visible window for a zoom factor and a scroll offset in ticks from the composition start. Always inside the composition, bad values fall back to the full view. */
export function timeWindow(comp:Composition,zoom:unknown,scroll:unknown):TimeWindow{
 const z=typeof zoom==='number'&&Number.isFinite(zoom)?clamp(zoom,ZOOM_MIN,ZOOM_MAX):1;
 const span=Math.max(1,comp.duration/z);const sc=typeof scroll==='number'&&Number.isFinite(scroll)?clamp(scroll,0,Math.max(0,comp.duration-span)):0;
 return {zoom:z,scroll:sc,t0:comp.start+sc,span};
}
/** New zoom and scroll after zooming by `factor` with `anchor` (a tick) staying under the same screen position. */
export function zoomAround(comp:Composition,w:TimeWindow,factor:number,anchor:number):{zoom:number;scroll:number}{
 const z=clamp(w.zoom*factor,ZOOM_MIN,ZOOM_MAX);const span=comp.duration/z;
 const frac=clamp((anchor-w.t0)/w.span,0,1);
 const next=timeWindow(comp,z,anchor-comp.start-frac*span);return {zoom:next.zoom,scroll:next.scroll};
}
/** Whole composition. */
export const fitAll=():{zoom:number;scroll:number}=>({zoom:1,scroll:0});
/** Zoom so that [a,b] fills the view with a little padding. */
export function fitRange(comp:Composition,a:number,b:number):{zoom:number;scroll:number}{
 const len=Math.max(1,b-a),pad=len*0.05;const z=clamp(comp.duration/(len+2*pad),ZOOM_MIN,ZOOM_MAX);
 const w=timeWindow(comp,z,a-pad-comp.start);return {zoom:w.zoom,scroll:w.scroll};
}
/** Scroll that keeps `tick` visible, with a margin; unchanged when it already is. */
export function revealTick(comp:Composition,w:TimeWindow,tick:number):number{
 const m=w.span*0.05;if(tick<w.t0+m)return timeWindow(comp,w.zoom,tick-m-comp.start).scroll;
 if(tick>w.t0+w.span-m)return timeWindow(comp,w.zoom,tick+m-comp.start-w.span).scroll;return w.scroll;
}
/** Scroll step while a drag is held near the edge of the track: `frac` is the pointer position across the track (below 0 or above 1 when outside). */
export function edgeScroll(comp:Composition,w:TimeWindow,frac:number):number{
 if(w.zoom<=1)return w.scroll;const band=0.06;
 const dir=frac<band?-(band-frac)/band:frac>1-band?(frac-(1-band))/band:0;if(!dir)return w.scroll;
 return timeWindow(comp,w.zoom,w.scroll+clamp(dir,-3,3)*w.span*0.02).scroll;
}
/** Ticks that drags and scrubbing may snap to: markers, work-area edges, the playhead and the composition ends. */
export function snapTargets(comp:Composition,playhead:number,exclude:readonly number[]=[]):number[]{
 const out=[comp.start,comp.start+comp.duration,comp.workArea.in,comp.workArea.out,playhead,...(comp.markers??[]).map(m=>m.t)];
 return [...new Set(out)].filter(t=>!exclude.includes(t)).sort((a,b)=>a-b);
}
/** Nearest target within `px` pixels, else the tick unchanged. */
export function snapTick(tick:number,targets:readonly number[],ticksPerPx:number,px=6):number{
 let best=tick,d=px*ticksPerPx;for(const t of targets){const x=Math.abs(t-tick);if(x<=d){d=x;best=t;}}return best;
}
let snapOn=true;const ls=new Set<()=>void>();
export const timelineSnap=()=>snapOn;
export const setTimelineSnap=(on:boolean)=>{snapOn=on;ls.forEach(f=>f());};
export const useTimelineSnap=()=>useSyncExternalStore(f=>{ls.add(f);return()=>{ls.delete(f);};},()=>snapOn,()=>snapOn);
let shyOff=false;const sl=new Set<()=>void>();
/** Hide shy layers from the timeline list (view state only; rendering and export ignore it). */
export const shyHidden=()=>shyOff;
export const setShyHidden=(on:boolean)=>{shyOff=on;sl.forEach(f=>f());};
export const useShyHidden=()=>useSyncExternalStore(f=>{sl.add(f);return()=>{sl.delete(f);};},()=>shyOff,()=>shyOff);
/**
 * Index for `layer.reorder` when `dragged` is dropped on the row of `over`, above it or below it. `order` is the full layer order.
 * The edit's index counts after the dragged layer is removed. Returns null when nothing would change.
 */
export function reorderIndex(order:readonly string[],dragged:string,over:string,after:boolean):number|null{
 const from=order.indexOf(dragged),at=order.indexOf(over);if(from<0||at<0||dragged===over)return null;
 const target=after?at+1:at;const idx=target>from?target-1:target;return idx===from?null:idx;
}

/** Track height of one layer in the timeline: compact hides the property lanes, tall gives the bar more room. Absent means normal. View state only. */
export type TrackHeight='compact'|'normal'|'tall';
export const nextTrackHeight=(h:TrackHeight):TrackHeight=>h==='normal'?'tall':h==='tall'?'compact':'normal';
const MAX_TRACK_ENTRIES=500;
let heights:Readonly<Record<string,TrackHeight>>={};const hl=new Set<()=>void>();
const hset=(next:Record<string,TrackHeight>)=>{heights=next;hl.forEach(f=>f());};
export const trackHeights=()=>heights;
export const trackHeightOf=(id:string):TrackHeight=>heights[id]??'normal';
export function setTrackHeight(id:string,h:TrackHeight){const next={...heights};if(h==='normal')delete next[id];else next[id]=h;if(Object.keys(next).length<=MAX_TRACK_ENTRIES)hset(next);}
/** Collapse every listed layer to a compact track, or restore all tracks to normal. */
export function setAllTracks(ids:readonly string[],mode:'collapse'|'expand'){hset(mode==='expand'?{}:Object.fromEntries(ids.slice(0,MAX_TRACK_ENTRIES).map(i=>[i,'compact' as TrackHeight])));}
export const useTrackHeights=()=>useSyncExternalStore(f=>{hl.add(f);return()=>{hl.delete(f);};},()=>heights,()=>heights);
