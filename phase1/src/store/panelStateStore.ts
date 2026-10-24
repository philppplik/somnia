import {useCallback,useRef,useSyncExternalStore} from 'react';
/** Panel-local UI state (active sub-tab, filter, expanded groups) persisted per `PanelDef.persistKey`. JSON values only. */
const KEY='somnia.panelState.v1';
export interface PanelStateStorage{getItem(key:string):string|null;setItem(key:string,value:string):void;}
export function createPanelStateStore(storage?:PanelStateStorage){
 let state:Record<string,unknown>={};
 try{const d=JSON.parse(storage?.getItem(KEY)??'null');if(d&&typeof d==='object'&&!Array.isArray(d))state=d;}catch{/* session only */}
 const subs=new Set<()=>void>();
 return {
  get:<T,>(key:string,initial:T):T=>(key in state?state[key] as T:initial),
  set(key:string,value:unknown){
   if(JSON.stringify(state[key])===JSON.stringify(value)&&key in state)return;
   state={...state,[key]:value};
   try{storage?.setItem(KEY,JSON.stringify(state));}catch{/* session only */}
   subs.forEach(f=>f());
  },
  subscribe(fn:()=>void){subs.add(fn);return()=>{subs.delete(fn);};},
 };
}
let storage:PanelStateStorage|undefined;try{storage=globalThis.localStorage;}catch{/* unavailable */}
export const panelStateStore=createPanelStateStore(storage);
export function usePanelState<T>(persistKey:string,initial:T):[T,(next:T)=>void]{
 const init=useRef(initial).current;
 const value=useSyncExternalStore(panelStateStore.subscribe,()=>panelStateStore.get(persistKey,init),()=>init);
 const set=useCallback((next:T)=>panelStateStore.set(persistKey,next),[persistKey]);
 return [value,set];
}
