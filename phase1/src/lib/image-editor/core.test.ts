import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageDocument, appendOperation, updateOperation, parseDocument, serializeDocument, withOperations, assertImageSize } from './document';
import { fitViewport, zoomAt, screenToImage, panBy } from './viewport';
import { createOperationRegistry, OperationRegistry, renderStack } from './pipeline';
import { exportSettings } from './export';
import { imageMime } from './loader';
import type { ImageOperation } from './types';
const source={id:'source',name:'test.png',mime:'image/png',width:2,height:1};
const op:ImageOperation={id:'one',type:'raster',version:1,enabled:true,params:{edit:{op:'invert'}}};
const image={width:2,height:1,data:new Uint8ClampedArray([10,20,30,255,100,110,120,128])};
test('document snapshots and parameter trees are detached and immutable',()=>{
  const base=createImageDocument(source), next=appendOperation(base,op);
  assert.equal(base.operations.length,0); assert.equal(next.revision,1);
  assert.ok(Object.isFrozen(next.operations)); assert.ok(Object.isFrozen(next.operations[0].params.edit));
  assert.deepEqual(parseDocument(serializeDocument(next)),next);
  assert.equal(updateOperation(next,'one',{enabled:false}).operations[0].enabled,false);
});
test('reject duplicate IDs, invalid schema and invalid dimensions',()=>{
  assert.throws(()=>withOperations(createImageDocument(source),[op,op]),/Duplicate/);
  for(const size of [[0,1],[1.5,1],[Infinity,1],[100000,100000]]) assert.throws(()=>assertImageSize(...size as [number,number]));
  assert.throws(()=>parseDocument('{"schemaVersion":2}'));
  assert.throws(()=>appendOperation(createImageDocument(source),{...op,params:{bad:NaN}}));
});
test('viewport anchored zoom preserves image point and clamps',()=>{
  const view=fitViewport({width:1000,height:500},{width:600,height:400}),anchor={x:137,y:82};
  const before=screenToImage(anchor,view),after=screenToImage(anchor,zoomAt(view,8,anchor));
  assert.ok(Math.abs(before.x-after.x)<1e-9);assert.ok(Math.abs(before.y-after.y)<1e-9);
  assert.equal(zoomAt(view,1000,anchor).zoom,64);assert.equal(panBy(view,{x:10,y:20}).x,view.x+10);
});
test('CPU bridge replays stack without changing original pixels',async()=>{
  const doc=appendOperation(createImageDocument(source),op), registry=createOperationRegistry();
  const result=await renderStack(image,doc,registry);
  assert.deepEqual([...result.data],[245,235,225,255,155,145,135,128]);assert.equal(image.data[0],10);
  const disabled=updateOperation(doc,'one',{enabled:false});assert.deepEqual((await renderStack(image,disabled,registry)).data,image.data);
});
test('custom async handler, operation order, dimensions and cancellation',async()=>{
  const registry=new OperationRegistry();registry.register({type:'add',version:1,async apply(input,params){const out={...input,data:new Uint8ClampedArray(input.data)};out.data[0]+=params.amount as number;return out;}});
  const doc=withOperations(createImageDocument(source),[{...op,type:'add',params:{amount:5}},{...op,id:'two',type:'add',params:{amount:10}}]);
  assert.equal((await renderStack(image,doc,registry)).data[0],25);
  const controller=new AbortController();controller.abort();await assert.rejects(renderStack(image,doc,registry,{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(renderStack(image,appendOperation(createImageDocument(source),op),registry),/Unsupported/);
});
test('mutation-prone handler cannot change the retained base',async()=>{
  const registry=new OperationRegistry();registry.register({type:'raster',version:1,apply(input){input.data[0]=1;return input;}});
  await renderStack(image,appendOperation(createImageDocument(source),op),registry);assert.equal(image.data[0],10);
});
test('handler output is validated and registration ownership is deterministic',async()=>{
  const registry=new OperationRegistry(),handler={type:'raster',version:1,apply(){return {width:1,height:1,data:new Uint8ClampedArray(0)};}};
  const unregister=registry.register(handler);assert.throws(()=>registry.register(handler));
  await assert.rejects(renderStack(image,appendOperation(createImageDocument(source),op),registry),/Invalid RGBA/);unregister();assert.throws(()=>registry.get(op));
});
test('file format and export settings are explicit and refuse silent fallbacks',()=>{
  assert.equal(imageMime('A.JPEG'),'image/jpeg');assert.equal(imageMime('a.webp','image/webp'),'image/webp');assert.throws(()=>imageMime('a.gif'));
  assert.throws(()=>imageMime('a.png','image/svg+xml'));assert.equal(exportSettings({format:'jpg',quality:0.8}).mime,'image/jpeg');
  assert.throws(()=>exportSettings({format:'webp',quality:2}));assert.throws(()=>exportSettings({format:'png',quality:NaN}));
});
