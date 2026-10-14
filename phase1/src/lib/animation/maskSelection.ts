import {useSyncExternalStore} from 'react';
import type {Layer,LayerMask} from './model';
import type {MaskKeyClip,MaskKeysClip} from './masks';
/** Which mask of which layer the timeline lanes and canvas handles work on, the selected path point and the pen tool. View state only, never saved in the document. */
export type MaskClip={kind:'mask';mask:LayerMask}|{kind:'key';key:MaskKeyClip}|{kind:'keys';keys:MaskKeysClip}|null;
export interface GraphTarget{mask:string;prop:'position'|'size'|'feather'|'opacity'|'path'}
interface Sel{layer:string|null;mask:string|null;point:number|null;pen:boolean;clip:MaskClip;graph:GraphTarget|null;mixed:boolean}
let state:Sel={layer:null,mask:null,point:null,pen:false,clip:null,graph:null,mixed:false};const listeners=new Set<()=>void>();
const put=(n:Sel)=>{if(n.layer===state.layer&&n.mask===state.mask&&n.point===state.point&&n.pen===state.pen&&n.clip===state.clip&&n.graph===state.graph&&n.mixed===state.mixed)return;state=n;listeners.forEach(l=>l());};
export const selectMask=(layer:string|null,mask:string|null)=>{if(state.layer===layer&&state.mask===mask)return;put({...state,layer,mask,point:null});};
export const selectPoint=(point:number|null)=>put({...state,point});
/** In-memory clipboard for masks and mask keys (view state, not saved). */
export const setMaskClip=(clip:MaskClip)=>put({...state,clip});
/** Mask property shown in the graph editor; null shows the transform properties. */
export const setGraphTarget=(graph:GraphTarget|null)=>put({...state,graph});
/** Mixed graph: keys of every animated property of the layer in one view. */
export const setGraphMixed=(mixed:boolean)=>put({...state,mixed});
export const setPen=(pen:boolean)=>put({...state,pen,point:null});
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useMaskSelection=()=>useSyncExternalStore(subscribe,()=>state,()=>state);
/** The selected mask of `layer`, falling back to its first mask. */
export const activeMask=(layer:Layer|undefined,sel:Sel)=>layer?.masks?.find(m=>sel.layer===layer.id&&m.id===sel.mask)??layer?.masks?.[0];
