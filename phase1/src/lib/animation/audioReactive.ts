import type {Layer} from './model';
/** Audio-reactive keys: turns the loudness envelope of an audio clip into keyframes for another layer. Works on the stored peak envelope only (no decoding), pure and bounded. */
export const REACTIVE_PROPS=['scale','opacity','rotation'] as const;
export type ReactiveProp=typeof REACTIVE_PROPS[number];
export const REACTIVE_RANGE:Record<ReactiveProp,{min:number;max:number}>={scale:{min:0,max:1000},opacity:{min:0,max:100},rotation:{min:-3600,max:3600}};
export const MAX_REACTIVE_KEYS=600,MAX_SMOOTH=10;
export interface ReactiveOptions{min:number;max:number;/** 0 (follows every peak) to 10 (slow, calm). */smooth?:number;/** Composition range the keys may cover. */from:number;to:number;/** Wanted distance between keys in ticks; widened so the result never exceeds MAX_REACTIVE_KEYS. */stepTicks:number;snap:(t:number)=>number}
/**
 * Keys (composition ticks, value) following the clip's loudness: the loudest point of the clip maps to `max`, silence to `min`.
 * Covers the clip's span inside [from,to]. Returns [] when the clip is silent or outside the range.
 */
export function reactiveKeys(peaks:readonly number[],durationTicks:number,l:Layer,o:ReactiveOptions):{t:number;v:number}[]{
 const a=l.audio;if(!a||!peaks.length||!(durationTicks>0))return [];
 const start=l.inT+l.offset,end=l.outT+l.offset,from=Math.max(start,o.from),to=Math.min(end,o.to);if(to<=from)return [];
 const rate=a.rate??1,src=(t:number)=>a.trimIn+(t-start)*rate;
 const step=Math.max(1,o.stepTicks,Math.ceil((to-from)/(MAX_REACTIVE_KEYS-1)));
 const ts:number[]=[];for(let t=from;t<to;t+=step){const s=o.snap(t);if(s>=from&&s<=to&&s!==ts[ts.length-1])ts.push(s);}
 const last=o.snap(to);if(last<=to&&last>(ts[ts.length-1]??-1))ts.push(last);
 if(ts.length<2)return [];
 const bins=peaks.length,raw=ts.map((t,i)=>{const s0=src(t),s1=src(ts[i+1]??t+step);const lo=Math.max(0,Math.min(bins-1,Math.floor(s0/durationTicks*bins))),hi=Math.max(lo,Math.min(bins-1,Math.ceil(s1/durationTicks*bins)));let m=0;for(let b=lo;b<=hi;b++)if(peaks[b]>m)m=peaks[b];return m/255;});
 const top=Math.max(...raw);if(!(top>0))return [];
 const sm=Math.min(MAX_SMOOTH,Math.max(0,o.smooth??0)),att=1/(1+sm*0.3),rel=1/(1+sm*1.5);
 let v=raw[0]/top;const out:{t:number;v:number}[]=[];
 raw.forEach((x,i)=>{const n=x/top;v=i===0?n:v+(n-v)*(n>v?att:rel);out.push({t:ts[i],v:Math.round((o.min+(o.max-o.min)*v)*100)/100});});
 return out;
}
