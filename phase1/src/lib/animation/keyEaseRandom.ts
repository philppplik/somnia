import type {KeyRef} from './model';
import type {Edit} from './edit';
import {EASE_PRESETS,type EasePreset} from './graph';
/** Random ease per selected key from the preset library, reproducible per seed (mulberry32). */
export const RANDOM_EASES:readonly EasePreset[]=['linear','ease','easeIn','easeOut','overshoot','anticipate','spring','smooth','snappy','back','expo'];
export const MAX_EASE_KEYS=800;
function rng(seed:number):()=>number{let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function one(k:KeyRef,name:EasePreset):Edit{
 const e:{interp:'linear'|'hold'|'bezier';out?:readonly [number,number];in?:readonly [number,number]}=EASE_PRESETS[name];
 if(e.out&&e.in)return {type:'keys.interp',keys:[k],interp:e.interp,out:e.out,in:e.in};
 return {type:'keys.interp',keys:[k],interp:e.interp};
}
export function randomEaseEdits(refs:readonly KeyRef[],seed=1):Edit[]{
 if(refs.length>MAX_EASE_KEYS)throw Object.assign(new Error(`At most ${MAX_EASE_KEYS} keys.`),{expected:true});
 const r=rng(seed),out:Edit[]=[];
 for(const k of refs)out.push(one(k,RANDOM_EASES[Math.floor(r()*RANDOM_EASES.length)]));
 return out;
}
