import {useSyncExternalStore} from 'react';
import {emptyStats,defaultEnv,defaultSnap,type SnapSettings,type ExportUnit,type EnvSettings,type GizmoMode,type ModelStats,type OutlineEntry,type Bounds} from './model';
import type {ObjectInfo} from './stage';
import type {KeyPath} from './clips';
import {initialAnim,type AnimState,type ClipInfo} from './animation';
import type {RecentEntry} from './recent';
export type Studio3DStatus='idle'|'loading'|'ready'|'error';
export interface Studio3DState{
 status:Studio3DStatus;name:string;error:string;stats:ModelStats;outline:readonly OutlineEntry[];bounds:Bounds|null;
 pending:{name:string;bytes:Uint8Array}|null;dirty:boolean;canUndo:boolean;canRedo:boolean;undoLabel:string;/** Saved scenes and the autosave slot kept in this browser, newest first. */recent:readonly RecentEntry[];selectedInfo:ObjectInfo|null;
 /** A replace request waiting for the user's answer because the scene has unsaved changes. */
 confirmReplace:{what:'open'|'new';files:File[]}|null;env:EnvSettings;snap:SnapSettings;/** Unit written into STL and OBJ files, saved per project. */unit:ExportUnit;/** Progress of a running turntable render. */render:{done:number;total:number}|null;/** Extra objects ticked in the outline for align and distribute. */marked:number[];/** Non-fatal message after opening, for example missing textures. */notice:string;/** Suggested unit conversion for the opened STL: scale the object with this id by factor. */unitHint:{id:number;factor:number}|null;gizmo:GizmoMode;grid:boolean;wireframe:boolean;backend:string;selected:number|null;format:string;bytes:number;blank:boolean;
 /** Animation clips of the imported glTF and the playback state. */clips:readonly ClipInfo[];anim:AnimState;/** Keys of the selected object in the current clip. */clipKeys:readonly {path:KeyPath;times:number[];editable:boolean}[];
}
const initial=():Studio3DState=>({clips:[],clipKeys:[],anim:initialAnim(),status:'idle',name:'',error:'',stats:emptyStats(),outline:[],bounds:null,env:defaultEnv(),snap:defaultSnap(),unit:'m',render:null,marked:[],notice:'',unitHint:null,gizmo:'translate',pending:null,dirty:false,recent:[],canUndo:false,canRedo:false,undoLabel:'',selectedInfo:null,confirmReplace:null,grid:true,wireframe:false,backend:'',selected:null,format:'',bytes:0,blank:false});
let state=initial();const listeners=new Set<()=>void>();
export const getStudio3DState=()=>state;
export function patchStudio3D(patch:Partial<Studio3DState>){state={...state,...patch};listeners.forEach(l=>l());}
export function resetStudio3D(keep:Partial<Studio3DState>={}){const{grid,wireframe,backend,pending,env,gizmo,snap,unit,recent}=state;state={...initial(),grid,wireframe,backend,pending,env,gizmo,snap,unit,recent,...keep};listeners.forEach(l=>l());}
/** Smart Open hands a validated model to the studio. The canvas picks it up as soon as it is mounted. */
export const queueStudio3DModel=(model:{name:string;bytes:Uint8Array})=>patchStudio3D({pending:model});
export const subscribeStudio3D=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useStudio3D=()=>useSyncExternalStore(subscribeStudio3D,getStudio3DState,getStudio3DState);
