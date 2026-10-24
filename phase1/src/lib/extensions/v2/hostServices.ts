import {type BrokerServices} from '../broker';
import {ExtensionError} from '../contracts/v2/api';
import type {EditResult,Json,ProjectChange,ProjectFile,SelectionSnapshot} from '../contracts/v2/api';
import {modeFor} from '../../languages';
import {countStorageKeys,MAX_STORAGE_KEYS,storagePrefix} from '../storageKeys';

/** Minimal store surface the v2 read-only host needs; the real appStore satisfies it. */
export interface StoreAdapter {
 getState():{files:Record<string,string>;nodes:unknown[];designFile:string;selectedElementId:string|null};
 subscribe(fn:()=>void):()=>void;
}
/** Where host events go: the owning supervisor's deliverEvent, bound per extension. */
export interface HostEventSink {deliver(callbackId:number,value:Json,kind:'project'|'selection'|'panel'):void}

/**
 * Revision tokens: full lowercase SHA-256 hex (64 chars) of the UTF-8 file content.
 * Not truncated and not a fast non-crypto hash: the token is the stale-edit guard of the
 * v2 edit contract, so collision resistance must not depend on workload size. Tokens are
 * cached per path and recomputed only when the content string reference changes; state
 * updates replace changed strings, so reference equality is a valid freshness check.
 */
