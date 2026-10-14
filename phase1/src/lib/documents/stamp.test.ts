import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {SAVE_DATE} from './protocol';
const enc=(s:string)=>new TextEncoder().encode(s);
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  save(){calls.push('save');return enc('PK');}save_at(d:string){calls.push('save_at '+d);return enc('PK');}
  export_pdf(){calls.push('pdf');return enc('%PDF-1');}export_pdf_opts(o:string){calls.push('pdf_opts '+o);return enc('%PDF-1');}export_pdf_at(o:string,d:string){calls.push(`pdf_at ${o} ${d}`);return enc('%PDF-1');}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);return{k,calls};
}
const ok=(k:DocumentsCore,r:Record<string,unknown>)=>(k.handle({id:9,...r} as never).res as {ok:boolean}).ok;
test('the save date format',()=>{
 for(const g of ['2026-10-14T18:00:00Z','2026-10-14T18:00:00.123Z'])assert.ok(SAVE_DATE.test(g),g);
 for(const b of ['yesterday','2026-10-14','2026-10-14T18:00:00','2026-10-14T18:00:00+02:00','2026-10-14T18:00:00Z\n',''])assert.ok(!SAVE_DATE.test(b),b);
});
test('save and PDF stamp only with a valid date',()=>{
 const {k,calls}=core();const D='2026-10-14T18:00:00.000Z';
 assert.equal(ok(k,{kind:'save'}),true);assert.equal(ok(k,{kind:'save',date:D}),true);
 assert.equal(ok(k,{kind:'exportPdf'}),true);assert.equal(ok(k,{kind:'exportPdf',date:D,options:{markup:true}}),true);
 assert.deepEqual(calls,['save',`save_at ${D}`,'pdf',`pdf_at {"markup":true} ${D}`]);
 for(const bad of ['nope','2026-10-14',42,null]){assert.equal(ok(k,{kind:'save',date:bad}),false);assert.equal(ok(k,{kind:'exportPdf',date:bad}),false);}
 assert.equal(calls.length,4,'refused dates never reach the engine');
});
import {authorProblem,commentAuthor,savedAuthor,setAuthor,AUTHOR_KEY} from './author';
test('author names are bounded and stored locally',()=>{
 const mem=new Map<string,string>();
 (globalThis as unknown as {localStorage:Storage}).localStorage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>{mem.set(k,String(v));},removeItem:k=>{mem.delete(k);},clear:()=>mem.clear(),key:()=>null,length:0};
 assert.equal(commentAuthor(),'Somnia user');
 assert.equal(setAuthor('  Ada Lovelace '),true);assert.equal(savedAuthor(),'Ada Lovelace');assert.equal(commentAuthor(),'Ada Lovelace');
 for(const bad of ['x'.repeat(61),'bell\u0007','a\nb',42 as unknown as string]){assert.equal(setAuthor(bad),false,String(bad));assert.notEqual(authorProblem(bad),null);}
 assert.equal(savedAuthor(),'Ada Lovelace','refused names change nothing');
 mem.set(AUTHOR_KEY,'x\u0007y');assert.equal(savedAuthor(),'','a tampered stored value is ignored');
 assert.equal(setAuthor(''),true);assert.equal(commentAuthor(),'Somnia user');
});
test('the author reaches the engine only when valid',()=>{
 const {k,calls}=core();const D='2026-10-14T18:00:00.000Z';
 const S2=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  save_at_by(d:string,a:string){calls.push(`by ${d} ${a}`);return enc('PK');}save_at(d:string){calls.push('at '+d);return enc('PK');}};
 void k;const k2=new DocumentsCore(S2 as unknown as new(b:Uint8Array)=>DocSessionLike);k2.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 assert.equal(ok(k2,{kind:'save',date:D,author:' Ada '}),true);assert.equal(ok(k2,{kind:'save',date:D,author:''}),true);
 for(const bad of ['x'.repeat(61),'bell\u0007',7])assert.equal(ok(k2,{kind:'save',date:D,author:bad}),false);
 assert.deepEqual(calls,[`by ${D} Ada`,`at ${D}`]);
});
