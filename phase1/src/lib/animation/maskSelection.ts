import {useSyncExternalStore} from 'react';
import type {Layer} from './model';
/** Which mask of which layer the timeline lanes and canvas handles work on. View state only, never saved in the document. */
interface Sel{layer:string|null;mask:string|null}
let state:Sel={layer:null,mask:null};const listeners=new Set<()=>void>();
export const selectMask=(layer:string|null,mask:string|null)=>{if(state.layer===layer&&state.mask===mask)return;state={layer,mask};listeners.forEach(l=>l());};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useMaskSelection=()=>useSyncExternalStore(subscribe,()=>state,()=>state);
/** The selected mask of `layer`, falling back to its first mask. */
export const activeMask=(layer:Layer|undefined,sel:Sel)=>layer?.masks?.find(m=>sel.layer===layer.id&&m.id===sel.mask)??layer?.masks?.[0];