const enc=new TextEncoder();
/** Full lowercase SHA-256 hex of a UTF-8 string - also the package-digest primitive for bundled fixtures. */
export async function sha256Hex(text:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',enc.encode(text));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

const SELECTION_THROTTLE_MS=100;

/**
 * appStore-backed BrokerServices for the v2 read-only host slice.
 * Boundaries (do not widen in this slice):
 * - commit() always rejects: the v2 write path stays locked, matching the PoC boundary.
 * - panels: declarative fixtures have no message channel yet; postPanel and panel
 *   subscriptions reject with E_INVALID_ARGUMENT naming the slice.
 * - Storage stays in the v1 localStorage namespace with the existing per-extension cap.
 */
export function appStoreServices(opts:{extensionId:string;store:StoreAdapter;notify:(text:string)=>void;events:HostEventSink;storage?:Storage}):BrokerServices&{dispose():void}{
 const {extensionId,store,notify,events}=opts;
 const local=opts.storage??(globalThis.localStorage as Storage|undefined);
 const needLocal=():Storage=>{if(!local)throw new ExtensionError('E_INVALID_ARGUMENT','Storage is unavailable in this host environment.');return local;};
 const prefix=storagePrefix(extensionId);
 const revisions=new Map<string,{content:string;hash:string}>();
 const revisionOf=async(path:string,content:string):Promise<string>=>{
  const cached=revisions.get(path);
  if(cached&&cached.content===content)return cached.hash;
  const hash=await sha256Hex(content);revisions.set(path,{content,hash});return hash;
 };
 const fileText=(path:string):string=>{
  const text=store.getState().files[path];
  if(text===undefined)throw new ExtensionError('E_INVALID_ARGUMENT',`File not found in project: ${path}`);
  return text;
 };
 const selectionSnapshot=async():Promise<SelectionSnapshot|null>=>{
  const s=store.getState();const id=s.selectedElementId;if(!id)return null;
  let hit:{id:string;tag:string}|null=null;
  const walk=(ns:Array<{id:string;tag:string;children?:unknown[]}>):void=>ns.forEach(n=>{if(n.id===id)hit={id:n.id,tag:n.tag};if(Array.isArray(n.children))walk(n.children as never);});
  walk(s.nodes as never);
  if(!hit)return null;
  const doc=s.designFile;
  return {nodeId:(hit as {id:string}).id,tag:(hit as {tag:string}).tag,documentPath:doc,revision:await revisionOf(doc,fileText(doc))};
 };
 // One store subscription per extension host, fanning out to kind listeners.
 const projectListeners=new Set<(change:ProjectChange)=>void>();
 const selectionListeners=new Set<(snap:SelectionSnapshot|null)=>void>();
 // Snapshot copy: the app may replace the files record or mutate entries; comparing
 // against our own copy catches both. String contents stay shared by reference.
 let lastFiles:Record<string,string>={...store.getState().files};
 let lastSelection:string|null=store.getState().selectedElementId;
 let flushing=false;
 let pendingPaths:Set<string>|null=null;
 let lastSelectionSent=0;
 let selectionTimer:ReturnType<typeof setTimeout>|null=null;
 const diffFiles=(prev:Record<string,string>,next:Record<string,string>):string[]=>{
  const changed=new Set<string>();
  for(const p of Object.keys(next))if(prev[p]!==next[p])changed.add(p);
  for(const p of Object.keys(prev))if(!(p in next))changed.add(p);
  return [...changed];
 };
 const flushProject=():void=>{
  if(flushing){return;}
  if(!pendingPaths||!pendingPaths.size){pendingPaths=null;return;}
  flushing=true;const paths=[...pendingPaths];pendingPaths=null;
  void (async()=>{
   const files=store.getState().files;const revisionsOut:Record<string,string>={};
   for(const p of paths)if(p in files)revisionsOut[p]=await revisionOf(p,files[p]);
   const change:ProjectChange={paths,revisions:revisionsOut};
   for(const fn of projectListeners)fn(change);
  })().finally(()=>{flushing=false;if(pendingPaths&&pendingPaths.size)flushProject();});
 };
 const emitSelection=():void=>{
  lastSelectionSent=Date.now();
  void selectionSnapshot().then(snap=>{for(const fn of selectionListeners)fn(snap);});
 };
 const unsubscribeStore=store.subscribe(()=>{
  const s=store.getState();
  const changed=diffFiles(lastFiles,s.files);
  if(changed.length){lastFiles={...s.files};if(projectListeners.size){pendingPaths=pendingPaths??new Set();for(const p of changed)pendingPaths.add(p);flushProject();}}
  if(s.selectedElementId!==lastSelection){
   lastSelection=s.selectedElementId;
   if(selectionListeners.size){
    const wait=SELECTION_THROTTLE_MS-(Date.now()-lastSelectionSent);
    if(wait<=0)emitSelection();
    else if(!selectionTimer)selectionTimer=setTimeout(()=>{selectionTimer=null;emitSelection();},wait);
   }
  }
 });
 return {
  listFiles:async()=>{const files=store.getState().files;const out:ProjectFile[]=[];for(const [path,text] of Object.entries(files))out.push({path,language:modeFor(path),revision:await revisionOf(path,text)});return out;},
  readFile:async path=>({text:fileText(path),revision:await revisionOf(path,fileText(path))}),
  selection:selectionSnapshot,
  commit:async():Promise<EditResult>=>{throw new ExtensionError('E_PERMISSION_DENIED','The v2 write path stays locked in this read-only host (editor.applyOperations is not available).');},
  storage:{
   entries:async()=>{const l=needLocal();const out:Record<string,string>={};for(let i=0;i<l.length;i++){const k=l.key(i)!;if(k.startsWith(prefix))out[k.slice(prefix.length)]=l.getItem(k)!;}return out;},
   set:async(key,value)=>{const l=needLocal();if(l.getItem(prefix+key)===null&&countStorageKeys(extensionId,l)>=MAX_STORAGE_KEYS)throw new ExtensionError('E_RESOURCE_LIMIT',`Storage is limited to ${MAX_STORAGE_KEYS} keys per extension.`);l.setItem(prefix+key,value);},
   delete:async key=>{needLocal().removeItem(prefix+key);},
  },
  notify,
  postPanel:()=>{throw new ExtensionError('E_INVALID_ARGUMENT','v2 panel message channels are not part of the read-only host slice (declarative panels only).');},
  subscribe:(kind,callbackId,panelId)=>{
   if(kind==='panel')throw new ExtensionError('E_INVALID_ARGUMENT',`v2 panel subscriptions are not part of the read-only host slice (panel ${panelId??'?'}).`);
   if(kind==='project'){const fn=(change:ProjectChange)=>events.deliver(callbackId,change as unknown as Json,'project');projectListeners.add(fn);return()=>{projectListeners.delete(fn);};}
   const fn=(snap:SelectionSnapshot|null)=>events.deliver(callbackId,snap as unknown as Json,'selection');selectionListeners.add(fn);return()=>{selectionListeners.delete(fn);};
  },
  dispose():void{unsubscribeStore();projectListeners.clear();selectionListeners.clear();if(selectionTimer)clearTimeout(selectionTimer);revisions.clear();},
 };
}
