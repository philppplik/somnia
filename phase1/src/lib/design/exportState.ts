import {useSyncExternalStore} from 'react';
let open=false;const listeners=new Set<()=>void>();
export const getDesignExportOpen=()=>open;
export function setDesignExportOpen(value:boolean){open=value;listeners.forEach(f=>f());}
export const useDesignExportOpen=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getDesignExportOpen,getDesignExportOpen);
let advancedOpen=false;
export const getDesignExportAdvancedOpen=()=>advancedOpen;
export function setDesignExportAdvancedOpen(value:boolean){advancedOpen=value;listeners.forEach(f=>f());}
export const useDesignExportAdvancedOpen=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},getDesignExportAdvancedOpen,getDesignExportAdvancedOpen);
