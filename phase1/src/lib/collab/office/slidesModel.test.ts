import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import {seedSlidesModel,openSlidesModel,slidesModelMeta,cleanSlidesOp,appendSlidesOp,sharedSlidesOps} from './slidesModel';
const H='c'.repeat(64);
const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{for(const d of docs)d.destroy();});
test('seed stamps meta, opens idempotently, rejects unsafe paths',()=>{
 const d=mk();const m=seedSlidesModel(d,'deck.pptx',H);seedSlidesModel(d,'deck.pptx',H);
 assert.deepEqual(slidesModelMeta(m),{schema:1,engine:'slides-deck',baseHash:H});
 assert.equal(m.ops.length,0);
 assert.throws(()=>seedSlidesModel(d,'../deck.pptx',H));
 assert.equal(slidesModelMeta(openSlidesModel(mk(),'deck.pptx')),null);});
test('journal: entries survive replication in order, garbage is dropped',()=>{
 const a=mk(),b=mk();
 a.on('update',(u:Uint8Array)=>Y.applyUpdate(b,u));b.on('update',(u:Uint8Array)=>Y.applyUpdate(a,u));
 const mA=seedSlidesModel(a,'deck.pptx',H);
 appendSlidesOp(mA,{fn:'slideEdit',args:['duplicate',7]},'me');
 appendSlidesOp(mA,{fn:'notes',args:[[3],['line one','line two']]},'me');
 const mB=openSlidesModel(b,'deck.pptx');
 assert.equal(mB.ops.length,2);
 mB.ops.push([{fn:'nope'},'junk',{fn:'notes',args:'x'},null]);
 assert.deepEqual(sharedSlidesOps(mB),[
  {fn:'slideEdit',args:['duplicate',7]},
  {fn:'notes',args:[[3],['line one','line two']]}]);});
test('cleanSlidesOp bounds args',()=>{
 assert.equal(cleanSlidesOp({fn:'slideEdit',args:['duplicate',1]})?.fn,'slideEdit');
 assert.equal(cleanSlidesOp({fn:'pictureEdit',args:[]}),null);          // not in the CO3 whitelist
 assert.equal(cleanSlidesOp({fn:'notes',args:['x'.repeat(70_000)]}),null);
 assert.equal(cleanSlidesOp({fn:'notes'}),null);
 assert.equal(cleanSlidesOp('slideEdit'),null);});
