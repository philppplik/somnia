import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {MemoryByteStore,RecoveryStore} from './recoveryStore';
import {SessionCheckpointer} from './checkpointer';
import {flushOnTeardown,registerActiveSession,setRecoveryStoreForTests,discardSession} from './flush';
import {resetRecoveryIndexForTests} from './recoveryIndex';
import {createRecoveryLifecycleAdapter,registerRecoveryLifecycleAdapter} from './lifecycleAdapter';
import {setLifecycleHost,type LifecycleHost,type RecoveryLifecycleHooks} from './lifecycleBridge';
const b=(s:string)=>new TextEncoder().encode(s);
let store:RecoveryStore;
beforeEach(()=>{resetRecoveryIndexForTests();store=new RecoveryStore(new MemoryByteStore());setRecoveryStoreForTests(store);setLifecycleHost(null);});
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
test('seam: the default host is a no-op; an installed host receives the registration and its checksum is used',async()=>{
 // Default host: registration goes nowhere, returns an unregister function, and the adapter still verifies (local checksum fallback).
 const off=registerRecoveryLifecycleAdapter('sheets',()=>store);assert.equal(typeof off,'function');off();
 const a0=createRecoveryLifecycleAdapter('sheets',()=>store);const s0=(await a0.snapshot!())!;assert.ok(s0.checksum);await a0.resume!(s0);
 // Installed host: registerAdapter is called with the studio id and the hooks; the host's checksum stamps snapshots.
 const seen:{studioId:string;hooks:RecoveryLifecycleHooks}[]=[];
 const host:LifecycleHost={checksum:parts=>`fake(${parts.length})`,registerAdapter:(studioId,hooks)=>{seen.push({studioId,hooks});return()=>{seen.pop();};}};
 setLifecycleHost(host);
 const off2=registerRecoveryLifecycleAdapter('sheets',()=>store);assert.equal(seen.length,1);assert.equal(seen[0]!.studioId,'sheets');
 assert.equal(seen[0]!.hooks.hasUnsavedChanges!(),false);
 const a1=createRecoveryLifecycleAdapter('sheets',()=>store);const s1=(await a1.snapshot!())!;assert.ok(s1.checksum.startsWith('fake('));
 off2();assert.equal(seen.length,0);
});
