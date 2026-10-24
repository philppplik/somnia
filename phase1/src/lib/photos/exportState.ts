import {useSyncExternalStore} from 'react';
/** Session-only export setup. Closing the studio closes setup; format survives studio switches. */
let state={open:false,format:'png' as 'png'|'jpeg',working:false};
const listeners=new Set<()=>void>();
export const getPhotoExportState=()=>state;
export const subscribePhotoExport=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function setPhotoExportState(p:Partial<typeof state>){state={...state,...p};listeners.forEach(f=>f());}
export const usePhotoExportState=()=>useSyncExternalStore(subscribePhotoExport,getPhotoExportState,getPhotoExportState);
