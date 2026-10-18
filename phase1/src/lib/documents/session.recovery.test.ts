import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyEdit,type TextEdit} from './edit';
import type {DocumentsEngine} from './engine';
import {getDocumentsState,patchDocuments} from './store';
import {checkpointDocument,discardDocument,dirtyDocumentNames,MAX_LIVE_SESSIONS,resetSessionsForTest,setSessionDeps,switchDocument,typeText,undoEdit} from './session';
import {MemoryByteStore,RecoveryStore,setRecoveryStoreForTests} from '../sessionSafety';
import {resetRecoveryIndexForTests} from '../sessionSafety/recoveryIndex';
import {documentsSessionId} from './recovery';
const docx=new Uint8Array(readFileSync(new URL('../../../test/documents/sample.docx',import.meta.url)));
const MARK=100; // a byte inside the zip data: changing it keeps the package valid and lets the fake carry its text in the payload
const encode=(text:string)=>{const b=docx.slice();b[MARK]=200+(text.length-'Hello'.length);return b;};
const decode=(b:Uint8Array)=>b[MARK]>=200?'Hello'+'!'.repeat(b[MARK]-200):'Hello';
class FakeEngine{
 text='Hello';disposed=false;saves=0;
 get isDisposed(){return this.disposed;}
 async init(){return {} as never;}
 async open(b:ArrayBuffer){this.text=decode(new Uint8Array(b));return this.doc();}
 doc(){return{pages:1,pageSizes:[{width:100,height:100}],text:this.text,cacheHits:0,cacheMisses:0,openMs:1,layoutMs:1};}
 async blocks(){return[{index:0,kind:'para' as const,editable:true,text:this.text}];}
 async replace(e:TextEdit){this.text=applyEdit(this.text,e);return this.doc();}
 async save(){this.saves++;return encode(this.text);}
 dispose(){this.disposed=true;}
}
const made:FakeEngine[]=[];let file=docx;let store:RecoveryStore;
beforeEach(()=>{resetSessionsForTest();made.length=0;file=docx;store=new RecoveryStore(new MemoryByteStore());setRecoveryStoreForTests(store);resetRecoveryIndexForTests();
 setSessionDeps({createEngine:()=>{const e=new FakeEngine();made.push(e);return e as unknown as DocumentsEngine;},loadBytes:async()=>file});
 patchDocuments({status:'idle',name:'',edited:false,notice:''});});
const open=(name:string)=>switchDocument({key:name,url:`blob:${name}`});
const caretAtEnd=()=>patchDocuments({caret:{block:0,anchor:5,head:5}});
const idle=()=>new Promise(r=>setTimeout(r,10));
test('typing is checkpointed; after a crash the reopened file shows the edits, undo history and a notice',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');assert.equal(await checkpointDocument('a.docx'),true);
 discardDocument('a.docx',{keepRecovery:true}); // the session is gone without a user discard
 assert.equal(made[0].disposed,true);
 await open('a.docx');const s=getDocumentsState();
 assert.equal(made[1].text,'Hello!');assert.equal(s.status,'ready');assert.equal(s.edited,true);assert.equal(s.notice,'recovered');
 assert.equal(s.canUndo,true,'journal restored');await undoEdit();assert.equal(made[1].text,'Hello');
});
test('the restored state is itself re-checkpointed, so a second crash still recovers it',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!!');await checkpointDocument('a.docx');discardDocument('a.docx',{keepRecovery:true});
 await open('a.docx');await checkpointDocument('a.docx');discardDocument('a.docx',{keepRecovery:true});
 await open('a.docx');assert.equal(made[2].text,'Hello!!');assert.equal(getDocumentsState().edited,true);
});
test('a file that changed on disk is never overwritten: the original opens, the snapshot is kept, the user is told',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');await checkpointDocument('a.docx');discardDocument('a.docx',{keepRecovery:true});
 const other=docx.slice();other[60]^=0xff;file=other;
 await open('a.docx');const s=getDocumentsState();
 assert.equal(made[1].text,'Hello');assert.equal(s.edited,false);assert.equal(s.notice,'recoverySourceChanged');
 assert.ok(await store.load(documentsSessionId('a.docx')));
});
test('closing the file is the explicit discard and deletes the snapshots; a clean open follows',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');await checkpointDocument('a.docx');
 discardDocument('a.docx');await idle();
 assert.equal(await store.load(documentsSessionId('a.docx')),null);
 await open('a.docx');assert.equal(made[1].text,'Hello');assert.equal(getDocumentsState().edited,false);assert.equal(getDocumentsState().notice,'');
});
test('a switch away and back is not an edit: no extra engine save after the checkpoint',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');await checkpointDocument('a.docx');const n=made[0].saves;
 await switchDocument(null);await open('a.docx');await new Promise(r=>setTimeout(r,1700));
 assert.equal(made[0].saves,n);assert.equal(getDocumentsState().notice,'');
});
test('a dirty session evicted past the live limit leaves a verified recovery copy',async()=>{
 await open('a.docx');caretAtEnd();await typeText('!');
 for(let i=0;i<MAX_LIVE_SESSIONS;i++)await open(`f${i}.docx`);
 assert.equal(made[0].disposed,true,'a.docx was evicted');assert.ok(await store.load(documentsSessionId('a.docx')),'verified copy exists');
 assert.deepEqual(dirtyDocumentNames(),['a.docx']);
});
