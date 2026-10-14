import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {shareSheetsFile,adoptSheetsFile} from './officeSession';
import {sharedSheetList} from './sheetsModel';

const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
const bytes=(n:number)=>{const b=new Uint8Array(n);for(let i=0;i<n;i++)b[i]=i&0xff;return b;};

test('host shares: model stamped with the file hash and tab list',async()=>{
 const d=mk();const m=await shareSheetsFile(d,'book.xlsx',bytes(100),['Umsatz','Kosten']);
 assert.equal(sharedSheetList(m).map(s=>s.name).join(','),'Umsatz,Kosten');
});
test('guest adopts with identical bytes; any drift refuses honestly',async()=>{
 const a=mk(),b=mk();
 await shareSheetsFile(a,'book.xlsx',bytes(100),['S1']);
 Y.applyUpdate(b,Y.encodeStateAsUpdate(a));
 assert.equal((await adoptSheetsFile(b,'book.xlsx',bytes(100))).ok,true);
 const drift=bytes(100);drift[50]^=0xff;
 const bad=await adoptSheetsFile(b,'book.xlsx',drift);
 assert.deepEqual(bad,{ok:false,reason:'hash-mismatch'});
 assert.equal((await adoptSheetsFile(b,'other.xlsx',bytes(100))).ok===false,true);
});

test('slides share/adopt: hash verify, not-shared and mismatch',async()=>{
 const{shareSlidesFile,adoptSlidesFile}=await import('./officeSession');
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));
 const bytes=new TextEncoder().encode('pptx-bytes');
 const m=await shareSlidesFile(a,'deck.pptx',bytes);
 assert.equal(m.ops.length,0);
 assert.deepEqual(await adoptSlidesFile(b,'deck.pptx',bytes),{ok:true,model:(await adoptSlidesFile(b,'deck.pptx',bytes) as {model:unknown}).model});
 const bad=await adoptSlidesFile(b,'deck.pptx',new TextEncoder().encode('other'));
 assert.equal(bad.ok,false);if(!bad.ok)assert.equal(bad.reason,'hash-mismatch');
 const missing=await adoptSlidesFile(b,'none.pptx',bytes);
 assert.equal(missing.ok,false);if(!missing.ok)assert.equal(missing.reason,'not-shared');});

test('docs share/adopt: hash verify and mismatch',async()=>{
 const{shareDocsFile,adoptDocsFile}=await import('./officeSession');
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));
 const bytes=new TextEncoder().encode('docx-bytes');
 const m=await shareDocsFile(a,'brief.docx',bytes);
 assert.equal(m.ops.length,0);
 const ok=await adoptDocsFile(b,'brief.docx',bytes);
 assert.equal(ok.ok,true);
 const bad=await adoptDocsFile(b,'brief.docx',new TextEncoder().encode('other'));
 assert.equal(bad.ok,false);if(!bad.ok)assert.equal(bad.reason,'hash-mismatch');});
