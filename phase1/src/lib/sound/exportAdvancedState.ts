import {useSyncExternalStore} from 'react';
let name:string|null=null;const listeners=new Set<()=>void>();
export const getSoundExportAdvanced=()=>name;
/** Clip name the Advanced Export dialog is open for, or null when closed. */
export function setSoundExportAdvanced(next:string|null){if(name===next)return;name=next;listeners.forEach(f=>f());}
export const useSoundExportAdvanced=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getSoundExportAdvanced,getSoundExportAdvanced);
