import type {Composition,KeyRef} from './model';
import {snapToFrame} from './time';
import type {Retime} from './keyQuantize';
/** Time-stretch of selected keys: each key moves to anchor + (t - anchor) * percent / 100, on a whole frame. Pure and bounded. */
export const MIN_STRETCH=10,MAX_STRETCH=1000;
export type StretchAnchor='first'|'playhead';
export interface StretchResult{moves:Retime[];skipped:number;unchanged:number}
/**
 * A move is skipped when it leaves the composition, lands on a key that is not moving, or lands where another moving key of the same
 * property already goes. Skipped keys stay where they are; the count is returned so the caller can say so.
 */
export function stretchMoves(comp:Composition,keys:readonly KeyRef[],percent:number,anchor:number):StretchResult{
 if(!Number.isFinite(percent)||percent<MIN_STRETCH||percent>MAX_STRETCH)return {moves:[],skipped:0,unchanged:0};
 const lo=comp.start,hi=comp.start+comp.duration,moves:Retime[]=[];let skipped=0,unchanged=0;
 const byProp=new Map<string,KeyRef[]>();
 for(const k of keys){const id=`${k.layer}\0${k.prop}`;byProp.set(id,[...(byProp.get(id)??[]),k]);}
 for(const list of byProp.values()){
  const l=comp.layers.find(x=>x.id===list[0].layer);if(!l)continue;
  const moving=new Set(list.map(k=>k.t)),fixed=new Set(l.transform[list[0].prop].keys.map(k=>k.t).filter(t=>!moving.has(t)));
  const plan=list.map(k=>({k,to:snapToFrame(anchor+(k.t-anchor)*percent/100,comp.fps)}));
  const used=new Set<number>(plan.filter(p=>p.to===p.k.t).map(p=>p.to));
  for(const p of [...plan].sort((a,b)=>a.k.t-b.k.t)){
   if(p.to===p.k.t){unchanged++;continue;}
   if(p.to<lo||p.to>hi||used.has(p.to)||fixed.has(p.to)){skipped++;used.add(p.k.t);continue;}
   used.add(p.to);moves.push({layer:p.k.layer,prop:p.k.prop,from:p.k.t,to:p.to});
  }
 }
 return {moves,skipped,unchanged};
}
