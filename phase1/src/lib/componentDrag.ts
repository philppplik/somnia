import {useSyncExternalStore} from 'react';
/** Active component drag from the Components panel (module state, never persisted). Drives the status-bar hint and the canvas insertion pill. */
export interface ComponentDrag{name:string;variant:string}
let active:ComponentDrag|null=null;const listeners=new Set<()=>void>();
export function setComponentDrag(next:ComponentDrag|null){active=next;listeners.forEach(l=>l());}
export function getComponentDrag(){return active;}
export function useComponentDrag():ComponentDrag|null{return useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb);};},getComponentDrag,getComponentDrag);}
if(typeof window!=='undefined')window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)setComponentDrag(null);});
