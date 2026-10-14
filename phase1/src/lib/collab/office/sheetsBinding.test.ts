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

test('paste block: one shared transaction, every cell in engine and model',async()=>{
 const a=setup('a'),b=join(a);sync(a.d,b.d);
 const id=sharedSheetList(a.m)[0].id;
 await a.binding.applyLocalBlock(id,2,1,[['1','2'],['3','4']]);
 assert.equal(a.engine.cells.get('0!B3'),'1');assert.equal(a.engine.cells.get('0!C4'),'4');
 assert.equal(sharedCellsFor(a.m,id).length,4);
 sync(a.d,b.d);await flush();
 assert.equal(b.engine.cells.get('0!B3'),'1');assert.equal(b.engine.cells.get('0!C4'),'4');
 a.binding.destroy();b.binding.destroy();
});

test('per-person undo: my edits revert, the peer keeps theirs',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 const mA=seedSheetsModel(a,'f.xlsx',H);syncSharedSheets(mA,['S1'],'seed');
 const seen:{a:string[];b:string[]}={a:[],b:[]};
 const eng=(log:string[])=>({set:async(_s:number,addr:string,input:string)=>{log.push(addr+'='+input);}});
 const bA=new SheetsCollabBinding(a,'f.xlsx',{engine:eng(seen.a),sheetIndexOf:()=>0});
 const bB=new SheetsCollabBinding(b,'f.xlsx',{engine:eng(seen.b),sheetIndexOf:()=>0});
 const id=sharedSheetList(openSheetsModel(a,'f.xlsx'))[0].id;
 await bA.applyLocalEdit(id,0,0,'mine');
 await bB.applyLocalEdit(id,1,0,'peer');
 await flush();
 bA.undo();
 await flush();
 assert.equal(openSheetsModel(a,'f.xlsx').cells.get(id+'!0:0'),undefined);
 assert.equal(openSheetsModel(a,'f.xlsx').cells.get(id+'!1:0'),'peer');
 assert.ok(seen.a.some(x=>x==='A1='));         // revert reached A's engine
 assert.ok(seen.b.some(x=>x==='A1='));         // and replicated to B's
 bA.redo();
 await flush();
 assert.equal(openSheetsModel(a,'f.xlsx').cells.get(id+'!0:0'),'mine');
 bA.destroy();bB.destroy();});

test('format journal: local op reaches the peer engine once, garbage entries are dropped',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 const mA=seedSheetsModel(a,'f.xlsx',H);syncSharedSheets(mA,['S1'],'seed');
 const got:string[]=[];
 const engB={set:async()=>{},format:async(_s:number,r:number,c:number,rs:number,cs:number,op:unknown)=>{got.push(`${r}:${c}:${rs}x${cs}:${(op as {kind:string}).kind}`);}};
 const bA=new SheetsCollabBinding(a,'f.xlsx',{engine:{set:async()=>{},format:async()=>{}},sheetIndexOf:()=>0});
 new SheetsCollabBinding(b,'f.xlsx',{engine:engB,sheetIndexOf:()=>0});
 const id=sharedSheetList(openSheetsModel(a,'f.xlsx'))[0].id;
 await bA.applyLocalFormat(id,1,2,3,4,{kind:'bold',on:true});
 await flush();
 assert.deepEqual(got,['1:2:3x3:bold']);            // r1/c1 are inclusive: 1..3 x 2..4
 assert.equal(openSheetsModel(b,'f.xlsx').formats.length,1);
 openSheetsModel(b,'f.xlsx').formats.push([{sheetId:id,r0:'x'},null,'junk']);   // remote garbage
 await flush();
 assert.equal(got.length,1);                          // nothing reached the engine
 bA.destroy();});

test('sheet structure: remote tab edits reconcile the engine, deleted tabs take their cells',async()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 const mA=seedSheetsModel(a,'f.xlsx',H);syncSharedSheets(mA,['S1'],'seed');
 const mkEng=(names:string[])=>{const ops:string[]=[];return{ops,eng:{
  set:async()=>{},
  sheets:async()=>names.slice(),
  editSheet:async(i:number,line:{kind:string;name?:string})=>{ops.push(line.kind+(line.name?':'+line.name:''));
   if(line.kind==='rename')names[i]=line.name!;
   else if(line.kind==='add')names.splice(i,0,line.name??'Sheet');
   else if(line.kind==='delete')names.splice(i,1);}}};};
 const eA=mkEng(['S1']),eB=mkEng(['S1']);
 const bA=new SheetsCollabBinding(a,'f.xlsx',{engine:eA.eng,sheetIndexOf:id=>sharedSheetList(openSheetsModel(a,'f.xlsx')).findIndex(x=>x.id===id)});
 const bB=new SheetsCollabBinding(b,'f.xlsx',{engine:eB.eng,sheetIndexOf:id=>sharedSheetList(openSheetsModel(b,'f.xlsx')).findIndex(x=>x.id===id)});
 const id=sharedSheetList(openSheetsModel(a,'f.xlsx'))[0].id;
 await eA.eng.editSheet(1,{kind:'add',name:'Neu'});   // canvas applies the engine op first, then mirrors
 bA.applyLocalSheetOp(1,'add','Neu');
 await flush();
 assert.deepEqual(eB.ops,['add:Neu']);                 // structural op reached the peer
 syncSharedSheets(openSheetsModel(b,'f.xlsx'),['Umbenannt','Neu'],'peer-rename');
 await flush();
 assert.deepEqual(eA.ops,['add:Neu','rename:Umbenannt']);
 await bA.applyLocalEdit(id,0,0,'x');
 bA.applyLocalSheetOp(0,'delete');                    // drop the first tab (id-aware: its cells go with it)
 await flush();
 assert.equal(openSheetsModel(b,'f.xlsx').cells.get(id+'!0:0'),undefined);   // orphan cells gone
 assert.ok(eB.ops.includes('delete'));
 bA.destroy();bB.destroy();});
