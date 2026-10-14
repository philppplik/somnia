import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {SHARED_SCHEMA_VERSION,stampSchema,schemaOf,schemaState} from './schema';

test('stamp writes schema 1 and is idempotent',()=>{
 const doc=new Y.Doc();
 stampSchema(doc);stampSchema(doc);
 assert.equal(schemaOf(doc),SHARED_SCHEMA_VERSION);
 assert.equal(schemaState(doc),'ok');
});
test('unstamped doc reads as legacy',()=>{
 assert.equal(schemaOf(new Y.Doc()),null);
 assert.equal(schemaState(new Y.Doc()),'legacy');
});
test('stamp survives a sync round-trip',()=>{
 const a=new Y.Doc();stampSchema(a);a.getMap('files').set('a.txt',new Y.Text());
 const b=new Y.Doc();Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
 assert.equal(schemaState(b),'ok');
});
test('a foreign version is a mismatch and re-stamping throws',()=>{
 const doc=new Y.Doc();doc.getMap('meta').set('schema',SHARED_SCHEMA_VERSION+1);
 assert.equal(schemaState(doc),'mismatch');
 assert.throws(()=>stampSchema(doc),/schema 2/);
});
