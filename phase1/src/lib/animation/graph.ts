import {evaluate} from './interpolate';
import type {Keyframe,PropValue,Property} from './model';
/** Pure geometry of the value graph. One channel at a time (0 = scalar or X, 1 = Y), values in the property's own units. */
export const channelOf=(v:PropValue,ch:0|1):number=>typeof v==='number'?v:v[ch];
export const EASE_Y_MIN=-2,EASE_Y_MAX=3;
export interface Handle{kind:'in'|'out';keyT:number;t:number;v:number;/** progress-space position stored on the key */x:number;y:number}
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
/**
 * Ease handles of key `i` for a channel. Out belongs to the segment i to i+1 (when key i is bezier), in belongs to the
 * segment i-1 to i (when key i-1 is bezier). Positions are in time and channel value.
 */
export function handlesOf(keys:readonly Keyframe[],i:number,ch:0|1):Handle[]{
 const k=keys[i],out:Handle[]=[];
 const next=keys[i+1],prev=keys[i-1];
 if(next&&k.interp==='bezier')out.push({kind:'out',keyT:k.t,x:k.out[0],y:k.out[1],t:k.t+k.out[0]*(next.t-k.t),v:channelOf(k.v,ch)+k.out[1]*(channelOf(next.v,ch)-channelOf(k.v,ch))});
 if(prev&&prev.interp==='bezier')out.push({kind:'in',keyT:k.t,x:k.in[0],y:k.in[1],t:prev.t+k.in[0]*(k.t-prev.t),v:channelOf(prev.v,ch)+k.in[1]*(channelOf(k.v,ch)-channelOf(prev.v,ch))});
 return out;
}
/** Inverse of handlesOf: the ease pair a handle dragged to (t, v) stands for. x stays in 0..1, y in -2..3. Flat segments keep their old y. */
export function handleToEase(keys:readonly Keyframe[],i:number,kind:'in'|'out',t:number,v:number,ch:0|1):readonly [number,number]{
 const k=keys[i];
 const a=kind==='out'?k:keys[i-1],b=kind==='out'?keys[i+1]:k;
 const cur=kind==='out'?k.out:k.in;
 if(!a||!b||b.t<=a.t)return cur;
 const x=clamp((t-a.t)/(b.t-a.t),0,1);
 const dv=channelOf(b.v,ch)-channelOf(a.v,ch);
 const y=Math.abs(dv)<1e-9?cur[1]:clamp((v-channelOf(a.v,ch))/dv,EASE_Y_MIN,EASE_Y_MAX);
 return [x,y];
}
/** Vertical extent of a channel with padding, always non-degenerate. Includes handles so none sit off screen. */
export function valueRange(keys:readonly Keyframe[],ch:0|1):{min:number;max:number}{
 let min=Infinity,max=-Infinity;
 keys.forEach((k,i)=>{const v=channelOf(k.v,ch);min=Math.min(min,v);max=Math.max(max,v);for(const h of handlesOf(keys,i,ch)){min=Math.min(min,h.v);max=Math.max(max,h.v);}});
 if(!Number.isFinite(min))return {min:0,max:1};
 const span=max-min||Math.max(1,Math.abs(max)*0.2);const pad=span*0.12;
 return {min:min-pad,max:max+pad};
}
/** Polyline samples of the evaluated channel from t0 to t1 (inclusive), `n` steps. */
export function curveSamples(p:Property,ch:0|1,t0:number,t1:number,n:number):{t:number;v:number}[]{
 const out:{t:number;v:number}[]=[];const steps=Math.max(1,n);
 for(let s=0;s<=steps;s++){const t=Math.round(t0+(t1-t0)*s/steps);out.push({t,v:channelOf(evaluate(p,t),ch)});}
 return out;
}
/** "Nice" grid step for a value axis. */
export function niceStep(range:number,maxLines:number):number{
 const raw=range/Math.max(1,maxLines);const pow=10**Math.floor(Math.log10(raw||1));const f=raw/pow;
 return (f<=1?1:f<=2?2:f<=5?5:10)*pow;
}
/** Ease presets as CSS cubic-bezier pairs. Out belongs to the key, in to the next key. */
export const EASE_PRESETS={
 linear:{interp:'linear' as const},
 hold:{interp:'hold' as const},
 ease:{interp:'bezier' as const,out:[0.33,0] as const,in:[0.67,1] as const},
 easeIn:{interp:'bezier' as const,out:[0.42,0] as const,in:[1,1] as const},
 easeOut:{interp:'bezier' as const,out:[0,0] as const,in:[0.58,1] as const},
};
export type EasePreset=keyof typeof EASE_PRESETS;
