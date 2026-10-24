import type {Composition,KeyRef} from './model';
import {frameToTick} from './time';
/** Work area spanning the selected keys. A single key (or keys at one time) gets a one frame area. Clamped to the composition. Null when no key is left. */
export function workAreaForKeys(c:Composition,keys:readonly KeyRef[]):{in:number;out:number}|null{
 if(!keys.length)return null;
 const lo=Math.max(0,Math.min(...keys.map(k=>k.t))),hi=Math.min(c.duration,Math.max(Math.max(...keys.map(k=>k.t)),lo+frameToTick(1,c.fps)));
 return hi>lo?{in:lo,out:hi}:null;
}
