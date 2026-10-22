import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(f=>f());
export const getInterfaceExportAdvancedOpen=()=>open;
export function setInterfaceExportAdvancedOpen(value:boolean){if(open===value)return;open=value;emit();}
export const useInterfaceExportAdvancedOpen=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getInterfaceExportAdvancedOpen,getInterfaceExportAdvancedOpen);
