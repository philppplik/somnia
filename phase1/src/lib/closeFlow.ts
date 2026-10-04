/** Close-with-unsaved-changes flow. The adapter registers what each choice does; the dialog (CloseDialog) only calls it. */
import {patchState} from '../store/appStore';
export type CloseKind='disk'|'memory';
export interface CloseHandlers{saveAndClose?:()=>Promise<void>;discardAndClose:()=>Promise<void>}
let handlers:Partial<Record<CloseKind,CloseHandlers>>={};
export const setCloseHandlers=(kind:CloseKind,h:CloseHandlers|null)=>{if(h)handlers[kind]=h;else delete handlers[kind];};
export const requestClose=(kind:CloseKind)=>patchState({closePrompt:kind});
export const cancelClose=()=>patchState({closePrompt:null});
export async function runClose(kind:CloseKind,choice:'save'|'discard'){const h=handlers[kind];if(!h)return cancelClose();
 try{if(choice==='save'){if(!h.saveAndClose)return;await h.saveAndClose();}else await h.discardAndClose();}
 catch(e){patchState({closePrompt:null,notice:`Close cancelled: ${e instanceof Error?e.message:String(e)}`});}}
/** Browser build: ask the browser to confirm leaving while edits exist. */
export function installBeforeUnload(isDirty:()=>boolean){const fn=(e:BeforeUnloadEvent)=>{if(!isDirty())return;e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);}
