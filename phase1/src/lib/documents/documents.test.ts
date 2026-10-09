import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {DocumentsCore} from './core';
import {DocumentsEngine,type WorkerLike} from './engine';
import {inspectDocx} from './inspect';
import {utf16ToUtf8Offset} from './text';
import type {DocumentsRequest,DocumentsResponse} from './protocol';
const wasm=new URL('../../../documents/pkg/wordcraft_somnia_worker_bg.wasm',import.meta.url);
const haveWasm=existsSync(wasm);
const fixture=(n:string)=>readFileSync(new URL(`../../../test/documents/${n}`,import.meta.url));
const ab=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;
async function realCore(){const m=await import('../../../documents/pkg/wordcraft_somnia_worker.js');m.initSync({module:readFileSync(wasm)});return new DocumentsCore(m.DocSession);}
test('real engine: open, paginate, insert, save, reopen',{skip:!haveWasm},async()=>{
 const core=await realCore();
 const o=core.handle({id:1,kind:'open',bytes:ab(fixture('sample.docx'))}).res;
 assert.ok(o.ok&&o.kind==='opened');assert.equal(o.document.pages,1);assert.match(o.document.text,/Somnia Documents/);
 const e=core.handle({id:2,kind:'insert',block:0,utf8Offset:0,text:'Edited: '}).res;assert.ok(e.ok&&e.kind==='edited'&&e.document.text.startsWith('Edited: '));
 const s=core.handle({id:3,kind:'save'});assert.ok(s.res.ok&&s.res.kind==='saved');
 const bytes=(s.res as Extract<DocumentsResponse,{kind:'saved'}>).bytes;
 const again=core.handle({id:4,kind:'open',bytes:bytes.slice(0)}).res;assert.ok(again.ok&&again.kind==='opened'&&again.document.text===e.document.text);
 const png=core.handle({id:5,kind:'render',page:0,scale:1}).res;assert.ok(png.ok&&png.kind==='rendered');
 assert.deepEqual([...new Uint8Array((png as Extract<DocumentsResponse,{kind:'rendered'}>).png).slice(0,4)],[0x89,0x50,0x4e,0x47]);
});
test('real engine: bad input is rejected and the session stays usable',{skip:!haveWasm},async()=>{
 const core=await realCore();
 assert.equal(core.handle({id:1,kind:'open',bytes:ab(strToU8('not a zip'))}).res.ok,false);
 assert.equal(core.handle({id:2,kind:'render',page:0,scale:1}).res.ok,false);
 assert.ok(core.handle({id:3,kind:'open',bytes:ab(fixture('sample.docx'))}).res.ok);
 assert.equal(core.handle({id:4,kind:'insert',block:999,utf8Offset:0,text:'x'}).res.ok,false);
 assert.equal(core.handle({id:5,kind:'render',page:0,scale:9}).res.ok,false);
 assert.equal(core.handle({id:6,kind:'render',page:99,scale:1}).res.ok,false);
 assert.ok(core.handle({id:7,kind:'render',page:0,scale:1}).res.ok);
});
test('real engine: 500 paragraphs paginate to many pages',{skip:!haveWasm},async()=>{
 const core=await realCore();const o=core.handle({id:1,kind:'open',bytes:ab(fixture('large.docx'))}).res;
 assert.ok(o.ok&&o.kind==='opened'&&o.document.pages>10&&o.document.pageSizes.length===o.document.pages);
});
test('oversized input is refused before the engine sees it',async()=>{
 const core=new DocumentsCore(class{constructor(){throw new Error('should not construct');}} as never);
 const r=core.handle({id:1,kind:'open',bytes:new ArrayBuffer(17*1024*1024)}).res;assert.ok(!r.ok&&/16 MB/.test(r.error));
});
function fakeWorker(answer:(m:DocumentsRequest,reply:(r:DocumentsResponse)=>void)=>void){
 const w:WorkerLike&{terminated:boolean}={terminated:false,onmessage:null,onerror:null,onmessageerror:null,terminate(){this.terminated=true;},postMessage(m){answer(m as DocumentsRequest,r=>queueMicrotask(()=>this.onmessage?.({data:r} as MessageEvent<DocumentsResponse>)));}};return w;
}
test('engine: serial queue keeps order and rejects errors without dying',async()=>{
 const seen:string[]=[];const w=fakeWorker((m,reply)=>{seen.push(m.kind);reply(m.kind==='save'?{id:m.id,ok:false,error:'boom'}:{id:m.id,ok:true,kind:'closed'} as DocumentsResponse);});
 const e=new DocumentsEngine(()=>w,'x',1000);
 await assert.rejects(e.save(),/boom/);await e.close();assert.deepEqual(seen,['save','close']);assert.equal(e.isDisposed,false);e.dispose();
});
test('engine: a stalled worker is terminated and later calls fail clearly',async()=>{
 const w=fakeWorker(()=>{});const e=new DocumentsEngine(()=>w,'x',20);
 await assert.rejects(e.save(),/did not answer in time/);assert.equal(w.terminated,true);
 await assert.rejects(e.save(),/closed/);
});
test('engine: worker error disposes and rejects pending',async()=>{
 const w=fakeWorker(()=>{});const e=new DocumentsEngine(()=>w,'x',1000);const p=e.save();
 await new Promise(r=>setTimeout(r,0));w.onerror?.({message:'crash'} as ErrorEvent);await assert.rejects(p,/crash/);assert.equal(w.terminated,true);
});
test('utf16ToUtf8Offset converts and refuses surrogate splits',()=>{
 assert.equal(utf16ToUtf8Offset('aé',2),3);assert.equal(utf16ToUtf8Offset('😀x',2),4);
 assert.throws(()=>utf16ToUtf8Offset('😀x',1),RangeError);assert.throws(()=>utf16ToUtf8Offset('ab',3),RangeError);
});
test('inspectDocx reports risky parts without inflating',()=>{
 const base={'[Content_Types].xml':strToU8('<x/>'),'word/document.xml':strToU8('<x/>')};
 assert.deepEqual(inspectDocx(zipSync(base)),{ok:true,risks:[]});
 const r=inspectDocx(zipSync({...base,'word/charts/c1.xml':strToU8('x'),'word/comments.xml':strToU8('x'),'word/media/a.png':strToU8('x'),'word/vbaProject.bin':strToU8('x')}));
 assert.deepEqual(r.risks.sort(),['charts','comments','images','macros']);
 assert.equal(inspectDocx(strToU8('nope')).ok,false);
 assert.equal(inspectDocx(fixture('sample.docx')).ok,true);
});
import {diffEdit,applyEdit,inverseOf,UndoStack} from './edit';
test('diffEdit gives minimal hunks in UTF-8 bytes, never splits surrogates, and round-trips',()=>{
 assert.equal(diffEdit(0,'same','same'),null);
 assert.deepEqual(diffEdit(2,'Hello world','Hello brave world'),{block:2,hunks:[{start:6,end:6,text:'brave '}]});
 assert.deepEqual(diffEdit(0,'aéb','aXb'),{block:0,hunks:[{start:1,end:3,text:'X'}]});
 const e=diffEdit(0,'a😀b','a😁b')!;assert.deepEqual(e.hunks,[{start:1,end:5,text:'😁'}]);
 assert.deepEqual(diffEdit(0,'abc','')!.hunks,[{start:0,end:3,text:''}]);
 const far=diffEdit(0,'The quick brown fox jumps over the lazy dog','A quick brown fox jumps over the lazy cat')!;
 assert.equal(far.hunks.length,2);
 for(const [x,y] of [['The quick brown fox jumps over the lazy dog','A quick brown fox jumps over the lazy cat'],['äöü€😀 text','ö€ new text 😀'],['','new'],['aaaa','aa'],['abcabc','cabcab']])assert.equal(applyEdit(x,diffEdit(0,x,y)!),y,x+'->'+y);
});
test('inverseOf reverses single and multi hunk edits',()=>{
 for(const [x,y] of [['Hello world','Hello brave world'],['aéb','aXb'],['The quick brown fox jumps over the lazy dog','A quick brown fox jumps over the lazy cat'],['äöü€😀 text','ö€ new text 😀']]){
  const e=diffEdit(0,x,y)!;const inv=inverseOf(x,e);assert.equal(applyEdit(y,inv),x,x+'<-'+y);
 }
});
test('UndoStack clears redo on a new edit',()=>{const u=new UndoStack();u.push({block:0,hunks:[]});const x=u.popUndo()!;u.pushRedo(x.inverse);assert.equal(u.canRedo,true);u.push(x.inverse);assert.equal(u.canRedo,false);});
test('real engine: blocks and replace through the core, undo by inverse, tables locked',{skip:!haveWasm},async()=>{
 const core=await realCore();core.handle({id:1,kind:'open',bytes:ab(fixture('sample.docx'))});
 const b0=core.handle({id:2,kind:'blocks'}).res;assert.ok(b0.ok&&b0.kind==='blocks');
 const blocks=(b0 as Extract<DocumentsResponse,{kind:'blocks'}>).blocks;
 const table=blocks.find(b=>b.kind==='table');assert.ok(table&&!table.editable);
 assert.equal(core.handle({id:3,kind:'replace',block:table!.index,hunks:[{start:0,end:0,text:'x'}]}).res.ok,false);
 const p=blocks[0];const edit=diffEdit(0,p.text!,'Edited '+p.text!)!;const inv=inverseOf(p.text!,edit);
 const r=core.handle({id:4,kind:'replace',block:edit.block,hunks:edit.hunks}).res;assert.ok(r.ok&&r.kind==='edited'&&r.document.text.startsWith('Edited '));
 const u=core.handle({id:5,kind:'replace',block:inv.block,hunks:inv.hunks}).res;assert.ok(u.ok&&u.kind==='edited'&&u.document.text.startsWith(p.text!));
 assert.equal(core.handle({id:6,kind:'replace',block:0,hunks:[{start:0,end:0,text:'a\nb'}]}).res.ok,false);
});

