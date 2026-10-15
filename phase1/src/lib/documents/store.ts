import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import type {RiskId} from './inspect';
import type {DocBlock} from './edit';
import type {PageSize} from './protocol';
export type DocStatus='idle'|'loading'|'ready'|'error';
export interface DocumentsState{status:DocStatus;name:string;error:string;pages:number;zoom:number;risks:readonly RiskId[];words:number;engineMs:number|null;saving:boolean;/** Spelling and grammar marks on the pages. */proofing:boolean;/** Formatting has been copied and can be pasted. */painted:boolean;blocks:readonly DocBlock[];pageSizes:readonly PageSize[];rev:number;canUndo:boolean;canRedo:boolean;editError:string;edited:boolean;caret:Caret|null;caretLocked:boolean;imageBlock:number|null;imageRects:readonly import('./protocol').Rect5[];find:FindState;findRects:readonly import('./protocol').Rect5[];format:import('./protocol').FormatState|null;para:import('./protocol').ParaState|null;pendingFormat:{block:number;off:number;patch:import('./protocol').FormatPatch}|null;caretBox:import('./protocol').CaretBox|null;selRects:readonly import('./protocol').Rect5[];notice:''|'undoReleased'|'lost'|'linkCopied'}
/** Selection in one top-level paragraph; offsets are UTF-8 bytes of its current text. head is the moving end. */
/** `block` holds the head. `anchorBlock` is set only when the selection starts in another paragraph. */
/** Find bar state: `current` is 1-based and 0 while the selection is not on a match. */
export interface FindState{open:boolean;query:string;matchCase:boolean;wholeWord:boolean;count:number;current:number;capped:boolean}
export interface Caret{block:number;anchor:number;head:number;anchorBlock?:number}
const initial:DocumentsState={status:'idle',name:'',error:'',pages:0,zoom:1,risks:[],words:0,engineMs:null,saving:false,proofing:false,painted:false,blocks:[],pageSizes:[],rev:0,canUndo:false,canRedo:false,editError:'',edited:false,caret:null,caretLocked:false,imageBlock:null,imageRects:[],find:{open:false,query:'',matchCase:false,wholeWord:false,count:0,current:0,capped:false},findRects:[],format:null,para:null,pendingFormat:null,caretBox:null,selRects:[],notice:''};
/** Everything but the zoom, which is a user preference that outlives a document. */
export const INITIAL_VIEW=(({zoom:_zoom,...rest})=>rest)(initial);
let state=initial;const listeners=new Set<()=>void>();
export const getDocumentsState=()=>state;
export function patchDocuments(p:Partial<DocumentsState>,cause?:unknown){if(p.error||p.editError)reportError('documents.engine',cause??(p.error||p.editError),{context:{studio:'documents',file:p.name??state.name}});state={...state,...p};listeners.forEach(l=>l());}
export const resetDocuments=()=>patchDocuments({...initial,zoom:state.zoom});
export const useDocuments=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getDocumentsState,getDocumentsState);
export const ZOOMS=[0.5,0.75,1,1.25,1.5,2] as const;
export const stepZoom=(dir:1|-1)=>{const i=ZOOMS.findIndex(z=>z>=state.zoom-1e-6);const next=ZOOMS[Math.min(ZOOMS.length-1,Math.max(0,(i<0?2:i)+dir))];patchDocuments({zoom:next});};

export const subscribeDocuments=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
