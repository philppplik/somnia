import {useSyncExternalStore} from 'react';
export interface InterfacePresetPreview {frameId:string;width:number;height:number;}
let preview:InterfacePresetPreview|null=null;const listeners=new Set<()=>void>();
export const getInterfacePresetPreview=()=>preview;
export function setInterfacePresetPreview(next:InterfacePresetPreview|null){preview=next;for(const l of listeners)l();}
export function useInterfacePresetPreview(){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb);};},()=>preview,()=>preview);}
