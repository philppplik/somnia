import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,normalizeDoc} from '../vectorio';
import {exportAreaDoc,visualBox,MAX_EXPORT_SIDE} from './exportArea';
import {rectPath} from './shapes';
import {renderPng,pngDimensions} from './exportFiles';
const mk=()=>{const a={...rectPath({x:100,y:50,w:40,h:20}),id:'a',style:{fill:'#ff0000',stroke:'none'}},b={...rectPath({x:300,y:200,w:10,h:10}),id:'b',style:{fill:'#0000ff',stroke:'#000000',strokeWidth:4,lineJoin:'bevel' as const}},c={...rectPath({x:0,y:0,w:5,h:5}),id:'c',hidden:true as const};
 return {width:500,height:400,paths:[a,b,c],guides:{x:[10],y:[]}} as any;};

test('area: page is the document untouched',()=>{const d=mk();assert.equal(exportAreaDoc(d,[],'page'),d);});
test('area: content crops to the visible objects incl. stroke, moves them to the origin, drops guides and hidden paths',()=>{
 const d=mk(),o=exportAreaDoc(d,[],'content');
 // a: x 100..140, b: 300..310 +2 stroke => 298..312 ; y 50..70 and 198..212
 assert.equal(o.width,212);assert.equal(o.height,162);assert.equal(o.paths.length,2);assert.equal(o.guides,undefined);
 assert.equal(o.paths[0].nodes[0].x,0);assert.equal(o.paths[0].nodes[0].y,0);assert.equal(o.paths[1].nodes[0].x,200);
 const p=exportAreaDoc(d,[],'content',10);assert.equal(p.width,232);assert.equal(p.paths[0].nodes[0].x,10);
 assert.equal(d.paths[0].nodes[0].x,100); // input is not mutated
});
test('area: selection crops to the selected objects, empty selection and locked/hidden are refused',()=>{
 const d=mk(),o=exportAreaDoc(d,['a'],'selection');assert.deepEqual([o.width,o.height,o.paths.length],[40,20,1]);
 assert.throws(()=>exportAreaDoc(d,[],'selection'),/Select at least one/);
 assert.throws(()=>exportAreaDoc(d,['c'],'selection'),/Select at least one/);
 assert.throws(()=>exportAreaDoc({...d,paths:[d.paths[2]]},[],'content'),/Nothing visible/);
});
test('area: bad parameters are rejected',()=>{
 const d=mk();for(const p of [-1,1001,NaN,Infinity])assert.throws(()=>exportAreaDoc(d,['a'],'selection',p),RangeError);
 assert.throws(()=>exportAreaDoc(d,[],'foo' as any),RangeError);
 const big={...d,paths:[rectPath({x:0,y:0,w:MAX_EXPORT_SIDE+5,h:10})]};assert.throws(()=>exportAreaDoc(big,[],'content'),/larger than/);
});
test('area: exported SVG of a cropped area reimports to the same geometry, and strokes are covered by the box',()=>{
 const d=mk(),o=exportAreaDoc(d,['b'],'selection'),svg=exportSvg(normalizeDoc(o)),r=importSvg(svg);
 assert.equal(r.doc.width,14);assert.equal(r.doc.height,14);assert.equal(r.doc.paths[0].nodes[0].x,2);
 const sq={...rectPath({x:0,y:0,w:10,h:10}),style:{stroke:'#000',strokeWidth:6,lineJoin:'miter' as const,miterLimit:10,lineCap:'square' as const}};
 const v=visualBox(sq)!;assert.equal(v.minX,-18);
 assert.equal(visualBox({id:'e',closed:false,nodes:[]} as any),null);
});
test('png: background flag is accepted and dimensions follow the area',()=>{
 assert.deepEqual(pngDimensions(212,162,2),{width:424,height:324});assert.equal(typeof renderPng,'function');
});
