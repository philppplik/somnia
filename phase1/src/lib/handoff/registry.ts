/** CA1: shared "Open in studio" handoff registry — object refs, routes, origins and pending round-trip payloads. */
export interface StudioObjectRef{studio:string;kind:string;id:string;label:string;/** Originating media file, so a round trip can reactivate it. */file:string}
export interface HandoffRoute{targetStudio:string;titleKey:string;open(ref:StudioObjectRef):Promise<void>}
const key=(studio:string,kind:string)=>`${studio}:${kind}`;
export const handoffRefId=(ref:Pick<StudioObjectRef,'studio'|'kind'|'id'>)=>key(ref.studio,ref.kind)+':'+ref.id;
const routes=new Map<string,HandoffRoute[]>();
export function registerHandoffRoute(studio:string,kind:string,route:HandoffRoute):()=>void{
 const k=key(studio,kind);const list=routes.get(k)??[];list.push(route);routes.set(k,list);
 return()=>{const cur=routes.get(k)??[];const next=cur.filter(r=>r!==route);if(next.length)routes.set(k,next);else routes.delete(k);};
}
export function handoffRoutesFor(studio:string,kind:string):readonly HandoffRoute[]{return routes.get(key(studio,kind))??[];}
const origins=new Map<string,StudioObjectRef>();
export function setHandoffOrigin(file:string,origin:StudioObjectRef):void{origins.set(file,origin);}
export function handoffOrigin(file:string):StudioObjectRef|undefined{return origins.get(file);}
export function clearHandoffOrigin(file:string):void{origins.delete(file);}
export interface PendingReturn{origin:StudioObjectRef;file:string;rows:string[][]}
const pending=new Map<string,PendingReturn>();
/** One pending payload per created file; keyed by file so a second trip replaces the first. */
export function setPendingReturn(file:string,origin:StudioObjectRef,rows:string[][]):void{pending.set(file,{origin,file,rows});}
export function pendingReturnsFor(refId:string):readonly PendingReturn[]{return [...pending.values()].filter(p=>handoffRefId(p.origin)===refId);}
export function clearPendingReturn(file:string):void{pending.delete(file);}
