import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceSession} from './session';
import {saveInterfaceSnapshot} from './persistence';
test('save cancellation/failure preserve source and dirty, completed write clears exact revision',async()=>{
 const original=(globalThis as any).window;try{
  interfaceSession.start();const doc=interfaceSession.get().document!;
  (globalThis as any).window={showSaveFilePicker:async()=>{throw new DOMException('cancelled','AbortError');}};
  assert.equal(await saveInterfaceSnapshot(),false);assert.equal(interfaceSession.get().dirty,true);assert.equal(interfaceSession.get().document,doc);
  let aborted=false; (globalThis as any).window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('disk full');},close:async()=>{},abort:async()=>{aborted=true;}})})};
  await assert.rejects(saveInterfaceSnapshot(),/disk full/);assert.equal(aborted,true);assert.equal(interfaceSession.get().dirty,true);
  let body='';(globalThis as any).window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async(s:string)=>{body=s;},close:async()=>{}})})};
  assert.equal(await saveInterfaceSnapshot(),true);assert.equal(interfaceSession.get().dirty,false);assert.deepEqual(JSON.parse(body),doc);
  interfaceSession.transact(d=>{d.name='Next';});(globalThis as any).window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{interfaceSession.transact(d=>{d.name='Edited during write';});},close:async()=>{}})})};
  assert.equal(await saveInterfaceSnapshot(),false);assert.equal(interfaceSession.get().dirty,true);
 }finally{(globalThis as any).window=original;interfaceSession.clear();}
});
test('download fallback never reports a confirmed write and explains the dirty state',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 try{(globalThis as any).window={};let clicked=false;(globalThis as any).document={createElement:()=>({click:()=>{clicked=true;}})};interfaceSession.start();assert.equal(await saveInterfaceSnapshot(),false);assert.equal(clicked,true);assert.equal(interfaceSession.get().dirty,true);assert.ok(interfaceSession.get().notice.includes('stays unsaved'));}
 finally{(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument;interfaceSession.clear();}
});
