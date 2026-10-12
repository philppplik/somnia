import type {StudioContext} from './types';
import {EMPTY_STUDIO_CONTEXT} from './types';
/**
 * Pure store for the merged StudioContext. The canvas calls `report(partial)`; the shell reads `get()`.
 * Reports are keyed by an owner token so a stale canvas (tab switch, source replaced) cannot overwrite the
 * context of the current owner. M5 bridges this with the existing uiContextStore (it does not replace it).
 */
export type ContextPatch=Partial<Omit<StudioContext,'selection'|'services'>>&{selection?:Partial<StudioContext['selection']>;services?:Record<string,boolean>};
export function mergeContext(base:StudioContext,patch:ContextPatch):StudioContext{
 const selection={...base.selection,...patch.selection} as StudioContext['selection'];
 if(selection.kind==='none')selection.count=0;
 return {...base,...patch,selection,services:{...base.services,...patch.services}} as StudioContext;
}
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
export function createContextStore(initial:StudioContext=EMPTY_STUDIO_CONTEXT){
 let ctx=initial,owner:symbol|null=null;const subs=new Set<()=>void>();
 const emit=()=>subs.forEach(f=>f());
 return {
  get:()=>ctx,
  subscribe(fn:()=>void){subs.add(fn);return()=>{subs.delete(fn);};},
  /** Take ownership for a studio/document. Resets the context. Returns a release function and a bound reporter. */
  claim(studio:string,document?:StudioContext['document']){
   const token=Symbol('ctx');owner=token;
   ctx={...EMPTY_STUDIO_CONTEXT,studio,document,selection:{kind:'none',count:0},services:{}};emit();
   return {
    report:(patch:ContextPatch)=>{if(owner!==token)return false;const next=mergeContext(ctx,patch);if(same(next,ctx))return true;ctx=next;emit();return true;},
    release:()=>{if(owner!==token)return;owner=null;ctx={...EMPTY_STUDIO_CONTEXT};emit();},
    isCurrent:()=>owner===token,
   };
  },
 };
}
export type ContextStore=ReturnType<typeof createContextStore>;
