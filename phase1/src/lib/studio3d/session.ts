import {useSyncExternalStore} from 'react';
import {emptyStats,defaultEnv,defaultSnap,type SnapSettings,type ExportUnit,type EnvSettings,type GizmoMode,type ModelStats,type OutlineEntry,type Bounds} from './model';
import type {ObjectInfo} from './stage';
import type {KeyPath} from './clips';
import type {Ease} from './ease';
import {initialAnim,type AnimState,type ClipInfo} from './animation';
import type {RecentEntry} from './recent';
export type Studio3DStatus='idle'|'loading'|'ready'|'error';
export interface Studio3DState{
 status:Studio3DStatus;name:string;error:string;stats:ModelStats;outline:readonly OutlineEntry[];bounds:Bounds|null;
 pending:{name:string;bytes:Uint8Array}|null;dirty:boolean;canUndo:boolean;canRedo:boolean;undoLabel:string;/** Saved scenes and the autosave slot kept in this browser, newest first. */recent:readonly RecentEntry[];selectedInfo:ObjectInfo|null;
 /** A replace request waiting for the user's answer because the scene has unsaved changes. */
 confirmReplace:{what:'open'|'new';files:File[]}|null;env:EnvSettings;snap:SnapSettings;/** Unit written into STL and OBJ files, saved per project. */unit:ExportUnit;/** Progress of a running turntable render. */render:{done:number;total:number}|null;/** Extra objects ticked in the outline for align and distribute. */marked:number[];/** Non-fatal message after opening, for example missing textures. */notice:string;/** Suggested unit conversion for the opened STL: scale the object with this id by factor. */unitHint:{id:number;factor:number}|null;gizmo:GizmoMode;grid:boolean;wireframe:boolean;backend:string;selected:number|null;format:string;bytes:number;blank:boolean;
 /** Animation clips of the imported glTF and the playback state. */clips:readonly ClipInfo[];anim:AnimState;
 /** Bones of skinned meshes in the scene (for the bone picker and the skeleton overlay). */bones:readonly {id:number;name:string;depth:number}[];/** The skeleton overlay lines are visible. */skeleton:boolean;/** Bone whose influence the weight preview shows on the selected skinned mesh, or null. */weightPreview:number|null;/** Weight paint brush settings; painting is active while on and a preview bone is set. */weightBrush:{on:boolean;mode:'add'|'subtract'|'smooth';radius:number;strength:number;falloff:'smooth'|'linear'|'constant'};/** Keys of the selected object in the current clip. */clipKeys:readonly {path:KeyPath;times:number[];eases:Ease[];editable:boolean}[];/** Transform changes are recorded as keys at the current time. */autoKey:boolean;
}
const initial=():Studio3DState=>({clips:[],clipKeys:[],autoKey:false,bones:[],skeleton:true,weightPreview:null,weightBrush:{on:false,mode:'add',radius:0.2,strength:0.35,falloff:'smooth'},anim:initialAnim(),status:'idle',name:'',error:'',stats:emptyStats(),outline:[],bounds:null,env:defaultEnv(),snap:defaultSnap(),unit:'m',render:null,marked:[],notice:'',unitHint:null,gizmo:'translate',pending:null,dirty:false,recent:[],canUndo:false,canRedo:false,undoLabel:'',selectedInfo:null,confirmReplace:null,grid:true,wireframe:false,backend:'',selected:null,format:'',bytes:0,blank:false});
let state=initial();const listeners=new Set<()=>void>();
export const getStudio3DState=()=>state;
export function patchStudio3D(patch:Partial<Studio3DState>){state={...state,...patch};listeners.forEach(l=>l());}
export function resetStudio3D(keep:Partial<Studio3DState>={}){const{grid,wireframe,backend,pending,env,gizmo,snap,unit,recent,skeleton}=state;state={...initial(),grid,wireframe,backend,pending,env,gizmo,snap,unit,recent,skeleton,...keep};listeners.forEach(l=>l());}
/** Smart Open hands a validated model to the studio. The canvas picks it up as soon as it is mounted. */
export const queueStudio3DModel=(model:{name:string;bytes:Uint8Array})=>patchStudio3D({pending:model});
export const subscribeStudio3D=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useStudio3D=()=>useSyncExternalStore(subscribeStudio3D,getStudio3DState,getStudio3DState);
