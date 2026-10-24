import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {pdfName,safePdfName} from './saveCopy';
import {patchDocumentsExportUi,getDocumentsExportUi,requestDocumentsExportPdf,registerDocumentsExport} from './exportBridge';
import {patchDocuments,resetDocuments} from './store';
const enc=(s:string)=>new TextEncoder().encode(s);
function core(out:()=>Uint8Array){
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}export_pdf(){return out();}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);return k;
}
test('the engine PDF is passed on only when it is a PDF',()=>{
 const good=core(()=>enc('%PDF-1.7 body %%EOF')).handle({id:2,kind:'exportPdf'} as never).res as {ok:boolean;kind?:string};
 assert.equal(good.ok,true);assert.equal(good.kind,'saved');
 for(const bad of [new Uint8Array(0),enc('PK\u0003\u0004zip'),enc('%PDF')]){
  const r=core(()=>bad).handle({id:3,kind:'exportPdf'} as never).res as {ok:boolean};assert.equal(r.ok,false);
 }
 const r=core(()=>{throw new Error('adapter PDF limit: 2000 pages');}).handle({id:4,kind:'exportPdf'} as never).res as {ok:boolean;error?:string};
 assert.equal(r.ok,false);assert.match(r.error??'',/2000 pages/);
});
test('PDF file names are safe',()=>{
 assert.equal(pdfName('C:\\docs\\Report.docx'),'Report.pdf');
 assert.equal(safePdfName('','a.docx'),'a.pdf');
 assert.equal(safePdfName('../../evil<>:"|?*.pdf','a.docx'),'evil.pdf');
 assert.equal(safePdfName('Q3 plan','a.docx'),'Q3 plan.pdf');
 assert.equal(safePdfName('x'.repeat(500),'a.docx').length,120);
 assert.equal(safePdfName('..','a.docx'),'a.pdf');
});
test('PDF export waits for a ready document and a registered bridge',async()=>{
 let calls=0;resetDocuments();
 await requestDocumentsExportPdf();assert.equal(calls,0);
 const off=registerDocumentsExport({save:async()=>undefined,savePdf:async()=>{calls++;}});
 await requestDocumentsExportPdf();assert.equal(calls,0,'not ready');
 patchDocuments({status:'ready'});await requestDocumentsExportPdf();assert.equal(calls,1);
 patchDocuments({saving:true});await requestDocumentsExportPdf();assert.equal(calls,1,'no repeat while saving');
 off();resetDocuments();
 patchDocumentsExportUi({format:'pdf'});assert.equal(getDocumentsExportUi().format,'pdf');patchDocumentsExportUi({format:'docx'});
});
import {parsePdfPages,pdfOptionsProblem} from './protocol';
test('PDF page ranges',()=>{
 assert.deepEqual(parsePdfPages('',5),[]);assert.deepEqual(parsePdfPages(' 1-3, 5 ',5),[0,1,2,4]);assert.deepEqual(parsePdfPages('5,2',5),[4,1]);
 for(const bad of ['0','6','3-1','1-3,2','a','1,,2','1-','-2','1 2','x'.repeat(500)])assert.equal(parsePdfPages(bad,5),null,bad);
});
test('PDF options are checked before the engine',()=>{
 assert.equal(pdfOptionsProblem(undefined),null);assert.equal(pdfOptionsProblem({pages:[0,2],markup:true,tagged:false},3),null);
 for(const bad of [null,[],{pages:[]},{pages:[0,0]},{pages:[-1]},{pages:[1.5]},{pages:[3]},{pages:'1'},{markup:'y'},{colour:true}])assert.notEqual(pdfOptionsProblem(bad,3),null,JSON.stringify(bad));
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  export_pdf(){calls.push('all');return enc('%PDF-1.7');}export_pdf_opts(j:string){calls.push(j);return enc('%PDF-1.7');}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 assert.equal((k.handle({id:2,kind:'exportPdf'} as never).res as {ok:boolean}).ok,true);
 assert.equal((k.handle({id:3,kind:'exportPdf',options:{pages:[1],markup:true}} as never).res as {ok:boolean}).ok,true);
 assert.equal((k.handle({id:4,kind:'exportPdf',options:{pages:[1,1]}} as never).res as {ok:boolean}).ok,false);
 assert.deepEqual(calls,['all','{"pages":[1],"markup":true}']);
});
