import test from 'node:test';
import assert from 'node:assert/strict';
import {importSvg,serializeContour} from '../vectorio';
import {boxOf,hitDocument,insertNode,pathBox,segmentCount,nearestOnPath} from './geometry';
import {buildShape,ellipsePath,rectPath,starPath} from './shapes';
import * as S from './session';
const near=(a:number,b:number,eps=0.5)=>assert.ok(Math.abs(a-b)<=eps,`${a} vs ${b}`);
test.beforeEach(()=>S.resetVectorSession());
test('shapes: rect, rounded rect, ellipse, star, polygon have the expected boxes and node counts',()=>{
 const r=rectPath({x:10,y:20,w:100,h:50});assert.equal(r.nodes.length,4);assert.deepEqual(pathBox(r),{minX:10,minY:20,maxX:110,maxY:70});
 const rr=rectPath({x:0,y:0,w:100,h:50},10);assert.equal(rr.nodes.length,8);const b=pathBox(rr)!;near(b.maxX,100,0.1);near(b.maxY,50,0.1);
 const e=ellipsePath({x:0,y:0,w:100,h:60});assert.equal(e.nodes.length,4);const eb=pathBox(e)!;near(eb.minX,0,0.2);near(eb.maxX,100,0.2);near(eb.maxY,60,0.2);
 assert.equal(starPath({x:0,y:0,w:100,h:100},5).nodes.length,10);assert.equal(buildShape('polygon',{x:0,y:0},{x:50,y:50},{sides:8}).nodes.length,8);
 assert.equal(buildShape('line',{x:0,y:0},{x:5,y:5}).closed,false);
});
test('blank start needs no file; undo/redo are atomic steps',()=>{
 S.createBlankVector(512,256);const s=S.getVectorSession();assert.equal(s.open,true);assert.equal(s.doc.width,512);assert.equal(s.doc.paths.length,0);assert.equal(s.canUndo,false);
 S.addPath(buildShape('rect',{x:0,y:0},{x:50,y:50}));assert.equal(S.getVectorSession().doc.paths.length,1);assert.equal(S.getVectorSession().selection.length,1);
 S.undo();assert.equal(S.getVectorSession().doc.paths.length,0);S.redo();assert.equal(S.getVectorSession().doc.paths.length,1);
});
test('blank page sizes are clamped to a sane range',()=>{S.createBlankVector(0,99999);const d=S.getVectorSession().doc;assert.equal(d.width,1);assert.equal(d.height,16384);});
test('hit testing respects paint order, fill, stroke and hidden',()=>{
 S.createBlankVector();const a=rectPath({x:0,y:0,w:100,h:100}),b=rectPath({x:50,y:50,w:100,h:100});S.addPath(a);S.addPath(b);
 const doc=S.getVectorSession().doc;assert.equal(hitDocument(doc,{x:75,y:75}),b.id);assert.equal(hitDocument(doc,{x:10,y:10}),a.id);assert.equal(hitDocument(doc,{x:400,y:400}),null);
 S.toggleHidden(b.id);assert.equal(hitDocument(S.getVectorSession().doc,{x:75,y:75}),a.id);
 const noFill=rectPath({x:0,y:0,w:100,h:100},0,{fill:'none',stroke:'#000',strokeWidth:2});S.resetVectorSession();S.createBlankVector();S.addPath(noFill);
 assert.equal(hitDocument(S.getVectorSession().doc,{x:50,y:50}),null);assert.equal(hitDocument(S.getVectorSession().doc,{x:50,y:1}),noFill.id);
});
test('selection ops: move, bounds, style, z-order, duplicate, delete',()=>{
 S.createBlankVector();const a=rectPath({x:0,y:0,w:10,h:10}),b=rectPath({x:20,y:0,w:10,h:10});S.addPath(a);S.addPath(b);
 S.select([a.id]);S.moveSelection(5,7);assert.deepEqual(pathBox(S.getVectorSession().doc.paths[0]),{minX:5,minY:7,maxX:15,maxY:17});
 S.setSelectionBounds({w:30,h:20});const bx=pathBox(S.getVectorSession().doc.paths[0])!;near(bx.maxX-bx.minX,30,0.01);near(bx.maxY-bx.minY,20,0.01);
 S.setStyle({fill:'#ff0000'});assert.equal(S.getVectorSession().doc.paths[0].style?.fill,'#ff0000');
 S.reorder('front');assert.equal(S.getVectorSession().doc.paths[1].id,a.id);S.reorder('back');assert.equal(S.getVectorSession().doc.paths[0].id,a.id);
 S.reorder('forward');assert.equal(S.getVectorSession().doc.paths[1].id,a.id);S.reorder('backward');assert.equal(S.getVectorSession().doc.paths[0].id,a.id);
 S.duplicateSelection();assert.equal(S.getVectorSession().doc.paths.length,3);assert.notEqual(S.getVectorSession().selection[0],a.id);
 S.deleteSelection();assert.equal(S.getVectorSession().doc.paths.length,2);
});
test('node editing: move anchor with handles, mirror smooth handles, insert node keeps the shape, delete',()=>{
 S.createBlankVector();const e=ellipsePath({x:0,y:0,w:100,h:100});S.addPath(e);const n0=e.nodes[0];
 S.moveNode(e.id,n0.id,{x:n0.x+10,y:n0.y});let p=S.getVectorSession().doc.paths[0];near(p.nodes[0].x,n0.x+10,1e-9);near(p.nodes[0].out!.x,n0.out!.x+10,1e-9);
 S.moveNode(e.id,n0.id,{x:p.nodes[0].x+20,y:p.nodes[0].y-20},'out');p=S.getVectorSession().doc.paths[0];const n=p.nodes[0];
 near((n.in!.x+n.out!.x)/2,n.x,1e-6);near((n.in!.y+n.out!.y)/2,n.y,1e-6);
 const before=pathBox(rectPath({x:0,y:0,w:10,h:10}));assert.ok(before);
 const line=buildShape('line',{x:0,y:0},{x:100,y:0});const ins=insertNode(line,0,0.25,'mid');assert.equal(ins.nodes.length,3);near(ins.nodes[1].x,25,1e-9);
 const curved=ellipsePath({x:0,y:0,w:100,h:100});const c2=insertNode(curved,0,0.5,'m');assert.equal(c2.nodes.length,5);
 const before2=pathBox(curved)!,after2=pathBox(c2)!;near(before2.minX,after2.minX,0.3);near(before2.maxY,after2.maxY,0.3);
 const hit=nearestOnPath(line,{x:40,y:3})!;near(hit.t,0.4,0.01);near(hit.distance,3,0.01);
 S.resetVectorSession();S.createBlankVector();S.addPath(e);const id=S.addNodeNear(e.id,{x:50,y:0.5},6);assert.ok(id);assert.equal(S.getVectorSession().doc.paths[0].nodes.length,5);
 S.deleteNode(e.id,id!);assert.equal(S.getVectorSession().doc.paths[0].nodes.length,4);
 S.setNodeKind(e.id,e.nodes[1].id,'corner');assert.equal(S.getVectorSession().doc.paths[0].nodes[1].kind,'corner');
});
test('SVG round trip: export is clean, re-import gives the same document',()=>{
 S.createBlankVector(200,100,'a.svg');S.addPath(rectPath({x:10,y:10,w:80,h:40},8,{fill:'#336699',stroke:'#000000',strokeWidth:3}));S.addPath(ellipsePath({x:100,y:20,w:60,h:60}));
 const svg=S.toSvg();assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="200" height="100" viewBox="0 0 200 100">/);assert.ok(!/<script/i.test(svg));
 assert.ok(S.openSvgSource(svg,'b.svg'));const d=S.getVectorSession().doc;assert.equal(d.paths.length,2);assert.equal(d.width,200);
 assert.equal(S.toSvg(),svg);assert.equal(S.getVectorSession().name,'b.svg');
});
test('strict import refuses unsupported SVG with a visible diagnostic and keeps the open document',()=>{
 S.createBlankVector();S.addPath(rectPath({x:0,y:0,w:10,h:10}));
 const bad='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="0" y="5">hi</text></svg>';
 const ok=S.openSvgSource(bad,'bad.svg');assert.equal(ok,false);const s=S.getVectorSession();assert.ok(s.error);assert.equal(s.doc.paths.length,1);assert.ok(s.diagnostics.length>0);
 assert.equal(S.openSvgSource(bad,'bad.svg',{strict:false}),true);assert.ok(S.getVectorSession().diagnostics.length>0);
 assert.equal(S.openSvgSource('not xml at all','x.svg'),false);
});
test('import into an open document appends paths with fresh ids as one undo step',()=>{
 S.createBlankVector();const r=rectPath({x:0,y:0,w:10,h:10});S.addPath(r);
 const src=`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0L10 0L10 10Z"/></svg>`;
 assert.ok(S.importSvgInto(src));assert.equal(S.getVectorSession().doc.paths.length,2);S.undo();assert.equal(S.getVectorSession().doc.paths.length,1);
});
test('compound paths and segment counts',()=>{const r=rectPath({x:0,y:0,w:1,h:1});assert.equal(segmentCount(r),4);assert.equal(serializeContour(r.nodes,true).endsWith('Z'),true);void importSvg;void boxOf;});
