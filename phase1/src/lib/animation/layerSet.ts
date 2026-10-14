import {useSyncExternalStore} from 'react';
/** Extra layers picked with Shift or Ctrl click next to the primary selected layer. View state only, never saved. */
let extra:readonly string[]=[];const listeners=new Set<()=>void>();
const put=(n:readonly string[])=>{if(n.length===extra.length&&n.every((x,i)=>x===extra[i]))return;extra=n;listeners.forEach(l=>l());};
export const clearLayerSet=()=>put([]);
export const toggleLayerInSet=(id:string)=>put(extra.includes(id)?extra.filter(x=>x!==id):[...extra,id]);
export const getLayerSet=()=>extra;
/** The primary layer plus the extra ones, without duplicates. */
export const layerSetIds=(primary:string|null)=>primary?[primary,...extra.filter(x=>x!==primary)]:[...extra];
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useLayerSet=()=>useSyncExternalStore(subscribe,getLayerSet,getLayerSet);
