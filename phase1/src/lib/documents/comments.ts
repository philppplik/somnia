import {useSyncExternalStore} from 'react';
/** Comments panel visibility. Session-only; the list itself is read from the engine whenever the document changes. */
let open=false;const listeners=new Set<()=>void>();
export const commentsOpen=()=>open;
export function setCommentsOpen(next:boolean){if(open===next)return;open=next;listeners.forEach(fn=>fn());}
export const useCommentsOpen=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},commentsOpen,commentsOpen);
