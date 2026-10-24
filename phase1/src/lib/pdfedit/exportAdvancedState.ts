import {useSyncExternalStore} from 'react';
let open:string|null=null;const listeners=new Set<()=>void>();
/** Name of the PDF whose Advanced Export dialog is open, or null. */
export const getPdfExportAdvanced=()=>open;
export function setPdfExportAdvanced(next:string|null){if(open===next)return;open=next;listeners.forEach(f=>f());}
export const usePdfExportAdvanced=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getPdfExportAdvanced,getPdfExportAdvanced);
