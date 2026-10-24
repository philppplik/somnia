import test from 'node:test';import assert from 'node:assert/strict';
import {copyFileName,hasDirtySheets,setSheetsDirty,sheetsIsDirty} from './session';
test('dirty registry tracks workbooks by name',()=>{assert.equal(hasDirtySheets(),false);setSheetsDirty('a.xlsx',true);assert.ok(sheetsIsDirty('a.xlsx'));assert.ok(!sheetsIsDirty('b.xlsx'));assert.ok(hasDirtySheets());setSheetsDirty('a.xlsx',false);assert.equal(hasDirtySheets(),false);});
test('copy names never reuse the source name',()=>{assert.equal(copyFileName('dir/Budget.XLSX'),'Budget-edited.xlsx');assert.equal(copyFileName('plain'),'plain-edited.xlsx');});
import {acquireSheetsSession,getSheetsSession,hasSheetsSession,releaseSheetsSession,type SessionEngine} from './session';
class Fake implements SessionEngine{isDisposed=false;disposed=0;opened=0;dispose(){if(this.isDisposed)return;this.isDisposed=true;this.disposed++;}async open(_b:Uint8Array){this.opened++;return {sheets:[{index:0,name:'S',visibility:'Visible'}],warnings:[]};}}
const io=(made:Fake[],loads:string[]=[])=>({create:()=>{const f=new Fake();made.push(f);return f;},load:async(u:string)=>{loads.push(u);return new Uint8Array([1,2,3]);}});
test('a remount (studio or tab switch) reuses the live engine and keeps dirty state',async()=>{
 const made:Fake[]=[];const a=acquireSheetsSession('keep.xlsx','blob:1',io(made));await a.ready;setSheetsDirty('keep.xlsx',true);a.sheet=2;a.sel={row:4,col:1};
 const b=acquireSheetsSession('keep.xlsx','blob:1',io(made));
 assert.equal(b,a);assert.equal(made.length,1);assert.equal(made[0].disposed,0);assert.equal(made[0].opened,1);
 assert.ok(sheetsIsDirty('keep.xlsx'));assert.equal(b.sheet,2);assert.deepEqual(b.sel,{row:4,col:1});
 releaseSheetsSession('keep.xlsx');});
test('closing the file disposes the engine and clears dirty; a later open starts clean',async()=>{
 const made:Fake[]=[];const a=acquireSheetsSession('close.xlsx','blob:1',io(made));await a.ready;setSheetsDirty('close.xlsx',true);
 releaseSheetsSession('close.xlsx');
 assert.equal(made[0].disposed,1);assert.ok(!sheetsIsDirty('close.xlsx'));assert.ok(!hasSheetsSession('close.xlsx'));
 const c=acquireSheetsSession('close.xlsx','blob:1',io(made));await c.ready;assert.notEqual(c,a);assert.equal(made.length,2);releaseSheetsSession('close.xlsx');});
test('a different file object under the same name replaces the session; a dead engine is never reused',async()=>{
 const made:Fake[]=[];const a=acquireSheetsSession('swap.xlsx','blob:1',io(made));await a.ready;
 const b=acquireSheetsSession('swap.xlsx','blob:2',io(made));await b.ready;assert.notEqual(a,b);assert.equal(made[0].disposed,1);
 made[1].dispose();const c=acquireSheetsSession('swap.xlsx','blob:2',io(made));assert.notEqual(c,b);assert.equal(made.length,3);releaseSheetsSession('swap.xlsx');});
test('a failed open leaves no session and no dirty flag behind',async()=>{
 const made:Fake[]=[];const bad={create:()=>{const f=new Fake();made.push(f);return f;},load:async()=>{throw new Error('boom');}};
 const a=acquireSheetsSession('bad.xlsx','blob:1',bad);await assert.rejects(a.ready,/boom/);await new Promise(r=>setTimeout(r,0));
 assert.ok(!getSheetsSession('bad.xlsx'));assert.equal(made[0].disposed,1);assert.ok(!sheetsIsDirty('bad.xlsx'));});
