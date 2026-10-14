import {parseInterfaceDocument,serializeInterfaceDocument,type InterfaceDocument,type InterfaceNode} from './model';
import {detachInstance,synchronizeInstances} from './components';
import type {InterfaceComponent} from './schema';

export const MAX_LIBRARY_MATCHES=32;
const MAX_LISTED=8;
/** Case-insensitive substring filter over component and variant names; capped so long libraries stay scannable. */
export function filterInterfaceComponents(doc:InterfaceDocument,query:string):InterfaceComponent[]{
 const all=doc.components??[];const q=query.trim().toLowerCase();
 const matches=q?all.filter(c=>c.name.toLowerCase().includes(q)||c.variants.some(v=>v.name.toLowerCase().includes(q))):all;
 return matches.slice(0,MAX_LIBRARY_MATCHES);
}
function subtree(doc:InterfaceDocument,rootId:string):InterfaceNode[]{const out:InterfaceNode[]=[];const walk=(id:string)=>{const n=doc.nodes.find(x=>x.id===id);if(!n)return;out.push(n);n.children.forEach(walk);};walk(rootId);return out;}
function instancesOf(doc:InterfaceDocument,componentId:string):InterfaceNode[]{return doc.nodes.filter(n=>n.instance?.componentId===componentId);}
export interface ComponentUsage {pageId:string;pageName:string;count:number;instanceIds:string[];}
/** "Where used": instances of a component grouped by page; ids capped, counts stay exact. */
export function componentUsage(doc:InterfaceDocument,componentId:string):ComponentUsage[]{
 const out:ComponentUsage[]=[];
 for(const id of instancesOf(doc,componentId).map(n=>n.id)){const page=doc.pages.find(p=>p.id===doc.nodes.find(n=>n.id===id)!.pageId);let entry=out.find(e=>e.pageId===page?.id);if(!entry){entry={pageId:page?.id??'',pageName:page?.name??'?',count:0,instanceIds:[]};out.push(entry);}entry.count++;if(entry.instanceIds.length<MAX_LISTED)entry.instanceIds.push(id);}
 return out;
}
/** Detaches every unlocked instance of a component in one transaction; locked instances stay untouched. */
export function detachAllInstances(doc:InterfaceDocument,componentId:string):number{
 let detached=0;for(const n of instancesOf(doc,componentId)){try{detachInstance(doc,n.id);detached++;}catch{/* locked instances stay */}}
 if(!detached)throw Error('No unlocked instances to detach.');return detached;
}
export interface InstanceUpdatePreview {instanceId:string;name:string;warnings:string[];}
/** Dry-run sync on an isolated copy: which instances carry stale overrides or warnings after master edits. Document stays untouched. */
export function previewInstanceUpdates(doc:InterfaceDocument,componentId:string):{total:number;listed:InstanceUpdatePreview[]}{
 const copy=parseInterfaceDocument(serializeInterfaceDocument(doc));const diagnostics=synchronizeInstances(copy).filter(d=>copy.nodes.find(n=>n.id===d.instanceId)?.instance?.componentId===componentId);
 const byInstance=new Map<string,string[]>();for(const d of diagnostics){const list=byInstance.get(d.instanceId)??[];list.push(d.message);byInstance.set(d.instanceId,list);}
 const all=[...byInstance.entries()].map(([instanceId,warnings])=>({instanceId,name:doc.nodes.find(n=>n.id===instanceId)?.name??'?',warnings}));
 return {total:all.length,listed:all.slice(0,MAX_LISTED)};
}
/** Drops overrides whose slot no longer exists in the instance's current variant (after master edits); returns removed count. */
export function pruneStaleOverrides(doc:InterfaceDocument,componentId:string):number{
 let removed=0;
 for(const root of instancesOf(doc,componentId)){const variant=doc.components?.find(c=>c.id===componentId)?.variants.find(v=>v.id===root.instance!.variantId);if(!variant)continue;const slots=new Set(subtree(doc,variant.rootId).map(n=>n.componentSlot));const keep=root.instance!.overrides.filter(o=>slots.has(o.slot));removed+=root.instance!.overrides.length-keep.length;root.instance!.overrides=keep;}
 if(!removed)throw Error('All instances are in sync.');return removed;
}
