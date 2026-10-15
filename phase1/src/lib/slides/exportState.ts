import {useSyncExternalStore} from 'react';
/** Session-only advanced-export dialog state for Slides. Closing the studio closes it. */
let state={open:false,working:false};
const listeners=new Set<()=>void>();
export const getSlidesExportState=()=>state;
export const subscribeSlidesExport=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setSlidesExportState(p:Partial<typeof state>){state={...state,...p};listeners.forEach(f=>f());}
export const useSlidesExportState=()=>useSyncExternalStore(subscribeSlidesExport,getSlidesExportState,getSlidesExportState);
