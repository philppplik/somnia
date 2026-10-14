import * as Y from 'yjs';
import {assertSafeProjectPath} from '../paths';
/**
 * Shared model for one co-edited document (concept 3.2, CO4): meta stamps engine+schema+base hash,
 * `ops` is the LWW op journal. Entries are resolved DocumentsEngine calls (absolute positions);
 * peers apply the journal in CRDT order on the same base bytes and converge without OT.
 */
export const DOCS_MODEL_SCHEMA=1;
export interface DocsSharedMeta{schema:number;engine:string;baseHash:string}
export interface DocsModel{
 readonly doc:Y.Doc;
 readonly meta:Y.Map<unknown>;
 readonly ops:Y.Array<unknown>;
}
const root=(doc:Y.Doc,path:string)=>{assertSafeProjectPath(path);return doc.getMap<unknown>(`office/${path}`);};
/** Host-side: stamp the model for a document going into the session. Idempotent for the same file. */
export function seedDocsModel(doc:Y.Doc,path:string,baseHash:string):DocsModel{
 const r=root(doc,path);
 let meta=r.get('meta') as Y.Map<unknown>|undefined;
 doc.transact(()=>{
  if(!meta){meta=new Y.Map<unknown>();r.set('meta',meta);}
  meta!.set('schema',DOCS_MODEL_SCHEMA);meta!.set('engine','docs');meta!.set('baseHash',baseHash);
  if(!r.get('ops'))r.set('ops',new Y.Array<unknown>());
 },'docs-model-seed');
 return openDocsModel(doc,path);
}
export function openDocsModel(doc:Y.Doc,path:string):DocsModel{
 const r=root(doc,path);
 return{doc,meta:r.get('meta') as Y.Map<unknown>,ops:r.get('ops') as Y.Array<unknown>};
}
export function docsModelMeta(m:DocsModel):DocsSharedMeta|null{
 if(!m.meta)return null;
 const schema=m.meta.get('schema'),engine=m.meta.get('engine'),baseHash=m.meta.get('baseHash');
 if(schema!==DOCS_MODEL_SCHEMA||engine!=='docs'||typeof baseHash!=='string'||!/^[0-9a-f]{64}$/.test(baseHash))return null;
 return{schema,engine,baseHash};
}
/** Mutating DocumentsEngine kinds the journal may carry. Reads, render, save/export, snapshots and
 *  insertImage (inline bytes) stay out. */
export const DOCS_OP_KINDS=['insert','replace','split','merge','format','paraFormat','paraStyle','setList','restartList','continueList','listLevel','insertToc','updateToc','removeToc','upsertStyle','deleteStyle','tableEdit','tableStyle','colWidth','imageEdit','setListOptions','setProperties','setPageSetup','addComment','replyComment','resolveComment','deleteComment','setHeaderFooter','insertTable'] as const;
export type DocsOpKind=typeof DOCS_OP_KINDS[number];
export interface DocsOpEntry{kind:DocsOpKind;params:Record<string,unknown>;inverse?:unknown}
const JSON_MAX=64_000,KEY_MAX=24;
/** Untrusted journal entry -> a checked op, or null (dropped everywhere identically: convergence holds). */
export function cleanDocsOp(raw:unknown):DocsOpEntry|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const e=raw as Record<string,unknown>;
 if(typeof e.kind!=='string'||!(DOCS_OP_KINDS as readonly string[]).includes(e.kind))return null;
 if(!e.params||typeof e.params!=='object'||Array.isArray(e.params))return null;
 if(Object.keys(e.params).length>KEY_MAX)return null;
 try{
  if(JSON.stringify(e.params).length>JSON_MAX)return null;
  if(e.inverse!==undefined&&JSON.stringify(e.inverse).length>JSON_MAX)return null;
 }catch{return null;}
 return{kind:e.kind as DocsOpKind,params:e.params as Record<string,unknown>,...(e.inverse!==undefined?{inverse:e.inverse}:{})};
}
/** Append one local op; the journal is append-only (compaction via snapshots is a later slice). */
export function appendDocsOp(m:DocsModel,entry:DocsOpEntry,origin:unknown):void{
 m.doc.transact(()=>{m.ops.push([entry]);},origin);
}
