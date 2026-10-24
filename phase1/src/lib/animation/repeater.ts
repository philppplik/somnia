import {evaluate} from './interpolate';
import {REPEATER_KEYS} from './keyTypes';
import {MAX_REPEATER_COPIES,validRepeater,type Layer} from './model';
export {MAX_REPEATER_COPIES,validRepeater};
/** Layer repeater: extra copies of a layer, each one step further along an offset, rotation, scale and opacity falloff. */
export type Repeater=NonNullable<Layer['repeater']>;
export const DEFAULT_REPEATER:Repeater={copies:5,x:40,y:0,rotation:0,scale:100,opacity:100};
const n=(v:number)=>String(Math.round(v*1e4)/1e4);
/** Copies 1..copies-1 in drawing order (last copy first, so the original ends up on top). `pivot` is the layer anchor in layer space. */
export function repeaterCopies(r:Repeater,pivot:readonly [number,number]):{transform:string;opacity:number;filter?:string}[]{
 const out:{transform:string;opacity:number;filter?:string}[]=[];
 for(let i=r.copies-1;i>=1;i--){
  const s=Math.pow(r.scale/100,i),o=Math.pow(r.opacity/100,i);
  out.push({transform:`translate(${n(r.x*i)} ${n(r.y*i)}) translate(${n(pivot[0])} ${n(pivot[1])}) rotate(${n(r.rotation*i)}) scale(${n(s)}) translate(${n(-pivot[0])} ${n(-pivot[1])})`,opacity:Math.round(o*1e4)/1e4,...(r.hue?{filter:`hue-rotate(${n(r.hue*i)}deg)`}:{})});
 }
 return out;
}

/** The repeater with every keyed value sampled at `tick` (static values elsewhere); the result carries no `anim`. */
export function repeaterAt(r:Repeater,tick:number):Repeater{
 if(!r.anim)return r;
 const {anim,...rest}=r,out:Record<string,number>={...rest} as unknown as Record<string,number>;
 for(const k of REPEATER_KEYS){const p=anim[k];if(p?.keys.length)out[k]=evaluate(p,tick) as number;}
 return out as unknown as Repeater;
}
