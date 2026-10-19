import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
export const getAnimationExportAdvanced=()=>open;
export function setAnimationExportAdvanced(next:boolean){if(open===next)return;open=next;listeners.forEach(f=>f());}
export const useAnimationExportAdvanced=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getAnimationExportAdvanced,getAnimationExportAdvanced);
