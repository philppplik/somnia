import {useSyncExternalStore} from 'react';
import type {RiskId} from './inspect';
export type DocStatus='idle'|'loading'|'ready'|'error';
export interface DocumentsState{status:DocStatus;name:string;error:string;pages:number;zoom:number;risks:readonly RiskId[];words:number;engineMs:number|null;saving:boolean}
const initial:DocumentsState={status:'idle',name:'',error:'',pages:0,zoom:1,risks:[],words:0,engineMs:null,saving:false};
let state=initial;const listeners=new Set<()=>void>();
export const getDocumentsState=()=>state;
export function patchDocuments(p:Partial<DocumentsState>){state={...state,...p};listeners.forEach(l=>l());}
export const resetDocuments=()=>patchDocuments({...initial,zoom:state.zoom});
export const useDocuments=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getDocumentsState,getDocumentsState);
export const ZOOMS=[0.5,0.75,1,1.25,1.5,2] as const;
export const stepZoom=(dir:1|-1)=>{const i=ZOOMS.findIndex(z=>z>=state.zoom-1e-6);const next=ZOOMS[Math.min(ZOOMS.length-1,Math.max(0,(i<0?2:i)+dir))];patchDocuments({zoom:next});};
