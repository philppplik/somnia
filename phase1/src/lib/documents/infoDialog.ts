import {useSyncExternalStore} from 'react';
/** Which document info dialog is open (properties or word count). Session-only. */
export type InfoDialog='properties'|'wordCount'|null;
let open:InfoDialog=null;const listeners=new Set<()=>void>();
export const infoDialog=()=>open;
export function setInfoDialog(next:InfoDialog){if(open===next)return;open=next;listeners.forEach(fn=>fn());}
export const useInfoDialog=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},infoDialog,infoDialog);
