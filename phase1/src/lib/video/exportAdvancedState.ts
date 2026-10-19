import {useSyncExternalStore} from 'react';
let name:string|null=null;const listeners=new Set<()=>void>();
export const getVideoExportAdvanced=()=>name;
/** Timeline name the Advanced Export dialog is open for, or null when closed. */
export function setVideoExportAdvanced(next:string|null){if(name===next)return;name=next;listeners.forEach(f=>f());}
export const useVideoExportAdvanced=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getVideoExportAdvanced,getVideoExportAdvanced);
