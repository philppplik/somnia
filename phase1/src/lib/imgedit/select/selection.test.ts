import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImage } from '../../image/buffer';
import { appendOperation, createImageDocument, parseDocument, serializeDocument } from '../../image-editor/document';
import { OperationRegistry, renderStack } from '../../image-editor/pipeline';
import { combineSelections, copySelection, cutSelection, decodeSelection, emptySelection, encodeSelection, fillSelection, lassoSelection, rectSelection, registerSelectionOps, selectionBounds, selectionCutOp, selectionFillOp, selectionOutline, validateSelection, wandSelection } from './index';
const rect = () => rectSelection(4, 3, { x: 1, y: 0 }, { x: 3, y: 2 });
test('reverse rectangles clip and select pixel centers, zero-area remains empty', () => {
  assert.deepEqual([...rect().data], [0,1,1,0,0,1,1,0,0,0,0,0]);
  assert.deepEqual(rectSelection(4,3,{x:3,y:2},{x:1,y:0}), rect());
  assert.equal(selectionBounds(rectSelection(4,3,{x:-100,y:-10},{x:100,y:99}))?.width,4);
  assert.equal(selectionBounds(rectSelection(4,3,{x:1,y:1},{x:1,y:2})),null);
  assert.equal(selectionBounds(rectSelection(4,3,{x:90,y:90},{x:99,y:99})),null);
  assert.throws(()=>rectSelection(4,3,{x:NaN,y:0},{x:0,y:0}));
});
test('lasso closes automatically and rectangle lasso matches rectangle tool', () => {
  assert.deepEqual(lassoSelection(4,3,[{x:1,y:0},{x:3,y:0},{x:3,y:2},{x:1,y:2}]), rect());
  assert.equal(selectionBounds(lassoSelection(4,3,[{x:0,y:0},{x:1,y:1}])),null);
  assert.deepEqual([...lassoSelection(3,3,[{x:0,y:0},{x:3,y:0},{x:0,y:3}]).data],[1,1,0,1,0,0,0,0,0]);
});
test('concave lasso and self-crossing use even-odd fill', () => {
  const mask=lassoSelection(3,3,[{x:0,y:0},{x:3,y:0},{x:3,y:1},{x:1,y:1},{x:1,y:3},{x:0,y:3}]);
  assert.deepEqual([...mask.data],[1,1,1,1,0,0,1,0,0]);
  const crossed=lassoSelection(4,4,[{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}]);
  assert.equal(crossed.data.reduce((a,b)=>a+b,0),8);
});
test('wand selects only four-connected pixels relative to the seed, not gradient drift', () => {
  const image=createImage(4,1,[0,0,0,255]); [0,10,20,0].forEach((n,i)=>image.data[i*4]=n);
  assert.deepEqual([...wandSelection(image,{x:.2,y:.2},10).data],[1,1,0,0]);
  const diagonal=createImage(2,2,[100,100,100,255]); diagonal.data.set([0,0,0,255],0); diagonal.data.set([0,0,0,255],12);
  assert.deepEqual([...wandSelection(diagonal,{x:0,y:0},0).data],[1,0,0,0]);
});
test('wand alpha differences count but hidden RGB of transparent pixels does not',()=>{
  const image=createImage(3,1,[0,0,0,0]); image.data.set([255,99,50,0],4); image.data[11]=255;
  assert.deepEqual([...wandSelection(image,{x:0,y:0}).data],[1,1,0]);
  assert.deepEqual([...wandSelection(image,{x:0,y:0},255).data],[1,1,1]);
  assert.equal(selectionBounds(wandSelection(image,{x:-1,y:0})),null);
  for(const t of [-1,256,NaN])assert.throws(()=>wandSelection(image,{x:0,y:0},t));
});
test('selection modes are immutable and reject mismatched dimensions',()=>{
  const a=rect(), b=rectSelection(4,3,{x:2,y:1},{x:4,y:3});
  assert.equal(combineSelections(a,b,'add').data.reduce((a,b)=>a+b,0),7);
  assert.equal(combineSelections(a,b,'intersect').data.reduce((a,b)=>a+b,0),1);
  assert.equal(combineSelections(a,b,'subtract').data.reduce((a,b)=>a+b,0),3);
  assert.deepEqual(combineSelections(a,b,'replace'),b);assert.notEqual(combineSelections(a,b,'replace').data,b.data);
  assert.throws(()=>combineSelections(a,emptySelection(1,1),'add'));
});
test('irregular copy crops to bounds, preserves alpha, keeps excluded pixels transparent',()=>{
  const image=createImage(4,3,[10,20,30,123]), mask=rect();mask.data[2]=0;
  const clip=copySelection(image,mask)!;assert.deepEqual(clip.origin,{x:1,y:0});assert.equal(clip.image.width,2);
  assert.deepEqual([...clip.image.data],[10,20,30,123,0,0,0,0,10,20,30,123,10,20,30,123]);
  clip.image.data[0]=0;assert.equal(image.data[4],10);assert.equal(copySelection(image,emptySelection(4,3)),null);
});
test('cut clears all selected RGBA, fill replaces straight-alpha bytes without mutating source',()=>{
  const image=createImage(4,3,[10,20,30,128]), mask=rect();
  assert.deepEqual([...cutSelection(image,mask).data.slice(4,8)],[0,0,0,0]);
  const filled=fillSelection(image,mask,[99,88,77,66]);assert.deepEqual([...filled.data.slice(4,8)],[99,88,77,66]);
  assert.deepEqual([...filled.data.slice(0,4)],[10,20,30,128]);assert.equal(image.data[4],10);
  assert.throws(()=>fillSelection(image,mask,[0,0,0,256]));assert.throws(()=>fillSelection(image,emptySelection(1,1),[0,0,0,0]));
});
test('run encoding roundtrips and rejects malformed, overlapping and out-of-bounds runs',()=>{
  assert.deepEqual(decodeSelection(encodeSelection(rect()),rect()),rect());
  for(const runs of [[[0,0]],[[0,13]],[[2,2],[1,1]],[[0,1.5]],[[0]],[[0,'1']]]) assert.throws(()=>decodeSelection({width:4,height:3,runs},rect()));
  assert.throws(()=>decodeSelection({width:1,height:1,runs:[]},rect()));
  const bad=rect();bad.data[0]=255;assert.throws(()=>validateSelection(bad));
});
test('selection ops replay in core registry after JSON roundtrip and respect enabled flag',async()=>{
  const image=createImage(4,3,[10,20,30,128]), source={id:'s',name:'x.png',mime:'image/png',width:4,height:3};
  const registry=new OperationRegistry();const undo=registerSelectionOps(registry);
  let doc=appendOperation(createImageDocument(source),selectionFillOp(rect(),[99,88,77,66]));
  assert.deepEqual((await renderStack(image,parseDocument(serializeDocument(doc)),registry)).data,fillSelection(image,rect(),[99,88,77,66]).data);
  doc=appendOperation(doc,selectionCutOp(rect()));assert.deepEqual((await renderStack(image,doc,registry)).data,cutSelection(image,rect()).data);
  const disabled=appendOperation(createImageDocument(source),{...selectionCutOp(rect()),enabled:false});assert.deepEqual((await renderStack(image,disabled,registry)).data,image.data);
  undo();await assert.rejects(renderStack(image,doc,registry),/Unsupported/);
});
test('cancellation is propagated through wand, lasso, cut and registered operations',async()=>{
  const c=new AbortController();c.abort();const image=createImage(4,3);
  assert.throws(()=>wandSelection(image,{x:0,y:0},0,c.signal),{name:'AbortError'});
  assert.throws(()=>lassoSelection(4,3,[],c.signal),{name:'AbortError'});
  assert.throws(()=>cutSelection(image,rect(),c.signal),{name:'AbortError'});
  const registry=new OperationRegistry();registerSelectionOps(registry);
  const op=selectionCutOp(rect());await assert.rejects(async()=>registry.get(op).apply(image,op.params,{signal:c.signal}),{name:'AbortError'});
});
test('outline has no interior seams and includes hole boundaries',()=>{
  assert.equal(selectionOutline(rect()),'M1 0H3M1 2H3M1 0V2M3 0V2');
  const mask=rectSelection(3,3,{x:0,y:0},{x:3,y:3});mask.data[4]=0;
  const outline=selectionOutline(mask);assert.ok(outline.includes('M1 1H2'));assert.ok(outline.includes('M1 2H2'));
  assert.equal(selectionOutline(emptySelection(3,3)),'');
});
