import type * as Y from 'yjs';
/**
 * Versioned shared-model schema (collab concept section 9.7). The project Y.Doc carries a
 * root map `meta` with `schema` so a future layout change can be detected and migrated
 * instead of silently corrupting a session between different builds.
 *
 * schema 1 layout:
 *   files: Y.Map<path, Y.Text>          shared text files (see collabDoc.ts)
 *   media: Y.Map<path, {hash,size}>     blob manifest (blobSync.ts)
 *   meta:  Y.Map                        { schema: 1 } - this stamp
 * Reserved for office sync (not yet written by any build): `office/<path>` root maps.
 */
export const SHARED_SCHEMA_VERSION=1;
const META_KEY='meta';const SCHEMA_FIELD='schema';

/** Host-side: stamp a fresh shared doc. Idempotent; throws when a different version is already there. */
export function stampSchema(doc:Y.Doc):void{
 const meta=doc.getMap<unknown>(META_KEY);const existing=meta.get(SCHEMA_FIELD);
 if(existing!==undefined&&existing!==SHARED_SCHEMA_VERSION)throw new Error(`Shared doc already stamped with schema ${String(existing)}`);
 if(existing===undefined)doc.transact(()=>{meta.set(SCHEMA_FIELD,SHARED_SCHEMA_VERSION);},'schema');
}
/** The stamped version, or null on a doc from a build before this stamp existed. */
export function schemaOf(doc:Y.Doc):number|null{
 const v=doc.getMap<unknown>(META_KEY).get(SCHEMA_FIELD);
 return typeof v==='number'&&Number.isInteger(v)?v:null;
}
export type SchemaState='ok'|'legacy'|'mismatch';
/** ok = current version; legacy = no stamp (pre-schema build, text collab still fine); mismatch = a different version wrote this doc. */
export function schemaState(doc:Y.Doc):SchemaState{
 const v=schemaOf(doc);
 return v===null?'legacy':v===SHARED_SCHEMA_VERSION?'ok':'mismatch';
}
