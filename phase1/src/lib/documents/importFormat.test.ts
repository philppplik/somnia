import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {importedName,importExt,importFormatFile,MAX_IMPORT_BYTES} from './importFormat';
const mk=(out:Uint8Array|null=new Uint8Array([80,75,3,4]))=>{const calls:string[]=[];
 class S{constructor(_b:Uint8Array){}static import_format(e:string,_b:Uint8Array){calls.push(e);return out as Uint8Array;}}
 return{k:new DocumentsCore(S as never),calls};};
const ab=(n:number)=>new Uint8Array(n).fill(65).buffer;
test('extensions map to formats; others are refused',()=>{
 assert.equal(importExt('a.MD'),'md');assert.equal(importExt('x/y.markdown'),'md');assert.equal(importExt('p.htm'),'html');assert.equal(importExt('n.text'),'txt');
 for(const n of ['a.docx','a.pdf','a','a.','.md.exe','a.exe'])assert.equal(importExt(n),null);
});
test('imported names drop the extension, are safe and avoid taken names',()=>{
 assert.equal(importedName('C:\\x\\Notes.md'),'Notes.docx');
 assert.equal(importedName('a:b?.html'),'ab.docx');
 assert.equal(importedName('.md'),'Imported.docx');
 assert.equal(importedName('Notes.md',n=>n==='Notes.docx'),'Notes (2).docx');
});
test('the worker request converts once and returns docx bytes',()=>{
 const {k,calls}=mk();const r=k.handle({id:1,kind:'importFormat',ext:'md',bytes:ab(10)} as never).res;
 assert.ok(r.ok);assert.deepEqual(calls,['md']);
});
test('bad ext, empty, oversized and empty output are errors',()=>{
 for(const req of [{ext:'docx',bytes:ab(5)},{ext:'md',bytes:new ArrayBuffer(0)},{ext:'md',bytes:ab(MAX_IMPORT_BYTES+1)},{ext:'md',bytes:'x'}]){
  const {k,calls}=mk();assert.equal(k.handle({id:1,kind:'importFormat',...req} as never).res.ok,false);assert.equal(calls.length,0);}
 const {k}=mk(new Uint8Array(0));assert.equal(k.handle({id:1,kind:'importFormat',ext:'md',bytes:ab(5)} as never).res.ok,false);
});
test('importFormatFile refuses before starting an engine',async()=>{
 let made=0;const f=()=>{made++;throw new Error('no');};
 assert.ok('error' in await importFormatFile(new Blob(['x']),'a.exe',f as never));
 assert.ok('error' in await importFormatFile(new Blob([]),'a.md',f as never));
 assert.ok('error' in await importFormatFile(new Blob([new Uint8Array(MAX_IMPORT_BYTES+1)]),'a.md',f as never));
 assert.equal(made,0);
});
