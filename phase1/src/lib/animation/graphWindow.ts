import type {Keyframe} from './model';
import {frameToTick} from './time';
import type {Rational} from './time';
export const FIT_PAD=0.08;
/** The time span the graph shows. `fit` frames the keys with 8% padding on each side (at least one frame wide), clamped to the composition; otherwise the whole composition. */
export function graphWindow(start:number,duration:number,fps:Rational,keys:readonly Keyframe[],fit:boolean):{t0:number;t1:number}{
 const end=start+duration;
 if(!fit||keys.length<2)return {t0:start,t1:end};
 const lo=Math.min(...keys.map(k=>k.t)),hi=Math.max(...keys.map(k=>k.t)),pad=Math.max((hi-lo)*FIT_PAD,frameToTick(1,fps));
 const t0=Math.max(start,lo-pad),t1=Math.min(end,hi+pad);
 return t1>t0?{t0,t1}:{t0:start,t1:end};
}
/** Keys the fit frames: the selected keys of the property when two or more are selected, otherwise all of them. */
export function fitTargets(keys:readonly Keyframe[],selected:readonly {t:number}[]):readonly Keyframe[]{
 const ts=new Set(selected.map(s=>s.t)),picked=keys.filter(k=>ts.has(k.t));
 return picked.length>=2?picked:keys;
}
