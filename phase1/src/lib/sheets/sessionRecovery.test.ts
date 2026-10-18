import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {acquireSheetsSession,checkpointSheets,endSheetsSession,hasDirtySheets,noteSheetsSaveStart,releaseSheetsSession,setSheetsDirty,sheetsIsDirty,sheetsSaved,type SessionEngine} from './session';
import {MemoryByteStore,RecoveryStore,setRecoveryStoreForTests} from '../sessionSafety';
import {resetRecoveryIndexForTests} from '../sessionSafety/recoveryIndex';
import {sheetsSessionId} from './recovery';
/** A workbook engine that holds one "cell" and serializes it, so a restore is observable. */
class Fake implements SessionEngine{
 isDisposed=false;cell='';hasPendingMutation=false;
 dispose(){this.isDisposed=true;}
 async open(b:Uint8Array){this.cell=new TextDecoder().decode(b);return{sheets:[{index:0,name:'A',visibility:'Visible'},{index:1,name:'B',visibility:'Visible'}],warnings:[]} as never;}
 async save(){return new TextEncoder().encode(this.cell);}
}
let made:Fake[]=[];let file='original';let store:RecoveryStore;
const io=()=>({create:()=>{const f=new Fake();made.push(f);return f;},load:async()=>new TextEncoder().encode(file)});
beforeEach(()=>{made=[];file='original';store=new RecoveryStore(new MemoryByteStore());setRecoveryStoreForTests(store);resetRecoveryIndexForTests();});
const edit=(name:string,s:Awaited<ReturnType<typeof open>>,value:string)=>{(s.engine as Fake).cell=value;setSheetsDirty(name,true);};
const open=async(name:string)=>{const s=acquireSheetsSession(name,'blob:1',io());await s.ready;return s;};
test('an edited workbook is checkpointed, and a new session after a crash restores it with view state and the dirty flag',async()=>{
 const a=await open('r.xlsx');a.sheet=1;a.sel={row:3,col:2};edit('r.xlsx',a,'edited');
 assert.equal(await checkpointSheets('r.xlsx'),true);
 endSheetsSession('r.xlsx'); // the engine died: the recovery copy must outlive the session
 assert.equal(sheetsIsDirty('r.xlsx'),false);
 const b=await open('r.xlsx');
 assert.equal(b.recovery,'restored');assert.equal((b.engine as Fake).cell,'edited');assert.equal(b.sheet,1);assert.deepEqual(b.sel,{row:3,col:2});
 assert.equal(sheetsIsDirty('r.xlsx'),true);assert.equal(new TextDecoder().decode(b.original!),'original','the opened file bytes stay untouched');
 releaseSheetsSession('r.xlsx');
});
test('a changed source file keeps the snapshot and opens the file as it is now',async()=>{
 const a=await open('c.xlsx');edit('c.xlsx',a,'edited');await checkpointSheets('c.xlsx');endSheetsSession('c.xlsx');
 file='changed on disk';const b=await open('c.xlsx');
 assert.equal(b.recovery,'source-changed');assert.equal((b.engine as Fake).cell,'changed on disk');assert.equal(sheetsIsDirty('c.xlsx'),false);
 assert.ok(await store.load(sheetsSessionId('c.xlsx')),'snapshot still there');
 releaseSheetsSession('c.xlsx');
});
test('saving a copy releases the snapshots; edits made while saving keep dirty state and snapshots',async()=>{
 const a=await open('s.xlsx');edit('s.xlsx',a,'one');await checkpointSheets('s.xlsx');
 noteSheetsSaveStart('s.xlsx');assert.equal(sheetsSaved('s.xlsx'),true);await new Promise(r=>setTimeout(r,20));
 assert.equal(sheetsIsDirty('s.xlsx'),false);assert.equal(await store.load(sheetsSessionId('s.xlsx')),null);
 edit('s.xlsx',a,'two');await checkpointSheets('s.xlsx');
 noteSheetsSaveStart('s.xlsx');edit('s.xlsx',a,'three'); // typed while the save dialog was open
 assert.equal(sheetsSaved('s.xlsx'),false);await new Promise(r=>setTimeout(r,20));
 assert.equal(sheetsIsDirty('s.xlsx'),true);assert.ok(await store.load(sheetsSessionId('s.xlsx')),'the snapshot is kept');
 releaseSheetsSession('s.xlsx');
});
test('closing the file is the explicit discard: the snapshots are deleted and the next open is clean',async()=>{
 const a=await open('d.xlsx');edit('d.xlsx',a,'edited');await checkpointSheets('d.xlsx');
 releaseSheetsSession('d.xlsx');await new Promise(r=>setTimeout(r,20));
 assert.equal(await store.load(sheetsSessionId('d.xlsx')),null);assert.equal(hasDirtySheets(),false);
 const b=await open('d.xlsx');assert.equal(b.recovery,null);assert.equal((b.engine as Fake).cell,'original');releaseSheetsSession('d.xlsx');
});
test('a corrupt snapshot falls back to the file',async()=>{
 const a=await open('x.xlsx');edit('x.xlsx',a,'edited');await checkpointSheets('x.xlsx');endSheetsSession('x.xlsx');
 const mem=(store.bytes as MemoryByteStore).map;for(const k of [...mem.keys()]){const v=mem.get(k)!;v[v.length-1]^=0xff;}
 const b=await open('x.xlsx');assert.equal(b.recovery,null);assert.equal((b.engine as Fake).cell,'original');releaseSheetsSession('x.xlsx');
});
