import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
export const getStudio3DExportAdvanced=()=>open;
export function setStudio3DExportAdvanced(next:boolean){if(open===next)return;open=next;listeners.forEach(f=>f());}
export const useStudio3DExportAdvanced=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getStudio3DExportAdvanced,getStudio3DExportAdvanced);