test('real engine: multi-hunk edit applies atomically, bad second hunk changes nothing',{skip:!haveWasm},async()=>{
 const core=await realCore();core.handle({id:1,kind:'open',bytes:ab(fixture('sample.docx'))});
 const blocks=(core.handle({id:2,kind:'blocks'}).res as Extract<DocumentsResponse,{kind:'blocks'}>).blocks;const t=blocks[0].text!;
 const next='A '+t.replace('worker','Somnia')+'!';const e=diffEdit(0,t,next)!;assert.ok(e.hunks.length>=3);
 const r=core.handle({id:3,kind:'replace',block:0,hunks:e.hunks}).res;assert.ok(r.ok&&r.kind==='edited'&&r.document.text.startsWith(next));
 const bl=(core.handle({id:4,kind:'blocks'}).res as Extract<DocumentsResponse,{kind:'blocks'}>).blocks[0].text;assert.equal(bl,next);
 const bad=core.handle({id:5,kind:'replace',block:0,hunks:[{start:0,end:1,text:''},{start:99999,end:99999,text:'x'}]}).res;assert.equal(bad.ok,false);
 assert.equal((core.handle({id:6,kind:'blocks'}).res as Extract<DocumentsResponse,{kind:'blocks'}>).blocks[0].text,next);
});
