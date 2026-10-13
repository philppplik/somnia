import {useSyncExternalStore} from 'react';
let request=0;const listeners=new Set<()=>void>();
export const getVectorExportRequest=()=>request;
export const requestVectorExport=()=>{request++;listeners.forEach(f=>f());};
export const useVectorExportRequest=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getVectorExportRequest,getVectorExportRequest);

let consumed=0;
export function consumeVectorExportRequest(request:number){if(!request||request<=consumed)return false;consumed=request;return true;}
