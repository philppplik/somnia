import type {Composition,KeyRef} from './model';
import {snapToFrame} from './time';
import type {Retime} from './keyQuantize';
import {styleKeyLanes,type StyleKeyRef} from './keyLanes';
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
export interface StyleRetime{layer:string;lane:StyleKeyRef['lane'];from:number;to:number}
export interface StretchPlan{moves:Retime[];styleMoves:StyleRetime[];skipped:number;unchanged:number}
/** Same rules as stretchMoves, for keys in style lanes (colour, gradient, stroke, repeater, volume...). Moves are ordered so keys of one lane never pass through each other. */
export function stretchStyleMoves(comp:Composition,picks:readonly StyleKeyRef[],percent:number,anchor:number):{moves:StyleRetime[];skipped:number;unchanged:number}{
 const none={moves:[] as StyleRetime[],skipped:0,unchanged:0};
 if(!Number.isFinite(percent)||percent<MIN_STRETCH||percent>MAX_STRETCH)return none;
 const lo=comp.start,hi=comp.start+comp.duration,out:StyleRetime[]=[];let skipped=0,unchanged=0;
 const by=new Map<string,StyleKeyRef[]>();
 for(const k of picks){const id=`${k.layer}\0${k.lane}`;by.set(id,[...(by.get(id)??[]),k]);}
 for(const list of by.values()){
  const l=comp.layers.find(x=>x.id===list[0].layer),lane=l&&styleKeyLanes(l).find(x=>x.id===list[0].lane);if(!lane)continue;
  const moving=new Set(list.map(k=>k.t)),fixed=new Set(lane.ticks.filter(t=>!moving.has(t)));
  const plan=list.map(k=>({k,to:snapToFrame(anchor+(k.t-anchor)*percent/100,comp.fps)}));
  const used=new Set<number>(plan.filter(p=>p.to===p.k.t).map(p=>p.to)),ok:typeof plan=[];
  for(const p of [...plan].sort((a,b)=>a.k.t-b.k.t)){
   if(p.to===p.k.t){unchanged++;continue;}
   if(p.to<lo||p.to>hi||used.has(p.to)||fixed.has(p.to)){skipped++;used.add(p.k.t);continue;}
   used.add(p.to);ok.push(p);
  }
  const up=ok.filter(p=>p.to>p.k.t).sort((a,b)=>b.k.t-a.k.t),down=ok.filter(p=>p.to<p.k.t).sort((a,b)=>a.k.t-b.k.t);
  for(const p of [...up,...down])out.push({layer:p.k.layer,lane:p.k.lane,from:p.k.t,to:p.to});
 }
 return {moves:out,skipped,unchanged};
}
/** Everything one stretch does: transform keys and style-lane keys together. */
export function stretchPlan(comp:Composition,keys:readonly KeyRef[],styleKeys:readonly StyleKeyRef[],percent:number,anchor:StretchAnchor,playhead:number):StretchPlan{
 const at=anchor==='playhead'?playhead:Math.min(...keys.map(k=>k.t),...styleKeys.map(k=>k.t));
 if(!Number.isFinite(at))return {moves:[],styleMoves:[],skipped:0,unchanged:0};
 const a=stretchMoves(comp,keys,percent,at),b=stretchStyleMoves(comp,styleKeys,percent,at);
 return {moves:a.moves,styleMoves:b.moves,skipped:a.skipped+b.skipped,unchanged:a.unchanged+b.unchanged};
}
