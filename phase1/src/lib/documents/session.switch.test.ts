import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyEdit,type TextEdit} from './edit';
import type {DocumentsEngine} from './engine';
import {getDocumentsState,patchDocuments} from './store';
import {discardDocument,dirtyDocumentNames,hasPendingEdits,hasUnsavedDocuments,isDocumentDirty,MAX_LIVE_SESSIONS,redoEdit,resetSessionsForTest,setSessionDeps,settleDocument,switchDocument,typeText,undoEdit} from './session';
const docx=new Uint8Array(readFileSync(new URL('../../../test/documents/sample.docx',import.meta.url)));
/** Stands in for the wasm worker: one paragraph of text, every call logged in order. */
class FakeEngine{
 text='Hello';disposed=false;log:string[]=[];opened:number[]=[];failSave=false;delayMs=0;
 get isDisposed(){return this.disposed;}
 async init(){return {} as never;}
 async open(b:ArrayBuffer){this.opened.push(b.byteLength);return this.doc();}
 doc(){return{pages:1,pageSizes:[{width:100,height:100}],text:this.text,cacheHits:0,cacheMisses:0,openMs:1,layoutMs:1};}
 async blocks(){return[{index:0,kind:'para' as const,editable:true,text:this.text}];}
 async replace(e:TextEdit){if(this.disposed)throw new Error('Documents engine was closed.');if(this.delayMs)await new Promise(r=>setTimeout(r,this.delayMs));this.log.push('replace');this.text=applyEdit(this.text,e);return this.doc();}
 async save(){this.log.push('save');if(this.failSave)throw new Error('boom');return docx;}
 dispose(){this.disposed=true;}
}
const made:FakeEngine[]=[];const loads:string[]=[];
beforeEach(()=>{resetSessionsForTest();made.length=0;loads.length=0;setSessionDeps({createEngine:()=>{const e=new FakeEngine();made.push(e);return e as unknown as DocumentsEngine;},loadBytes:async url=>{loads.push(url);return url.startsWith('bad')?new Uint8Array([1,2,3]):docx;}});patchDocuments({status:'idle',caret:null});});
const open=(name:string,url=`blob:${name}`)=>switchDocument({key:name,url});
const caretAtEnd=()=>patchDocuments({caret:{block:0,anchor:5,head:5}});
test('an edit survives switching to another studio and back, with dirty flag and undo',async()=>{
 const e=await open('a.docx');assert.ok(e);caretAtEnd();await typeText('!');assert.equal(made[0].text,'Hello!');
 await switchDocument(null);assert.equal(getDocumentsState().status,'idle');assert.equal(hasUnsavedDocuments(),true);
 const back=await open('a.docx');assert.equal(back,e);assert.equal(made.length,1,'engine was not recreated');assert.equal(loads.length,1,'file was not re-read');
 const s=getDocumentsState();assert.equal(s.status,'ready');assert.equal(s.edited,true);assert.equal(s.canUndo,true);assert.equal(s.blocks[0].text,'Hello!');
 await undoEdit();assert.equal(made[0].text,'Hello');await redoEdit();assert.equal(made[0].text,'Hello!');
});
test('two DOCX tabs keep separate edits, undo stacks and dirty state',async()=>{
 await open('a.docx');caretAtEnd();await typeText('A');
 await open('b.docx');assert.equal(getDocumentsState().edited,false);assert.equal(getDocumentsState().canUndo,false);assert.equal(getDocumentsState().blocks[0].text,'Hello');
 caretAtEnd();await typeText('B');
 await open('a.docx');assert.equal(getDocumentsState().blocks[0].text,'HelloA');assert.equal(getDocumentsState().canUndo,true);
 assert.deepEqual(dirtyDocumentNames().sort(),['a.docx','b.docx']);assert.equal(made[0].text,'HelloA');assert.equal(made[1].text,'HelloB');
});
test('an edit still in flight when the studio is switched is applied to its own file',async()=>{
 await open('a.docx');made[0].delayMs=20;caretAtEnd();const typing=typeText('X');
 const away=open('b.docx');assert.equal(hasPendingEdits(),true);await Promise.all([typing,away]);
 assert.equal(made[0].text,'HelloX');assert.equal(made[1].text,'Hello');assert.equal(getDocumentsState().blocks[0].text,'Hello');
 await open('a.docx');assert.equal(getDocumentsState().blocks[0].text,'HelloX');
});
test('export waits for the ordered edit queue',async()=>{
 await open('a.docx');made[0].delayMs=15;caretAtEnd();void typeText('1');void typeText('2');
 await settleDocument();assert.equal(made[0].text,'Hello12');assert.equal(hasPendingEdits(),false);
 await made[0].save();assert.deepEqual(made[0].log,['replace','replace','save']);
});
test('closing a file drops only that session; unsaved state is visible until then',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');assert.equal(isDocumentDirty('a.docx'),true);assert.equal(isDocumentDirty('b.docx'),false);
 discardDocument('a.docx');assert.equal(made[0].disposed,true);assert.equal(hasUnsavedDocuments(),false);
 await switchDocument(null);const e=await open('a.docx');assert.notEqual(e,made[0] as unknown);assert.equal(made.length,2);assert.equal(getDocumentsState().blocks[0].text,'Hello');
});
test('a replaced file with the same name starts fresh instead of showing stale edits',async()=>{
 await open('a.docx','blob:1');caretAtEnd();await typeText('!');await open('a.docx','blob:2');
 assert.equal(made.length,2);assert.equal(getDocumentsState().edited,false);assert.equal(made[0].disposed,true);
});
test(`beyond ${MAX_LIVE_SESSIONS} open files the oldest releases its engine; a dirty one keeps a checked working copy`,async()=>{
 await open('f0.docx');caretAtEnd();await typeText('!');
 for(let i=1;i<=MAX_LIVE_SESSIONS;i++)await open(`f${i}.docx`);
 assert.equal(made[0].disposed,true,'oldest evicted');assert.equal(made.filter(e=>!e.disposed).length,MAX_LIVE_SESSIONS);
 assert.equal(isDocumentDirty('f0.docx'),true);
 const loadsBefore=loads.length;await open('f0.docx');
 assert.equal(loads.length,loadsBefore,'reopened from working bytes, not the original url');
 const s=getDocumentsState();assert.equal(s.status,'ready');assert.equal(s.edited,true);assert.equal(s.notice,'undoReleased');assert.equal(s.canUndo,false);
});
test('a clean evicted file reopens from its original bytes',async()=>{
 await open('f0.docx');for(let i=1;i<=MAX_LIVE_SESSIONS;i++)await open(`f${i}.docx`);
 assert.equal(made[0].disposed,true);const n=loads.length;await open('f0.docx');assert.equal(loads.length,n+1);assert.equal(getDocumentsState().notice,'');assert.equal(getDocumentsState().edited,false);
});
test('a dirty file whose engine died is reported, never silently reset',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');made[0].dispose();await switchDocument(null);
 await open('a.docx');const s=getDocumentsState();assert.equal(s.status,'ready');assert.equal(s.notice,'lost');assert.equal(s.edited,false);assert.equal(s.blocks[0].text,'Hello');
});
test('eviction keeps the engine when the working copy cannot be saved',async()=>{
 await open('f0.docx');caretAtEnd();await typeText('!');made[0].failSave=true;
 for(let i=1;i<=MAX_LIVE_SESSIONS;i++)await open(`f${i}.docx`);
 assert.equal(made[0].disposed,false);await open('f0.docx');assert.equal(getDocumentsState().blocks[0].text,'Hello!');assert.equal(made.length,MAX_LIVE_SESSIONS+1);
});
test('malformed bytes show an error and the previous file stays intact',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');
 const r=await switchDocument({key:'x.docx',url:'bad://x'});assert.equal(r,null);assert.equal(getDocumentsState().status,'error');
 await open('a.docx');assert.equal(getDocumentsState().blocks[0].text,'Hello!');
});
test('a switch that is superseded while opening disposes its engine and never shows',async()=>{
 const first=open('a.docx');const second=open('b.docx');await Promise.all([first,second]);
 assert.equal(getDocumentsState().name,'b.docx');assert.equal(getDocumentsState().status,'ready');
 assert.ok(made.filter(e=>!e.disposed).length<=1);
});
