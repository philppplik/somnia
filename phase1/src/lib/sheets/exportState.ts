import {useSyncExternalStore} from 'react';
/** Session-only advanced-export dialog state for Sheets. Closing the studio closes it. */
let state={open:false,working:false};
const listeners=new Set<()=>void>();
export const getSheetsExportState=()=>state;
export const subscribeSheetsExport=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setSheetsExportState(p:Partial<typeof state>){state={...state,...p};listeners.forEach(f=>f());}
export const useSheetsExportState=()=>useSyncExternalStore(subscribeSheetsExport,getSheetsExportState,getSheetsExportState);
