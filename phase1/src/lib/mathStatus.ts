import {useSyncExternalStore} from 'react';
/** What the active preview knows about its math, shown as a pill in the status bar. */
export interface MathStatus{kind:'md'|'tex'|null;count:number;errors:number;loading:boolean;failed:boolean}
const EMPTY:MathStatus={kind:null,count:0,errors:0,loading:false,failed:false};
let cur=EMPTY;const subs=new Set<()=>void>();
export function setMathStatus(s:MathStatus){if(cur.kind===s.kind&&cur.count===s.count&&cur.errors===s.errors&&cur.loading===s.loading&&cur.failed===s.failed)return;cur=s;subs.forEach(f=>f());}
export const clearMathStatus=()=>setMathStatus(EMPTY);
export const useMathStatus=()=>useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f);};},()=>cur,()=>cur);
