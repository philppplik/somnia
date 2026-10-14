/** Targeted adjustment: drags on the photo itself, armed from the Curves or the Color mixer panel.
 * Pure helpers: which mixer band a hue belongs to, which curve point a tone grabs, how a vertical
 * drag maps to a value. The workspace owns the gestures; the panels own the arming toggles. */
import {HSL_BANDS,bandWeight,type HslBandId} from './hslMixer';
import type {CurvePoint} from './curves';

/** The band with the strongest window at this hue (always exactly one maximum, ties break toward the lower index). */
export function bandForHue(h:number):HslBandId{
 let best:HslBandId='red',w=-1;
 for(const b of HSL_BANDS){const v=bandWeight(b,h);if(v>w){w=v;best=b;}}
 return best;
}
/** A drag on the photo grabs an existing point within this normalized x distance, else it adds a new one. */
export const TARGET_GRAB_X=0.06;
/** Index of the nearest point within TARGET_GRAB_X of x, else -1. */
export function nearestCurvePoint(points:readonly CurvePoint[],x:number):number{
 let best=-1,d=TARGET_GRAB_X;
 points.forEach((p,i)=>{const v=Math.abs(p.x-x);if(v<d){d=v;best=i;}});
 return best;
}
/** Vertical drag distance (px) over the image box height (px) to a mixer slider delta (-100..100 domain: a full
 * image height of drag covers the whole slider range). Up is positive. */
export const targetSliderDelta=(dyPx:number,trackPx:number)=>trackPx>0?(-dyPx/trackPx)*200:0;
/** Same gesture for a curve point y (0..1 domain): a full image height of drag spans the whole box. */
export const targetCurveDelta=(dyPx:number,trackPx:number)=>trackPx>0?-dyPx/trackPx:0;
