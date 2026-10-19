import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
export const getVectorExportAdvancedOpen=()=>open;
export function setVectorExportAdvancedOpen(value:boolean){if(open===value)return;open=value;listeners.forEach(f=>f());}
export const useVectorExportAdvancedOpen=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getVectorExportAdvancedOpen,getVectorExportAdvancedOpen);
