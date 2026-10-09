import type {DesignToolId} from './panelContract';
import {useSyncExternalStore} from 'react';
import {createDesignDocument,parseDesignDocument,type DesignDocument} from './model';
export interface DesignState {document:DesignDocument|null;artboardId:string|null;selection:string|null;selectedIds:string[];tool:DesignToolId;dirty:boolean;past:DesignDocument[];future:DesignDocument[]}
let state:DesignState={document:null,artboardId:null,selection:null,selectedIds:[],tool:'select',dirty:false,past:[],future:[]};
const listeners=new Set<()=>void>();
const emit=(next:DesignState)=>{state=next;listeners.forEach(fn=>fn());};
export const getDesignState=()=>state;
export function useDesignState(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getDesignState,getDesignState);}
export function startDesign(){const doc=createDesignDocument();loadDesign(doc,true);}
export function loadDesign(doc:DesignDocument,dirty=false){const checked=parseDesignDocument(JSON.stringify(doc));emit({document:checked,artboardId:checked.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty,past:[],future:[]});}
export function selectDesignNode(selection:string|null,additive=false){const selectedIds=selection===null?[]:additive?(state.selectedIds.includes(selection)?state.selectedIds.filter(id=>id!==selection):[...state.selectedIds,selection]):[selection];emit({...state,selection:selectedIds.at(-1)??null,selectedIds});}
export function setDesignTool(tool:DesignToolId){emit({...state,tool});}
export function selectArtboard(artboardId:string){if(state.document?.artboards.some(a=>a.id===artboardId))emit({...state,artboardId,selection:null,selectedIds:[]});}
/** Each commit is one undo transaction. Preview drags remain outside the document. */
export function editDesign(edit:(doc:DesignDocument)=>DesignDocument){if(!state.document)return;const next=parseDesignDocument(JSON.stringify(edit(structuredClone(state.document))));if(JSON.stringify(next)===JSON.stringify(state.document))return;emit({...state,document:next,dirty:true,past:[...state.past.slice(-99),state.document],future:[]});}
export function undoDesign(){if(!state.past.length||!state.document)return;const doc=state.past.at(-1)!;emit({...state,document:doc,artboardId:doc.artboards.some(a=>a.id===state.artboardId)?state.artboardId:doc.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty:true,past:state.past.slice(0,-1),future:[state.document,...state.future]});}
export function redoDesign(){if(!state.future.length||!state.document)return;const doc=state.future[0];emit({...state,document:doc,artboardId:doc.artboards.some(a=>a.id===state.artboardId)?state.artboardId:doc.artboards[0].id,selection:null,selectedIds:[],tool:'select',dirty:true,past:[...state.past,state.document],future:state.future.slice(1)});}
/** Download initiation is not proof of a saved file. Keep dirty state honest. */
export function downloadDesign(name:string,body:string,mime:string){const url=URL.createObjectURL(new Blob([body],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(state.document&&state.dirty){event.preventDefault();event.returnValue='';}});
/** Call only after a source-of-truth file write succeeds. */
export function markDesignSaved(){emit({...state,dirty:false});}
/** Caller owns any save/discard confirmation before clearing. */
export function clearDesign(){emit({document:null,artboardId:null,selection:null,selectedIds:[],tool:'select',dirty:false,past:[],future:[]});}
