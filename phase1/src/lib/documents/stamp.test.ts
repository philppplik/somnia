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
