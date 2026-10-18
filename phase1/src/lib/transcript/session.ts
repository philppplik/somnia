import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
export function setTranscriptHubOpen(value:boolean){open=value;listeners.forEach(f=>f());}
export const openTranscriptHub=()=>setTranscriptHubOpen(true);
export const useTranscriptHub=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>open,()=>false);
