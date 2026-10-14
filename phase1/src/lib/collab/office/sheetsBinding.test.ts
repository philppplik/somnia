import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {seedSheetsModel,openSheetsModel,syncSharedSheets,setSharedCell,sharedCellsFor,sharedSheetList} from './sheetsModel';
import {SheetsCollabBinding,type SheetsEnginePort} from './sheetsBinding';

class FakeEngine implements SheetsEnginePort{
 cells=new Map<string,string>();failNext=false;
 async set(sheet:number,address:string,input:string){if(this.failNext){this.failNext=false;throw new Error('refused');}const k=`${sheet}!${address}`;if(input==='')this.cells.delete(k);else this.cells.set(k,input);}
}
const H='b'.repeat(64);
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
const sync=(a:Y.Doc,b:Y.Doc)=>{Y.applyUpdate(b,Y.encodeStateAsUpdate(a));};
const flush=()=>new Promise(r=>setTimeout(r,10));
const setup=(name:string)=>{
 const d=mk();const m=seedSheetsModel(d,'b.xlsx',H);syncSharedSheets(m,['S1'],'seed');
 const engine=new FakeEngine();
 const binding=new SheetsCollabBinding(d,'b.xlsx',{engine,sheetIndexOf:id=>sharedSheetList(m)[0]?.id===id?0:null});
 return{d,m,engine,binding};};
/** Guest side: adopts the host's seeded model through sync (random sheet ids would diverge if both seeded). */
const join=(host:ReturnType<typeof setup>)=>{
 const d=mk();sync(host.d,d);const m=openSheetsModel(d,'b.xlsx');
 const engine=new FakeEngine();
 const binding=new SheetsCollabBinding(d,'b.xlsx',{engine,sheetIndexOf:id=>sharedSheetList(m)[0]?.id===id?0:null});
 return{d,m,engine,binding};};

test('local edit: engine validates first, shared write carries the binding origin (no self-echo)',async()=>{
 const {m,engine,binding}=setup('a');
 await binding.applyLocalEdit(sharedSheetList(m)[0].id,1,2,'=B2*2');
 assert.equal(engine.cells.get('0!C2'),'=B2*2');
 assert.deepEqual(sharedCellsFor(m,sharedSheetList(m)[0].id),[{row:1,col:2,input:'=B2*2'}]);
 const before=engine.cells.size;await flush();
 assert.equal(engine.cells.size,before,'observer must not re-apply own writes');
 binding.destroy();
});
test('remote edit lands in the engine; engine refusal does not corrupt the model',async()=>{
 const a=setup('a'),b=join(a);
 setSharedCell(a.m,sharedSheetList(a.m)[0].id,0,0,'7','other');
 sync(a.d,b.d);await flush();
 assert.equal(b.engine.cells.get('0!A1'),'7');
 b.engine.failNext=true;
 setSharedCell(a.m,sharedSheetList(a.m)[0].id,0,1,'9','other');
 sync(a.d,b.d);await flush();
 assert.equal(b.engine.cells.has('0!B1'),false,'refused op not in the engine');
 assert.deepEqual(sharedCellsFor(b.m,sharedSheetList(b.m)[0].id).map(c=>c.input).sort(),['7','9'],'model keeps it');
 b.binding.replay(sharedSheetList(b.m)[0].id);await flush();
 assert.equal(b.engine.cells.get('0!B1'),'9','replay repairs the renderer');
 a.binding.destroy();b.binding.destroy();
});
test('clearing a cell remotely deletes it in the engine',async()=>{
 const a=setup('a'),b=join(a);
 const id=sharedSheetList(a.m)[0].id;
 setSharedCell(a.m,id,5,5,'x','o');sync(a.d,b.d);await flush();
 assert.equal(b.engine.cells.get('0!F6'),'x');
 setSharedCell(a.m,id,5,5,'','o');sync(a.d,b.d);await flush();
 assert.equal(b.engine.cells.has('0!F6'),false);
 a.binding.destroy();b.binding.destroy();
});
