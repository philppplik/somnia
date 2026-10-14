import type {Rational} from './time';
import {frameToTick,tickToFrame} from './time';
/** Onion skin (viewer only, never exported): faint copies of the composition at nearby frames. Pure and bounded. */
export interface Onion{on:boolean;before:number;after:number;step:number}
export const MAX_GHOSTS=5,MAX_STEP=30;
export const defaultOnion=():Onion=>({on:false,before:2,after:1,step:1});
const clampInt=(x:unknown,lo:number,hi:number,d:number)=>typeof x==='number'&&Number.isFinite(x)?Math.min(hi,Math.max(lo,Math.round(x))):d;
export const normalizeOnion=(x:unknown):Onion=>{const d=defaultOnion(),o=(x&&typeof x==='object'?x:{}) as Partial<Onion>;return {on:o.on===true,before:clampInt(o.before,0,MAX_GHOSTS,d.before),after:clampInt(o.after,0,MAX_GHOSTS,d.after),step:clampInt(o.step,1,MAX_STEP,d.step)};};
export interface Ghost{tick:number;side:'before'|'after';n:number;opacity:number}
/** Ghost frames around the playhead, nearest first per side. Ticks outside 0..duration are skipped; the current frame is never repeated. */
export function ghostFrames(o:Onion,playhead:number,fps:Rational,duration:number):Ghost[]{
 if(!o.on)return [];
 const f=tickToFrame(playhead,fps),out:Ghost[]=[];
 for(const [side,count,sign] of [['before',o.before,-1],['after',o.after,1]] as const)
  for(let n=1;n<=count;n++){const tick=frameToTick(f+sign*n*o.step,fps);if(tick<0||tick>=duration)continue;out.push({tick,side,n,opacity:Math.round(0.4/n*100)/100});}
 return out;
}
