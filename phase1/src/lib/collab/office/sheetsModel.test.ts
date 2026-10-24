import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {seedSheetsModel,openSheetsModel,sheetsModelMeta,setSharedCell,syncSharedSheets,sharedSheetList,sharedCellsFor,parseCellKey,cellKey} from './sheetsModel';

const H='a'.repeat(64);
const sync=(a:Y.Doc,b:Y.Doc)=>{Y.applyUpdate(b,Y.encodeStateAsUpdate(a));};
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});

test('seed stamps schema/engine/baseHash and is idempotent',()=>{
 const d=mk();const m=seedSheetsModel(d,'book.xlsx',H);seedSheetsModel(d,'book.xlsx',H);
 assert.deepEqual(sheetsModelMeta(m),{schema:1,engine:'gridcraft',baseHash:H});
});
test('seed refuses unsafe paths and bad meta reads as null',()=>{
 const d=mk();
 assert.throws(()=>seedSheetsModel(d,'../x.xlsx',H));
 const m=seedSheetsModel(d,'a.xlsx',H);m.meta.set('engine','other');
 assert.equal(sheetsModelMeta(m),null);
});
test('cells converge across two docs; input strings, delete on empty',()=>{
 const a=mk(),b=mk();
 const ma=seedSheetsModel(a,'b.xlsx',H);syncSharedSheets(ma,['S1','S2'],'test');
 sync(a,b);const mb=openSheetsModel(b,'b.xlsx');
 setSharedCell(ma,'x',0,0,'=SUM(A2:A9)','a');setSharedCell(mb,'x',0,1,'42','b');
 sync(a,b);sync(b,a);
 assert.deepEqual(sharedCellsFor(ma,'x').sort((p,q)=>p.col-q.col),[{row:0,col:0,input:'=SUM(A2:A9)'},{row:0,col:1,input:'42'}]);
 assert.deepEqual(sharedCellsFor(mb,'x').sort((p,q)=>p.col-q.col),[{row:0,col:0,input:'=SUM(A2:A9)'},{row:0,col:1,input:'42'}]);
 setSharedCell(mb,'x',0,0,'','b');sync(b,a);
 assert.deepEqual(sharedCellsFor(ma,'x'),[{row:0,col:1,input:'42'}]);
});
test('same cell twice: last writer wins deterministically on both sides',()=>{
 const a=mk(),b=mk();
 const ma=seedSheetsModel(a,'b.xlsx',H);sync(a,b);const mb=openSheetsModel(b,'b.xlsx');
 setSharedCell(ma,'s',3,3,'from-a','a');setSharedCell(mb,'s',3,3,'from-b','b');
 sync(a,b);sync(b,a);
 const va=sharedCellsFor(ma,'s')[0].input,vb=sharedCellsFor(mb,'s')[0].input;
 assert.equal(va,vb,'both peers must agree');assert.ok(['from-a','from-b'].includes(va));
});
test('sheet list: rename keeps the id, append and truncate keep cell keys valid',()=>{
 const d=mk();const m=seedSheetsModel(d,'b.xlsx',H);
 syncSharedSheets(m,['One','Two'],'t');
 const ids=sharedSheetList(m).map(s=>s.id);
 setSharedCell(m,ids[0],0,0,'v','t');
 syncSharedSheets(m,['Eins','Two','Drei'],'t');
 const after=sharedSheetList(m);
 assert.equal(after[0].id,ids[0]);assert.equal(after[0].name,'Eins');assert.equal(after.length,3);
 syncSharedSheets(m,['Eins'],'t');
 assert.equal(sharedSheetList(m).length,1);
 assert.deepEqual(sharedCellsFor(m,ids[0]),[{row:0,col:0,input:'v'}]);
});
test('cell keys are bounded and parseable',()=>{
 assert.equal(cellKey('s',4999,199),'s!4999:199');
 assert.throws(()=>cellKey('s',5000,0));assert.throws(()=>cellKey('s',0,200));assert.throws(()=>cellKey('s',-1,0));
 assert.deepEqual(parseCellKey('s!12:3'),{sheetId:'s',row:12,col:3});
 assert.equal(parseCellKey('s!5000:0'),null);assert.equal(parseCellKey('nope'),null);
 assert.throws(()=>setSharedCell(seedSheetsModel(mk(),'b.xlsx',H),'s',0,0,'y'.repeat(33_000),'t'),/too long/);
});
