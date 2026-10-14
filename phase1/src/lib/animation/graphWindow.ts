import type {Keyframe,Property} from './model';
import {channelOf,curveSamples} from './graph';
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
/** Value range of the evaluated curve inside the visible time window, with the same 12% padding as the full-range fit. */
export function windowValueRange(p:Property,ch:0|1,t0:number,t1:number):{min:number;max:number}{
 const pts=curveSamples(p,ch,t0,t1,120).map(s=>s.v);
 for(const k of p.keys)if(k.t>=t0&&k.t<=t1)pts.push(channelOf(k.v,ch));
 const min=Math.min(...pts),max=Math.max(...pts);
 if(!Number.isFinite(min)||!Number.isFinite(max))return {min:0,max:1};
 const span=max-min||Math.max(1,Math.abs(max)*0.2),pad=span*0.12;
 return {min:min-pad,max:max+pad};
}
/** Frame steps tried for the time axis, smallest first. Whole seconds and half seconds follow the frame rate. */
export function timeTickStep(fps:Rational,spanTicks:number,maxTicks:number):number{
 const rate=fps.num/fps.den,frames=spanTicks*rate/240000,f=Math.max(1,Math.round(rate));
 const c=[...new Set([1,2,5,10,Math.round(f/2),f,2*f,5*f,10*f,30*f,60*f,300*f,600*f,1800*f,3600*f].filter(n=>n>=1))].sort((a,b)=>a-b);
 return c.find(n=>frames/n<=Math.max(1,maxTicks))??c[c.length-1];
}
/** Tick positions for the graph time axis: multiples of a readable frame step inside [t0,t1], at most `maxTicks` (hard cap 60). */
export function timeTicks(t0:number,t1:number,fps:Rational,maxTicks:number):number[]{
 if(!(t1>t0)||!(maxTicks>=1))return [];
 const step=timeTickStep(fps,t1-t0,Math.min(60,maxTicks)),stepTicks=frameToTick(step,fps);if(stepTicks<=0)return [];
 const out:number[]=[];for(let k=Math.ceil(t0/stepTicks);k*stepTicks<=t1&&out.length<=60;k++)out.push(k*stepTicks);
 return out;
}
/** Zoom factor per wheel notch and the narrowest span, in frames, the zoom may reach. */
export const ZOOM_STEP=1.25,ZOOM_MIN_FRAMES=2;
/** Window after zooming by `factor` (>1 zooms in) around time `anchor`, kept inside [start,end] and at least ZOOM_MIN_FRAMES wide. Null when the result shows the whole range. */
export function zoomWindow(win:{t0:number;t1:number},anchor:number,factor:number,start:number,end:number,fps:Rational):{t0:number;t1:number}|null{
 if(!(factor>0)||!(end>start)||!(win.t1>win.t0))return null;
 const full=end-start,minSpan=Math.min(full,frameToTick(ZOOM_MIN_FRAMES,fps));
 const span=Math.min(full,Math.max(minSpan,(win.t1-win.t0)/factor));
 if(span>=full)return null;
 const a=Math.min(win.t1,Math.max(win.t0,anchor)),u=(a-win.t0)/(win.t1-win.t0);
 let t0=a-u*span;t0=Math.min(end-span,Math.max(start,t0));
 return {t0:Math.round(t0),t1:Math.round(t0+span)};
}
/** Window moved by `dt` ticks, clamped to [start,end] with its span unchanged. */
export function panWindow(win:{t0:number;t1:number},dt:number,start:number,end:number):{t0:number;t1:number}{
 const span=win.t1-win.t0;const t0=Math.min(end-span,Math.max(start,win.t0+dt));
 return {t0:Math.round(t0),t1:Math.round(t0+span)};
}
/** Value range after zooming by `factor` (>1 zooms in) around value `anchor`. The anchor keeps its relative position; the span stays between 0.01 and 1e9. */
export function zoomRange(r:{min:number;max:number},anchor:number,factor:number):{min:number;max:number}|null{
 if(!(factor>0)||!(r.max>r.min)||!Number.isFinite(anchor))return null;
 const span=Math.min(1e9,Math.max(0.01,(r.max-r.min)/factor)),a=Math.min(r.max,Math.max(r.min,anchor)),u=(a-r.min)/(r.max-r.min);
 const min=a-u*span;return {min,max:min+span};
}
