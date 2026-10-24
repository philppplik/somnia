import {useSyncExternalStore} from 'react';
/** Paragraph options dialog visibility. Session-only. */
let open=false;const listeners=new Set<()=>void>();
export const paragraphOptionsOpen=()=>open;
export function setParagraphOptionsOpen(next:boolean){if(open===next)return;open=next;listeners.forEach(fn=>fn());}
export const useParagraphOptionsOpen=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},paragraphOptionsOpen,paragraphOptionsOpen);
