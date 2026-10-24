import {useSyncExternalStore} from 'react';
/** Session-only CSV/TSV import dialog state for Sheets. Closing the studio closes it. */
let state={open:false,working:false};
const listeners=new Set<()=>void>();
export const getSheetsImportState=()=>state;
export const subscribeSheetsImport=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setSheetsImportState(p:Partial<typeof state>){state={...state,...p};listeners.forEach(f=>f());}
export const useSheetsImportState=()=>useSyncExternalStore(subscribeSheetsImport,getSheetsImportState,getSheetsImportState);
