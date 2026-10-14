import {useSyncExternalStore} from 'react';
import type {Layer} from './model';
/** Which mask of which layer the timeline lanes and canvas handles work on, the selected path point and the pen tool. View state only, never saved in the document. */
interface Sel{layer:string|null;mask:string|null;point:number|null;pen:boolean}
let state:Sel={layer:null,mask:null,point:null,pen:false};const listeners=new Set<()=>void>();
const put=(n:Sel)=>{if(n.layer===state.layer&&n.mask===state.mask&&n.point===state.point&&n.pen===state.pen)return;state=n;listeners.forEach(l=>l());};
export const selectMask=(layer:string|null,mask:string|null)=>{if(state.layer===layer&&state.mask===mask)return;put({...state,layer,mask,point:null});};
export const selectPoint=(point:number|null)=>put({...state,point});
export const setPen=(pen:boolean)=>put({...state,pen,point:null});
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useMaskSelection=()=>useSyncExternalStore(subscribe,()=>state,()=>state);
/** The selected mask of `layer`, falling back to its first mask. */
export const activeMask=(layer:Layer|undefined,sel:Sel)=>layer?.masks?.find(m=>sel.layer===layer.id&&m.id===sel.mask)??layer?.masks?.[0];
