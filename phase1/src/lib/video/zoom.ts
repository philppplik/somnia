/** Snapping and scroll math for the zoomable timeline. Pure - no DOM, no React. */
import {clipRanges,type TimelineClip} from './timeline';

/** Candidate times a dragged point snaps to: the timeline bounds and every clip edge, plus the caller's extras (playhead). */
export function snapPointsFor(clips:TimelineClip[],extra:number[]=[]):number[]{
 const ranges=clipRanges(clips);
 const end=ranges.length?ranges[ranges.length-1].end:0;
 return [0,end,...ranges.flatMap(r=>[r.start,r.end]),...extra];
}

/** Snaps `t` to the nearest point within `thresholdSeconds`; outside the threshold the time passes through unchanged. */
export function snapTime(t:number,points:number[],thresholdSeconds:number):number{
 let best=t,bestD=thresholdSeconds;
 for(const p of points){const d=Math.abs(p-t);if(d<bestD){bestD=d;best=p;}}
 return best;
}

/** Converts a pixel threshold into seconds at the current zoom (`trackWidthPx` is the rendered, already-zoomed track width). */
export const snapThresholdSeconds=(px:number,trackWidthPx:number,duration:number)=>trackWidthPx>0?px/trackWidthPx*duration:0;

export const ZOOM_MIN=1,ZOOM_MAX=20;
export const zoomInStep=(z:number)=>Math.min(ZOOM_MAX,Math.round(z*1.5*100)/100);
export const zoomOutStep=(z:number)=>Math.max(ZOOM_MIN,Math.round(z/1.5*100)/100);

/** The scroll offset that keeps `time` at `offsetX` pixels inside the viewport after the track grew to `trackWidthPx`. */
export function scrollLeftForTime(time:number,duration:number,trackWidthPx:number,offsetX:number):number{
 if(duration<=0)return 0;
 return Math.max(0,time/duration*trackWidthPx-offsetX);
}
