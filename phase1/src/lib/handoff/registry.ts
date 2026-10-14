/** CA1: shared "Open in studio" handoff registry — object refs, routes, origins and pending round-trip payloads. */
export interface StudioObjectRef{studio:string;kind:string;id:string;label:string;/** Originating media file, so a round trip can reactivate it. */file:string}
export interface HandoffRoute{targetStudio:string;titleKey:string;open(ref:StudioObjectRef):Promise<void>}
const key=(studio:string,kind:string)=>`${studio}:${kind}`;
export const handoffRefId=(ref:Pick<StudioObjectRef,'studio'|'kind'|'id'>)=>key(ref.studio,ref.kind)+':'+ref.id;
// Cross-entry-point safety: handoff state must be one instance even if a dev server double-instantiates the module.
const shared=(globalThis as unknown as {__somniaHandoff?:{routes:Map<string,HandoffRoute[]>;origins:Map<string,StudioObjectRef>;pending:Map<string,PendingReturn>;version:number;listeners:Set<()=>void>}});
const store=shared.__somniaHandoff??={routes:new Map(),origins:new Map(),pending:new Map(),version:0,listeners:new Set<()=>void>()};
const routes=store.routes;
/** Renderers subscribe: origins and pending payloads are module state, so a change must re-render the bars reading it. */
export function subscribeHandoff(fn:()=>void):()=>void{store.listeners.add(fn);return()=>store.listeners.delete(fn);}
const emit=()=>{store.version++;for(const fn of [...store.listeners])fn();};
export const handoffVersion=()=>store.version;
export function registerHandoffRoute(studio:string,kind:string,route:HandoffRoute):()=>void{
 const k=key(studio,kind);const list=routes.get(k)??[];list.push(route);routes.set(k,list);
 return()=>{const cur=routes.get(k)??[];const next=cur.filter(r=>r!==route);if(next.length)routes.set(k,next);else routes.delete(k);};
}
export function handoffRoutesFor(studio:string,kind:string):readonly HandoffRoute[]{return routes.get(key(studio,kind))??[];}
const origins=store.origins;
export function setHandoffOrigin(file:string,origin:StudioObjectRef):void{origins.set(file,origin);emit();}
export function handoffOrigin(file:string):StudioObjectRef|undefined{return origins.get(file);}
export function clearHandoffOrigin(file:string):void{if(origins.delete(file))emit();}
export interface PendingPayload{rows?:string[][];image?:Uint8Array}
export interface PendingReturn{origin:StudioObjectRef;file:string;rows?:string[][];image?:Uint8Array}
const pending=store.pending;
/** One pending payload per created file; keyed by file so a second trip replaces the first. */
export function setPendingReturn(file:string,origin:StudioObjectRef,payload:PendingPayload):void{pending.set(file,{origin,file,...payload});emit();}
export function pendingReturnsFor(refId:string):readonly PendingReturn[]{return [...pending.values()].filter(p=>handoffRefId(p.origin)===refId);}
export function clearPendingReturn(file:string):void{if(pending.delete(file))emit();}
