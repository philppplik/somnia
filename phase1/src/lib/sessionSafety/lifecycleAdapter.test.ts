import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {MemoryByteStore,RecoveryStore} from './recoveryStore';
import {SessionCheckpointer} from './checkpointer';
import {flushOnTeardown,registerActiveSession,setRecoveryStoreForTests,discardSession} from './flush';
import {resetRecoveryIndexForTests} from './recoveryIndex';
import {createRecoveryLifecycleAdapter} from './lifecycleAdapter';
const b=(s:string)=>new TextEncoder().encode(s);
let store:RecoveryStore;
beforeEach(()=>{resetRecoveryIndexForTests();store=new RecoveryStore(new MemoryByteStore());setRecoveryStoreForTests(store);});
const flush=(id:string,rev:number,text='x')=>flushOnTeardown({sessionId:id,studio:'sheets',store,sourceFingerprint:'F',revision:rev,format:'xlsx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>b(text)});
test('no sessions: clean, snapshot is an empty reference list, resume verifies',async()=>{
 const a=createRecoveryLifecycleAdapter('sheets',()=>store);assert.equal(a.hasUnsavedChanges!(),false);
 const s=(await a.snapshot!())!;assert.deepEqual((s.payload as {sessions:unknown[]}).sessions,[]);await a.resume!(s);
});
test('after a teardown flush the studio counts as holding unsaved edits and is never disposed',async()=>{
 await flush('sheets:a.xlsx',3);const a=createRecoveryLifecycleAdapter('sheets',()=>store);
 assert.equal(a.hasUnsavedChanges!(),true);await assert.rejects(a.dispose!());
 const s=(await a.snapshot!())!;const p=s.payload as {sessions:{id:string;revision:number}[]};assert.equal(p.sessions[0].id,'sheets:a.xlsx');assert.equal(s.revision,3);
 await a.suspend!();await a.resume!(s);
 assert.ok(a.resourceIds!().includes('sheets:session:a.xlsx'));
});
test('resume fails loudly when the referenced snapshot is gone or replaced',async()=>{
 await flush('sheets:a.xlsx',1);const a=createRecoveryLifecycleAdapter('sheets',()=>store);const s=(await a.snapshot!())!;
 await flush('sheets:a.xlsx',2,'newer');await assert.rejects(a.resume!(s),/missing or changed/);
 await store.discard('sheets:a.xlsx');await assert.rejects(a.resume!(s),/missing or changed/);
 await assert.rejects(a.resume!({...s,checksum:'bad'}),/failed verification/);
});
test('live dirty session is checkpointed by snapshot(); pinned session reports a pin reason and refuses',async()=>{
 let rev=1,fail=false;const cp=new SessionCheckpointer({sessionId:'sheets:l.xlsx',studio:'sheets',store,sourceFingerprint:'F',getRevision:()=>rev,isDirty:()=>true,
  capture:async()=>{if(fail)throw new Error('boom');return{revision:rev,payload:b('p'+rev),history:{kind:'none'},view:{},format:'xlsx',engineVersion:'1'};}});
 registerActiveSession('sheets:l.xlsx',cp,{studio:'sheets',isDirty:()=>true});
 const a=createRecoveryLifecycleAdapter('sheets',()=>store);assert.equal(a.hasUnsavedChanges!(),true);
 const s=(await a.snapshot!())!;assert.equal((s.payload as {sessions:unknown[]}).sessions.length,1);
 rev=2;fail=true;assert.equal(await a.snapshot!(),null);assert.deepEqual(a.pinReasons!(),['checkpoint-pinned:checkpoint-failed']);
});
test('discarding a session removes it from the index',async()=>{
 await flush('sheets:d.xlsx',1);await discardSession('sheets:d.xlsx',store);
 assert.equal(createRecoveryLifecycleAdapter('sheets',()=>store).hasUnsavedChanges!(),false);
});
