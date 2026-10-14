import {useSyncExternalStore} from 'react';
import {emptyStats,type ModelStats,type OutlineEntry,type Bounds} from './model';
export type Studio3DStatus='idle'|'loading'|'ready'|'error';
export interface Studio3DState{
 status:Studio3DStatus;name:string;error:string;stats:ModelStats;outline:readonly OutlineEntry[];bounds:Bounds|null;
 grid:boolean;wireframe:boolean;backend:string;selected:number|null;format:string;bytes:number;blank:boolean;
}
const initial=():Studio3DState=>({status:'idle',name:'',error:'',stats:emptyStats(),outline:[],bounds:null,grid:true,wireframe:false,backend:'',selected:null,format:'',bytes:0,blank:false});
let state=initial();const listeners=new Set<()=>void>();
export const getStudio3DState=()=>state;
export function patchStudio3D(patch:Partial<Studio3DState>){state={...state,...patch};listeners.forEach(l=>l());}
export function resetStudio3D(keep:Partial<Studio3DState>={}){const{grid,wireframe,backend}=state;state={...initial(),grid,wireframe,backend,...keep};listeners.forEach(l=>l());}
export const subscribeStudio3D=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useStudio3D=()=>useSyncExternalStore(subscribeStudio3D,getStudio3DState,getStudio3DState);
