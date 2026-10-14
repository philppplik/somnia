import * as Y from 'yjs';
import {assertSafeProjectPath} from '../paths';
/**
 * Shared model for one co-edited deck (concept 3.2, CO3): meta stamps engine+schema+base hash,
 * `ops` is the LWW op journal. Every entry is a deterministic bytes->bytes op; peers apply the
 * journal in CRDT order on identical base bytes and converge without OT.
 */
export const SLIDES_MODEL_SCHEMA=1;
export interface SlidesSharedMeta{schema:number;engine:string;baseHash:string}
export interface SlidesModel{
 readonly doc:Y.Doc;
 readonly meta:Y.Map<unknown>;
 readonly ops:Y.Array<unknown>;
}
const root=(doc:Y.Doc,path:string)=>{assertSafeProjectPath(path);return doc.getMap<unknown>(`office/${path}`);};
/** Host-side: stamp the model for a deck shared into the session. Idempotent for the same file. */
export function seedSlidesModel(doc:Y.Doc,path:string,baseHash:string):SlidesModel{
 const r=root(doc,path);
 let meta=r.get('meta') as Y.Map<unknown>|undefined;
 doc.transact(()=>{
  if(!meta){meta=new Y.Map<unknown>();r.set('meta',meta);}
  meta!.set('schema',SLIDES_MODEL_SCHEMA);meta!.set('engine','slides-deck');meta!.set('baseHash',baseHash);
  if(!r.get('ops'))r.set('ops',new Y.Array<unknown>());
 },'slides-model-seed');
 return openSlidesModel(doc,path);
}
export function openSlidesModel(doc:Y.Doc,path:string):SlidesModel{
 const r=root(doc,path);
 return{doc,meta:r.get('meta') as Y.Map<unknown>,ops:r.get('ops') as Y.Array<unknown>};
}
export function slidesModelMeta(m:SlidesModel):SlidesSharedMeta|null{
 if(!m.meta)return null;
 const schema=m.meta.get('schema'),engine=m.meta.get('engine'),baseHash=m.meta.get('baseHash');
 if(schema!==SLIDES_MODEL_SCHEMA||engine!=='slides-deck'||typeof baseHash!=='string'||!/^[0-9a-f]{64}$/.test(baseHash))return null;
 return{schema,engine,baseHash};
}
/** Ops the journal may carry (worker client methods, JSON-serialisable args; no inline picture bytes in CO3). */
export const SLIDES_OP_KINDS=['slideEdit','reorder','shapeBounds','shapesBounds','arrange','table','style','notes','group','ungroup','transition','formatText','boxEdit','newSlide','textEdits'] as const;
export type SlidesOpKind=typeof SLIDES_OP_KINDS[number];
export interface SlidesOpEntry{fn:SlidesOpKind;args:unknown[]}
const JSON_MAX=64_000;
/** Untrusted journal entry -> a checked op, or null (dropped everywhere identically: convergence holds). */
export function cleanSlidesOp(raw:unknown):SlidesOpEntry|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const e=raw as Record<string,unknown>;
 if(typeof e.fn!=='string'||!(SLIDES_OP_KINDS as readonly string[]).includes(e.fn))return null;
 if(!Array.isArray(e.args)||e.args.length>8)return null;
 let size=0;try{size=JSON.stringify(e.args).length;}catch{return null;}
 if(size>JSON_MAX)return null;
 return{fn:e.fn as SlidesOpKind,args:e.args};
}
/** Append one local op; the journal is append-only (compaction via byte snapshots is a later slice). */
export function appendSlidesOp(m:SlidesModel,entry:SlidesOpEntry,origin:unknown):void{
 m.doc.transact(()=>{m.ops.push([entry]);},origin);
}
/** Current journal as checked entries; garbage is skipped, order preserved. */
export function sharedSlidesOps(m:SlidesModel):SlidesOpEntry[]{
 const out:SlidesOpEntry[]=[];
 m.ops.forEach(raw=>{const e=cleanSlidesOp(raw);if(e)out.push(e);});
 return out;
}
