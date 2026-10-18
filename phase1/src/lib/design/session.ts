import type {DesignToolId} from './panelContract';
import {useSyncExternalStore} from 'react';
import {createDesignDocument,parseDesignDocument,type DesignDocument} from './model';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import {estimateValueBytes,sealSnapshot,verifySnapshot} from '../lifecycle/recipeKit';
import type {StudioLifecycleAdapter} from '../lifecycle/types';
export interface DesignState {document:DesignDocument|null;artboardId:string|null;selection:string|null;selectedIds:string[];tool:DesignToolId;dirty:boolean;past:DesignDocument[];future:DesignDocument[]}
let state:DesignState={document:null,artboardId:null,selection:null,selectedIds:[],tool:'select',dirty:false,past:[],future:[]};
const listeners=new Set<()=>void>();
let editRevision=0;
/** True while a dirty document lives only in a lifecycle checkpoint; keeps the unload warning honest. Any state change resets it. */
let suspendedDirty=false;
const emit=(next:DesignState)=>{editRevision++;suspendedDirty=false;state=next;listeners.forEach(fn=>fn());};
export const getDesignState=()=>state;
export function useDesignState(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getDesignState,getDesignState);}
export function startDesign(){const doc=createDesignDocument();loadDesign(doc,true);}
export function loadDesign(doc:DesignDocument,dirty=false){const checked=parseDesignDocument(JSON.stringify(doc));emit({document:checked,artboardId:checked.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty,past:[],future:[]});}
export function selectDesignNode(selection:string|null,additive=false){const selectedIds=selection===null?[]:additive?(state.selectedIds.includes(selection)?state.selectedIds.filter(id=>id!==selection):[...state.selectedIds,selection]):[selection];emit({...state,selection:selectedIds.at(-1)??null,selectedIds});}
export function selectDesignNodes(ids:readonly string[]){const selectedIds=[...new Set(ids)];emit({...state,selection:selectedIds.at(-1)??null,selectedIds});}
export function setDesignTool(tool:DesignToolId){emit({...state,tool});}
export function selectArtboard(artboardId:string){if(state.document?.artboards.some(a=>a.id===artboardId))emit({...state,artboardId,selection:null,selectedIds:[]});}
/** Each commit is one undo transaction. Preview drags remain outside the document. */
export function editDesign(edit:(doc:DesignDocument)=>DesignDocument){if(!state.document)return;const next=parseDesignDocument(JSON.stringify(edit(structuredClone(state.document))));if(JSON.stringify(next)===JSON.stringify(state.document))return;emit({...state,document:next,dirty:true,past:[...state.past.slice(-99),state.document],future:[]});}
export function undoDesign(){if(!state.past.length||!state.document)return;const doc=state.past.at(-1)!;emit({...state,document:doc,artboardId:doc.artboards.some(a=>a.id===state.artboardId)?state.artboardId:doc.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty:true,past:state.past.slice(0,-1),future:[state.document,...state.future]});}
export function redoDesign(){if(!state.future.length||!state.document)return;const doc=state.future[0];emit({...state,document:doc,artboardId:doc.artboards.some(a=>a.id===state.artboardId)?state.artboardId:doc.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty:true,past:[...state.past,state.document],future:state.future.slice(1)});}
/** Download initiation is not proof of a saved file. Keep dirty state honest. */
export function downloadDesign(name:string,body:string,mime:string){const url=URL.createObjectURL(new Blob([body],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(suspendedDirty||(state.document&&state.dirty)){event.preventDefault();event.returnValue='';}});
/** Call only after a source-of-truth file write succeeds. */
export function markDesignSaved(){emit({...state,dirty:false});}
/** Caller owns any save/discard confirmation before clearing. */
export function clearDesign(){emit({document:null,artboardId:null,selection:null,selectedIds:[],tool:'select',dirty:false,past:[],future:[]});}

/* Lifecycle (docs/studio-lifecycle.md): the session is the only copy of the open layout, so the checkpoint holds the document, selection and a bounded undo history. Suspend clears the in-memory session; resume restores it synchronously. */
const DESIGN_SNAPSHOT_SCHEMA=1;
const DESIGN_CHECKPOINT_HISTORY=50;
/** True while a dirty document lives only in a lifecycle checkpoint; keeps the unload warning honest. */
export function designCheckpointPayload():DesignState{
 return structuredClone({...state,past:state.past.slice(-DESIGN_CHECKPOINT_HISTORY),future:state.future.slice(0,DESIGN_CHECKPOINT_HISTORY)});
}
export function restoreDesignCheckpoint(p:DesignState):void{
 const document=p.document?parseDesignDocument(JSON.stringify(p.document)):null;
 const artboardId=document?(document.artboards.some(a=>a.id===p.artboardId)?p.artboardId:document.artboards[0].id):null;
 suspendedDirty=false;
 emit({document,artboardId,selection:p.selection,selectedIds:[...p.selectedIds],tool:p.tool,dirty:p.dirty,past:[...p.past],future:[...p.future]});
}
export function createDesignLifecycleAdapter():StudioLifecycleAdapter{
 let cached:{rev:number;bytes:number}|null=null;
 const unsaved=()=>suspendedDirty||(!!state.document&&state.dirty);
 const release=()=>{const dirty=!!state.document&&state.dirty;clearDesign();suspendedDirty=dirty;};
 return{
  estimateBytes:()=>{if(!state.document)return 0;if(!cached||cached.rev!==editRevision)cached={rev:editRevision,bytes:estimateValueBytes(state.document)*(1+state.past.length+state.future.length)};return cached.bytes;},
  resourceIds:()=>['studio:design'],
  pinReasons:()=>[],
  hasUnsavedChanges:unsaved,
  async snapshot(){
   const payload=designCheckpointPayload();
   return sealSnapshot({studioId:'design',schemaVersion:DESIGN_SNAPSHOT_SCHEMA,revision:editRevision,payload,bytesEstimate:256+estimateValueBytes(payload)});
  },
  async suspend(){release();},
  async resume(snapshot){
   verifySnapshot(snapshot,'design',DESIGN_SNAPSHOT_SCHEMA);
   const p=snapshot.payload as DesignState;
   if(!Array.isArray(p.past)||!Array.isArray(p.future)||!Array.isArray(p.selectedIds))throw new Error('design checkpoint is malformed');
   restoreDesignCheckpoint(p);
  },
  async dispose(){if(unsaved())throw new Error('Refusing to evict an unsaved design document');release();},
 };
}
registerLifecycleAdapter('design',createDesignLifecycleAdapter);
