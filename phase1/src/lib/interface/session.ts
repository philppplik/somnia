import {t} from '../i18n';
import {useSyncExternalStore} from 'react';
import {createInterfaceDocument,parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument} from './model';
export const RECOVERY_KEY='somnia.interface.recovery.v1';
export interface InterfaceState {document:InterfaceDocument|null;pageId:string|null;selection:string|null;dirty:boolean;past:InterfaceDocument[];future:InterfaceDocument[];recoveryError:string;notice:string;}
const empty=():InterfaceState=>({document:null,pageId:null,selection:null,dirty:false,past:[],future:[],recoveryError:'',notice:''});
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export interface RecoveryStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
/** Pure session factory makes persistence failures and rollback testable without a browser. */
export function createInterfaceSession(storage?:RecoveryStorage){
 let state=empty();const listeners=new Set<()=>void>();
 const emit=(next:InterfaceState,persist=true)=>{
  state=freeze(next);
  if(storage&&persist)try{if(state.document)storage.setItem(RECOVERY_KEY,JSON.stringify({version:1,document:state.document,dirty:state.dirty,pageId:state.pageId}));else storage.removeItem(RECOVERY_KEY);}catch{state=freeze({...state,recoveryError:'Recovery could not be written. Save a snapshot before closing.'});}
  listeners.forEach(f=>f());
 };
 const load=(document:InterfaceDocument,dirty=false)=>{const checked=freeze(parseInterfaceDocument(serializeInterfaceDocument(document)));emit({...empty(),document:checked,pageId:checked.pages[0].id,dirty});};
 const reconcile=(doc:InterfaceDocument)=>({pageId:doc.pages.some(p=>p.id===state.pageId)?state.pageId:doc.pages[0].id,selection:doc.nodes.some(n=>n.id===state.selection)?state.selection:null});
 return {
  get:()=>state,notice:(notice:string)=>emit({...state,notice},false),subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},load,
  start:()=>load(createInterfaceDocument(),true),clear:()=>emit(empty()),
  select(id:string|null){if(id!==null&&!state.document?.nodes.some(n=>n.id===id&&n.pageId===state.pageId))return;emit({...state,selection:id},false);},
  page(id:string){if(state.document?.pages.some(p=>p.id===id))emit({...state,pageId:id,selection:null});},
  /** Draft validation runs before emit, so a thrown edit leaves document/history/recovery unchanged. */
  transact(edit:(draft:InterfaceDocument)=>void){
   const before=state.document;if(!before)return;
   const draft=structuredClone(before);edit(draft);draft.revision=before.revision;
   if(JSON.stringify(draft)===JSON.stringify(before))return;
   draft.revision=before.revision+1;const checked=parseInterfaceDocument(serializeInterfaceDocument(draft));
   emit({...state,...reconcile(checked),document:checked,dirty:true,past:[...state.past.slice(-49),before],future:[]});
  },
  undo(){if(!state.document||!state.past.length)return;const doc={...state.past.at(-1)!,revision:state.document.revision+1};emit({...state,...reconcile(doc),document:doc,dirty:true,past:state.past.slice(0,-1),future:[state.document,...state.future]});},
  redo(){if(!state.document||!state.future.length)return;const doc={...state.future[0],revision:state.document.revision+1};emit({...state,...reconcile(doc),document:doc,dirty:true,past:[...state.past,state.document],future:state.future.slice(1)});},
  markSaved(id:string,revision:number){if(state.document?.id===id&&state.document.revision===revision)emit({...state,dirty:false});},
  recover(){if(!storage||state.document)return false;try{const raw=storage.getItem(RECOVERY_KEY);if(!raw)return false;if(raw.length>5_001_000)throw Error('Recovery record too large.');const saved=JSON.parse(raw);if(saved.version!==1||typeof saved.dirty!=='boolean')throw Error('Invalid recovery record.');const doc=parseInterfaceDocument(JSON.stringify(saved.document));emit({...empty(),document:doc,pageId:doc.pages.some(p=>p.id===saved.pageId)?saved.pageId:doc.pages[0].id,dirty:saved.dirty},false);return true;}catch{emit({...state,recoveryError:'Recovery is unreadable. It was kept intact; open a saved snapshot.'},false);return false;}},
 };
}
const storage:RecoveryStorage|undefined=typeof window==='undefined'?undefined:{getItem:k=>window.localStorage.getItem(k),setItem:(k,v)=>window.localStorage.setItem(k,v),removeItem:k=>window.localStorage.removeItem(k)};
export const interfaceSession=createInterfaceSession(storage);
export const useInterfaceState=()=>useSyncExternalStore(interfaceSession.subscribe,interfaceSession.get,interfaceSession.get);
export function startInterface(){if(!interfaceSession.get().dirty||typeof window!=='undefined'&&window.confirm(t('interface.replace')))interfaceSession.start();}
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(interfaceSession.get().dirty){event.preventDefault();event.returnValue='';}});
