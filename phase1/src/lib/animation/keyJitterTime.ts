import type {Composition,KeyRef} from './model';
import {frameToTick,snapToFrame} from './time';
import type {Retime} from './keyQuantize';
export const MAX_JITTER_FRAMES=60,MAX_JITTER_KEYS=800;
function rng(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export interface JitterResult{moves:Retime[];skipped:number}
/** Move every selected key by a seeded random whole number of frames within +-frames (never 0). Skips moves that leave the composition or land on another key. */
export function jitterTimeMoves(comp:Composition,keys:readonly KeyRef[],frames:number,seed=1):JitterResult{
 if(!Number.isInteger(frames)||frames<1||frames>MAX_JITTER_FRAMES)throw Object.assign(new Error(`Use 1 to ${MAX_JITTER_FRAMES} frames.`),{expected:true});
 if(keys.length>MAX_JITTER_KEYS)throw Object.assign(new Error('Too many keys.'),{expected:true});
 const r=rng(Number.isFinite(seed)?Math.trunc(seed):1),lo=comp.start,hi=comp.start+comp.duration,moves:Retime[]=[];let skipped=0;
 const by=new Map<string,KeyRef[]>();
 for(const k of keys){const id=`${k.layer}\0${k.prop}`,g=by.get(id);if(g)g.push(k);else by.set(id,[k]);}
 by.forEach(list=>{
  const l=comp.layers.find(x=>x.id===list[0].layer);if(!l)return;
  list.sort((a,b)=>a.t-b.t);
  const used=new Set<number>(l.transform[list[0].prop].keys.map(k=>k.t));
  for(const k of list){
   const mag=1+Math.floor(r()*frames),dir=r()<0.5?-1:1,to=snapToFrame(k.t+dir*mag*frameToTick(1,comp.fps),comp.fps);
   if(to<lo||to>hi||to===k.t||used.has(to)){skipped++;continue;}
   used.delete(k.t);used.add(to);moves.push({layer:k.layer,prop:k.prop,from:k.t,to});
  }
 });
 return {moves,skipped};
}
