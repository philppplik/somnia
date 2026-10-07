import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeCredentialStore} from './testSupport/fakeCredentialStore';
import {SERVICE} from './testSupport/referenceSubject';
export type Migrator=(store:FakeCredentialStore)=>void|Promise<void>;
/** Storage migration contract: legacy API-key entries survive every failure mode and an OAuth connection can coexist with them. */
export function defineMigrationSuite(prefix:string,migrate:Migrator,keyFor:(store:FakeCredentialStore,provider:string)=>string|null){
 const seeded=()=>{const s=new FakeCredentialStore();s.set(SERVICE,'openrouter','sk-or-fixture');s.set(SERVICE,'openai','sk-openai-fixture');s.set(SERVICE,'claude','sk-ant-fixture');return s;};
 test(`${prefix}: migrated keys stay readable through the new layout`,async()=>{
  const s=seeded();await migrate(s);
  assert.equal(keyFor(s,'openai'),'sk-openai-fixture');assert.equal(keyFor(s,'claude'),'sk-ant-fixture');assert.equal(keyFor(s,'openrouter'),'sk-or-fixture');
 });
 test(`${prefix}: idempotent - running twice changes nothing`,async()=>{
  const s=seeded();await migrate(s);const a=s.dump();await migrate(s);assert.equal(s.dump(),a);
 });
 test(`${prefix}: a write failing at ANY step never loses a key; a retry completes`,async()=>{
  for(let n=1;n<=9;n++){
   const s=seeded();s.failWriteAt=n;
   try{await migrate(s);}catch{/* failure may surface */}
   for(const p of ['openrouter','openai','claude'])assert.notEqual(keyFor(s,p),null,`key ${p} lost when write ${n} failed`);
   s.failWriteAt=null;await migrate(s);
   for(const p of ['openrouter','openai','claude'])assert.notEqual(keyFor(s,p),null,`key ${p} lost after retry (failed write ${n})`);
  }
 });
 test(`${prefix}: locked store raises, deletes nothing`,async()=>{
  const s=seeded();const snap=s.snapshot();s.locked=true;
  await assert.rejects(Promise.resolve().then(()=>migrate(s)));
  s.locked=false;assert.deepEqual([...s.snapshot()],[...snap]);
 });
 test(`${prefix}: size-limited backend (Windows ~2.5 KB) accepts the migrated records`,async()=>{
  const s=seeded();s.maxBytes=2560;await migrate(s);assert.equal(keyFor(s,'openai'),'sk-openai-fixture');
 });
 test(`${prefix}: an existing OAuth connection record is untouched by the migration`,async()=>{
  const s=seeded();s.set(SERVICE,'connection/openai-chatgpt','{"v":2,"fixture":true}');await migrate(s);
  assert.equal(s.get(SERVICE,'connection/openai-chatgpt'),'{"v":2,"fixture":true}');
 });
}
