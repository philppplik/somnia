import type {Composition,KeyRef} from './model';
import {snapToFrame} from './time';
import type {Retime} from './keyQuantize';
export interface DistributeResult{moves:Retime[];skipped:number;unchanged:number}
/**
 * Evenly space the selected keys of every property between its first and last selected key (those two stay put).
 * Needs three or more keys per property. A key is skipped when it would land on a key that is not moving or on another target.
 */
export function distributeMoves(comp:Composition,keys:readonly KeyRef[]):DistributeResult{
 const moves:Retime[]=[];let skipped=0,unchanged=0;
 const by=new Map<string,KeyRef[]>();
 for(const k of keys){const id=`${k.layer}\0${k.prop}`,g=by.get(id);if(g)g.push(k);else by.set(id,[k]);}
 by.forEach(list=>{
  if(list.length<3)return;
  const l=comp.layers.find(x=>x.id===list[0].layer);if(!l)return;
  list.sort((a,b)=>a.t-b.t);
  const moving=new Set(list.map(k=>k.t)),fixed=new Set(l.transform[list[0].prop].keys.map(k=>k.t).filter(t=>!moving.has(t)));
  const first=list[0].t,last=list[list.length-1].t,n=list.length-1,used=new Set<number>(list.map(k=>k.t));
  for(let i=1;i<n;i++){
   const k=list[i],to=snapToFrame(first+(last-first)*i/n,comp.fps);
   if(to===k.t){unchanged++;continue;}
   if(fixed.has(to)||(used.has(to)&&to!==k.t)){skipped++;continue;}
   used.delete(k.t);used.add(to);moves.push({layer:k.layer,prop:k.prop,from:k.t,to});
  }
 });
 return {moves,skipped,unchanged};
}
