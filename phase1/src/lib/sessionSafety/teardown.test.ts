import test from 'node:test';import assert from 'node:assert/strict';
import {MemoryByteStore,RecoveryStore} from './recoveryStore';
import {SessionCheckpointer} from './checkpointer';
import {discardSession,flushOnTeardown,registerActiveSession,whenFlushed} from './flush';
import {UndoStack,type TextEdit} from '../documents/edit';
import {asHistory,blocksDigest,validHistory} from '../documents/recovery';
import {readSheetsView} from '../sheets/recovery';
const b=(s:string)=>new TextEncoder().encode(s);const d=(x:Uint8Array)=>new TextDecoder().decode(x);
const ed=(block:number,t:string):TextEdit=>({block,hunks:[{start:0,end:0,text:t}]});
test('undo journal keeps only entries above the newest structural step',()=>{
 const u=new UndoStack();u.push(ed(0,'a'));u.pushSnap({before:1,after:2,caretBefore:{block:0,off:0},caretAfter:{block:1,off:0}});u.push(ed(1,'b'));u.push(ed(1,'c'));
 const j=u.exportJournal();assert.equal(j.undo.length,2);assert.equal(j.truncated,true);
 const v=new UndoStack();v.importJournal(j);assert.equal(v.canUndo,true);assert.deepEqual(v.popUndo()!.inverse,ed(1,'c'));assert.equal(v.popUndo()!.inverse.block,1);assert.equal(v.popUndo(),undefined);
 const w=new UndoStack();w.push(ed(0,'x'));assert.equal(w.exportJournal().truncated,false);assert.equal(w.exportJournal().undo.length,1);
});
test('history is reused only when restored paragraph text is identical',async()=>{
 const blocks=[{index:0,kind:'para' as const,text:'hello',editable:true}];const j=new UndoStack();j.push(ed(0,'x'));
 const h=asHistory(j.exportJournal(),await blocksDigest(blocks));
 assert.ok(await validHistory(h,blocks));assert.equal(await validHistory(h,[{...blocks[0],text:'hellp'}]),null);assert.equal(await validHistory({kind:'none'},blocks),null);
});
test('sheets view state is validated',()=>{assert.deepEqual(readSheetsView({sheet:1,row:2,col:3}),{sheet:1,row:2,col:3});assert.equal(readSheetsView({sheet:-1,row:0,col:0}),null);assert.equal(readSheetsView({}),null);});
test('unmount while dirty then remount: edits come back (the original data-loss hazard)',async()=>{
 const store=new RecoveryStore(new MemoryByteStore());const id='sheets:t.xlsx';
 // view 1: user edits, view is torn down; worker bytes only exist inside the "engine"
 const engine={bytes:b('edited-workbook'),disposed:false,async save(){if(this.disposed)throw new Error('disposed');return this.bytes;}};
 const ok=await flushOnTeardown({sessionId:id,studio:'sheets',store,sourceFingerprint:'F',revision:4,format:'xlsx',engineVersion:'1',history:{kind:'none'},view:{sheet:0,row:1,col:1},payload:()=>engine.save()}).finally(()=>{engine.disposed=true;});
 assert.equal(ok,true);
 // view 2 mounts immediately: must wait for the flush, then restore
 const cp=new SessionCheckpointer({sessionId:id,studio:'sheets',store,sourceFingerprint:'F',getRevision:()=>1,isDirty:()=>true,capture:async()=>{throw new Error('n/a');}});
 await whenFlushed(id);let got='';const r=await cp.resume(async s=>{got=d(s.payload);},async()=>'F');
 assert.equal(r.ok,true);assert.equal(got,'edited-workbook');
});
test('remount racing the flush waits for it (no stale read)',async()=>{
 const store=new RecoveryStore(new MemoryByteStore());const id='documents:r.docx';
 const p=flushOnTeardown({sessionId:id,studio:'documents',store,sourceFingerprint:'F',revision:2,format:'docx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>{await new Promise(r=>setTimeout(r,20));return b('late');}});
 await whenFlushed(id);const l=await store.load(id);assert.equal(d(l!.snapshot.payload),'late');await p;
});
test('failed teardown flush reports false and keeps the earlier snapshot',async()=>{
 const mem=new MemoryByteStore();const store=new RecoveryStore(mem);const id='documents:f.docx';
 assert.equal(await flushOnTeardown({sessionId:id,studio:'documents',store,sourceFingerprint:'F',revision:1,format:'docx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>b('v1')}),true);
 assert.equal(await flushOnTeardown({sessionId:id,studio:'documents',store,sourceFingerprint:'F',revision:2,format:'docx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>{throw new Error('engine died');}}),false);
 assert.equal(d((await store.load(id))!.snapshot.payload),'v1');
});
test('closing a document discards snapshots and a later teardown flush is skipped',async()=>{
 const store=new RecoveryStore(new MemoryByteStore());const id='documents:c.docx';
 const cp=new SessionCheckpointer({sessionId:id,studio:'documents',store,sourceFingerprint:'F',getRevision:()=>1,isDirty:()=>true,capture:async()=>({revision:1,payload:b('x'),history:{kind:'none'},view:{},format:'docx',engineVersion:'1'})});
 registerActiveSession(id,cp);assert.ok((await cp.checkpoint()).ok);assert.ok(await store.load(id));
 await discardSession(id,store);assert.equal(await store.load(id),null);
 assert.equal(await flushOnTeardown({sessionId:id,studio:'documents',store,sourceFingerprint:'F',revision:2,format:'docx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>b('zombie')}),true);
 assert.equal(await store.load(id),null,'no zombie snapshot after discard');
 registerActiveSession(id,cp); // reopening the same name re-arms checkpointing
 assert.equal(await flushOnTeardown({sessionId:id,studio:'documents',store,sourceFingerprint:'F',revision:3,format:'docx',engineVersion:'1',history:{kind:'none'},view:{},payload:async()=>b('again')}),true);
 assert.equal(d((await store.load(id))!.snapshot.payload),'again');
});
