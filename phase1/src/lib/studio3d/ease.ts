/** Easing between two keys. glTF only knows linear, step and spline per track, so eased segments are baked into extra samples when playing and exporting. Pure, no three.js. */
import {KEY_STRIDE,type KeyPath} from './clips';
export const EASES=['linear','step','easeIn','easeOut','easeInOut'] as const;
export type Ease=typeof EASES[number];
export const isEase=(v:unknown):v is Ease=>typeof v==='string'&&(EASES as readonly string[]).includes(v);
/** Samples added inside one eased segment. */
export const BAKE_STEPS=8;
const FNS:Record<Exclude<Ease,'step'>,(u:number)=>number>={linear:u=>u,easeIn:u=>u*u*u,easeOut:u=>1-(1-u)**3,easeInOut:u=>u<0.5?4*u*u*u:1-(-2*u+2)**3/2};
/** Eased progress for u from 0 to 1. A step holds the start value until the end. */
export const easeAt=(ease:Ease,u:number):number=>{const x=Math.min(1,Math.max(0,u));return ease==='step'?(x<1?0:1):FNS[ease](x);};
/** Spherical interpolation of two unit quaternions, taking the short way round. */
export function slerp(a:ArrayLike<number>,b:ArrayLike<number>,u:number):number[]{
 let [bx,by,bz,bw]=[b[0],b[1],b[2],b[3]];let dot=a[0]*bx+a[1]*by+a[2]*bz+a[3]*bw;
 if(dot<0){dot=-dot;bx=-bx;by=-by;bz=-bz;bw=-bw;}
 let s0:number,s1:number;
 if(dot>0.9995){s0=1-u;s1=u;}else{const th=Math.acos(dot),sin=Math.sin(th);s0=Math.sin((1-u)*th)/sin;s1=Math.sin(u*th)/sin;}
 const out=[s0*a[0]+s1*bx,s0*a[1]+s1*by,s0*a[2]+s1*bz,s0*a[3]+s1*bw];const n=Math.hypot(...out)||1;return out.map(v=>v/n);
}
const lerp=(a:ArrayLike<number>,b:ArrayLike<number>,u:number):number[]=>Array.from(a,(v,i)=>v+(b[i]-v)*u);
/** Expands eased segments of a plain track into extra samples. A segment starting at key i uses eases[i]. The authoring keys stay in the result at their own times. */
export function bakeTrack(times:ArrayLike<number>,values:ArrayLike<number>,path:KeyPath,eases:readonly Ease[]|undefined):{times:number[];values:number[]}{
 const s=KEY_STRIDE[path];const ts:number[]=[],vs:number[]=[];const at=(i:number)=>Array.from(values).slice(i*s,i*s+s);
 for(let i=0;i<times.length;i++){
  ts.push(times[i]);vs.push(...at(i));
  const e=eases?.[i]??'linear';if(e==='linear'||i===times.length-1)continue;
  const t0=times[i],t1=times[i+1],a=at(i),b=at(i+1);
  if(e==='step'){const t=t1-0.001;if(t>t0){ts.push(t);vs.push(...a);}continue;}
  for(let k=1;k<BAKE_STEPS;k++){const u=k/BAKE_STEPS;ts.push(t0+(t1-t0)*u);vs.push(...(path==='rotation'?slerp(a,b,easeAt(e,u)):lerp(a,b,easeAt(e,u))));}
 }
 return{times:ts,values:vs};
}
