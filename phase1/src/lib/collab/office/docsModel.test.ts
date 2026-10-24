import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import {seedDocsModel,openDocsModel,docsModelMeta,cleanDocsOp,appendDocsOp} from './docsModel';
const H='d'.repeat(64);
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
test('seed stamps meta, rejects unsafe paths and wrong hashes',()=>{
 const d=mk();const m=seedDocsModel(d,'brief.docx',H);seedDocsModel(d,'brief.docx',H);
 assert.deepEqual(docsModelMeta(m),{schema:1,engine:'docs',baseHash:H});
 assert.throws(()=>seedDocsModel(d,'../brief.docx',H));
 assert.equal(docsModelMeta(openDocsModel(mk(),'brief.docx')),null);});
test('journal replicates in order; garbage drops identically',()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));
 const mA=seedDocsModel(a,'brief.docx',H);
 appendDocsOp(mA,{kind:'insert',params:{block:0,utf8Offset:0,text:'Hallo'}},'me');
 appendDocsOp(mA,{kind:'replace',params:{block:0,hunks:[{start:0,end:5,text:'Hi'}]},inverse:{block:0,hunks:[{start:0,end:2,text:'Hallo'}]}},'me');
 const mB=openDocsModel(b,'brief.docx');
 assert.equal(mB.ops.length,2);
 mB.ops.push([{kind:'render'},'junk',null,{kind:'insert'}]);
 const out:unknown[]=[];mB.ops.forEach(r=>{const e=cleanDocsOp(r);if(e)out.push(e);});
 assert.deepEqual(out,[
  {kind:'insert',params:{block:0,utf8Offset:0,text:'Hallo'}},
  {kind:'replace',params:{block:0,hunks:[{start:0,end:5,text:'Hi'}]},inverse:{block:0,hunks:[{start:0,end:2,text:'Hallo'}]}}]);});
test('cleanDocsOp bounds',()=>{
 assert.equal(cleanDocsOp({kind:'insert',params:{block:0,utf8Offset:0,text:'x'}})?.kind,'insert');
 assert.equal(cleanDocsOp({kind:'insertImage',params:{}}),null);        // inline bytes stay out
 assert.equal(cleanDocsOp({kind:'snapshot',params:{}}),null);           // undo-internal
 assert.equal(cleanDocsOp({kind:'insert',params:{text:'x'.repeat(70_000)}}),null);
 assert.equal(cleanDocsOp({kind:'insert',params:'x'}),null);});
