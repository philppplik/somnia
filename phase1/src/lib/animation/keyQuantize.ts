import type {Composition,KeyRef} from './model';
import {snapToFrame} from './time';
export interface Retime{layer:string;prop:KeyRef['prop'];from:number;to:number}
/**
 * Moves each key to the nearest target tick (on a whole frame). Keys already on a target stay. `maxTicks` limits how far a key may travel.
 * A move is skipped when two keys of one property would land on the same tick or on a key that is not moving; the count of skipped keys is returned.
 */
export function quantizeMoves(comp:Composition,keys:readonly KeyRef[],targets:readonly number[],maxTicks=Infinity):{moves:Retime[];skipped:number;unchanged:number}{
 const grid=[...new Set(targets.map(t=>snapToFrame(t,comp.fps)).filter(t=>t>=comp.start&&t<=comp.start+comp.duration))].sort((a,b)=>a-b);
 if(!grid.length)return {moves:[],skipped:0,unchanged:0};
 const moves:Retime[]=[];let skipped=0,unchanged=0;const byProp=new Map<string,KeyRef[]>();
 for(const k of keys){const id=`${k.layer}\0${k.prop}`;byProp.set(id,[...(byProp.get(id)??[]),k]);}
 for(const list of byProp.values()){
  const l=comp.layers.find(x=>x.id===list[0].layer);if(!l)continue;const moving=new Set(list.map(k=>k.t));
  const fixed=new Set(l.transform[list[0].prop].keys.map(k=>k.t).filter(t=>!moving.has(t)));const used=new Set<number>();
  const plan=list.map(k=>{let best=grid[0];for(const g of grid)if(Math.abs(g-k.t)<Math.abs(best-k.t))best=g;return {k,to:Math.abs(best-k.t)<=maxTicks?best:k.t};});
  for(const p of plan)if(p.to===p.k.t)used.add(p.to);
  for(const p of plan){
   if(p.to===p.k.t){unchanged++;continue;}
   if(used.has(p.to)||fixed.has(p.to)){skipped++;used.add(p.k.t);continue;}
   used.add(p.to);moves.push({layer:p.k.layer,prop:p.k.prop,from:p.k.t,to:p.to});
  }
 }
 return {moves,skipped,unchanged};
}
