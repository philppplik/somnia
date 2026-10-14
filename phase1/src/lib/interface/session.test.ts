import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterfaceSession,RECOVERY_KEY,type RecoveryStorage} from './session';
import {addNode,reparentNode} from './model';
const memory=()=>{const map=new Map<string,string>();return {map,storage:{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}} satisfies RecoveryStorage};};
test('compound edits form one transaction, undo/redo advance revisions, new edits clear redo',()=>{
 const s=createInterfaceSession();s.start();const base=s.get().document!;
 s.transact(d=>{const frame=addNode(d,d.pages[0].id,'frame');addNode(d,d.pages[0].id,'text',frame);});assert.equal(s.get().past.length,1);assert.equal(s.get().document!.nodes.length,2);
 s.undo();assert.equal(s.get().document!.nodes.length,0);assert.equal(s.get().document!.revision,2);s.redo();assert.equal(s.get().document!.nodes.length,2);assert.equal(s.get().document!.revision,3);
 s.undo();s.transact(d=>{d.name='New path';});assert.equal(s.get().future.length,0);assert.equal(base.nodes.length,0);
});
test('failed batch and cyclic reparent roll back history, source and recovery',()=>{
 const m=memory(),s=createInterfaceSession(m.storage);s.start();s.transact(d=>{const frame=addNode(d,d.pages[0].id,'frame');addNode(d,d.pages[0].id,'group',frame);});
 const before=s.get(),recovery=m.map.get(RECOVERY_KEY);assert.throws(()=>s.transact(d=>{d.name='Uncommitted';d.nodes[0].width=NaN;}));assert.equal(s.get(),before);assert.equal(m.map.get(RECOVERY_KEY),recovery);
 assert.throws(()=>s.transact(d=>reparentNode(d,d.nodes[0].id,d.nodes[1].id,0)));assert.equal(s.get(),before);
 assert.throws(()=>s.transact(d=>{d.name='Bad';throw Error('cancel');}));assert.equal(s.get(),before);
});
test('immutable snapshots and no-op edits do not write recovery or history',()=>{
 const s=createInterfaceSession();s.start();const before=s.get();assert.throws(()=>{before.document!.name='mutated';});s.transact(()=>{});assert.equal(s.get(),before);
});
test('recovery restores content, dirty and active page, not selection or history',()=>{
 const m=memory(),s=createInterfaceSession(m.storage);s.start();s.transact(d=>{addNode(d,d.pages[0].id,'frame');});s.select(s.get().document!.nodes[0].id);
 const next=createInterfaceSession(m.storage);assert.equal(next.recover(),true);assert.deepEqual(next.get().document,s.get().document);assert.equal(next.get().dirty,true);assert.equal(next.get().pageId,s.get().pageId);assert.equal(next.get().selection,null);assert.equal(next.get().past.length,0);
 assert.equal(next.recover(),false);next.clear();assert.equal(m.map.has(RECOVERY_KEY),false);
});
test('corrupt recovery is kept intact and storage failures preserve editing',()=>{
 const m=memory();m.map.set(RECOVERY_KEY,'bad');const s=createInterfaceSession(m.storage);assert.equal(s.recover(),false);assert.equal(m.map.get(RECOVERY_KEY),'bad');assert.ok(s.get().recoveryError);
 const blocked=createInterfaceSession({getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('denied');}});blocked.start();assert.ok(blocked.get().document);assert.ok(blocked.get().recoveryError);blocked.transact(d=>{d.name='Still editing';});assert.equal(blocked.get().document!.name,'Still editing');assert.equal(blocked.get().dirty,true);
});
test('completed save clears dirty only for exact document/revision; stale save cannot clear new work',()=>{
 const s=createInterfaceSession();s.start();const d=s.get().document!;s.transact(d=>{d.name='Changed while saving';});s.markSaved(d.id,d.revision);assert.equal(s.get().dirty,true);
 s.markSaved(s.get().document!.id,s.get().document!.revision);assert.equal(s.get().dirty,false);s.undo();assert.equal(s.get().dirty,true);
});
test('selection is bounded to active page and reconciles on delete/undo',()=>{
 const s=createInterfaceSession();s.start();s.transact(d=>{addNode(d,d.pages[0].id,'text');});s.select('missing');assert.equal(s.get().selection,null);const id=s.get().document!.nodes[0].id;s.select(id);assert.equal(s.get().selection,id);s.undo();assert.equal(s.get().selection,null);
});
