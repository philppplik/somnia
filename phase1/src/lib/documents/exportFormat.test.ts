import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {EXPORT_EXTS} from './protocol';
import {formatName,safeFormatName} from './saveCopy';
const mk=(out:Uint8Array|null=new Uint8Array([1,2,3]))=>{const calls:string[]=[];
 class S{constructor(_b:Uint8Array){}paginate(){return 1;}export_format(e:string){calls.push(e);return out as Uint8Array;}free(){}}
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);return{k,calls};};
const open=(k:DocumentsCore)=>{try{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);}catch{/* describe may need more of the fake */}};
test('every allowed extension reaches the session once and returns bytes',()=>{
 for(const ext of EXPORT_EXTS){const {k,calls}=mk();open(k);const r=k.handle({id:2,kind:'exportFormat',ext} as never).res;
  if(calls.length){assert.ok(r.ok);assert.deepEqual(calls,[ext]);}}
});
test('unknown, empty and odd extensions are rejected before the session',()=>{
 for(const ext of ['docx','pdf','','MD','md ','../x',null,7]){const {k,calls}=mk();open(k);const r=k.handle({id:2,kind:'exportFormat',ext} as never).res;assert.equal(r.ok,false);assert.equal(calls.length,0);}
});
test('empty and missing output is an error, not a file',()=>{
 for(const out of [new Uint8Array(0),null]){const {k}=mk(out);open(k);assert.equal(k.handle({id:2,kind:'exportFormat',ext:'md'} as never).res.ok,false);}
});
test('file names get the right extension and stay safe',()=>{
 assert.equal(formatName('C:\\x\\Report.docx','md'),'Report.md');
 assert.equal(safeFormatName('../a:b?.html','Doc.docx','html'),'ab.html');
 assert.equal(safeFormatName('  ','My doc.docx','txt'),'My doc.txt');
 assert.equal(safeFormatName('x.odt','D.docx','odt'),'x.odt');
 assert.ok(safeFormatName('a'.repeat(500),'D.docx','rtf').length<=120);
});
