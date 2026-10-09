import test from 'node:test';import assert from 'node:assert/strict';
import {pathToContours,contoursToPath,reverseContour,contourEndingAt,isEndpoint,dragSegment,bezierAt,segmentPoints,cloneContours} from './pathnodes';
const C1='M0 0C0 50 100 50 100 0';
test('reverse keeps the exact curve and swaps handles',()=>{
 const c=pathToContours(C1)![0];const r=reverseContour(c);
 assert.deepEqual([r.nodes[0].x,r.nodes[1].x],[100,0]);
 const f=bezierAt(segmentPoints(c.nodes[0],c.nodes[1]),0.3),b=bezierAt(segmentPoints(r.nodes[0],r.nodes[1]),0.7);
 assert.ok(Math.hypot(f.x-b.x,f.y-b.y)<1e-9);
 assert.deepEqual(reverseContour(r).nodes.map(n=>[n.x,n.y,n.in,n.out]),c.nodes.map(n=>[n.x,n.y,n.in,n.out]));});
test('contourEndingAt returns the contour oriented to continue from an endpoint, and refuses interior nodes and closed paths',()=>{
 const c=pathToContours('M0 0L10 0L20 5L30 5')![0];
 assert.equal(contourEndingAt(c,3)!.nodes[3].x,30);assert.equal(contourEndingAt(c,0)!.nodes[3].x,0);assert.equal(contourEndingAt(c,1),null);
 assert.equal(isEndpoint(pathToContours('M0 0L10 0L10 10Z')![0],0),false);});
test('dragSegment: the curve point at t lands on the target (curve)',()=>{
 const c=pathToContours(C1)![0];const t=0.5;const to={x:50,y:60};dragSegment(c,0,t,to);
 const p=bezierAt(segmentPoints(c.nodes[0],c.nodes[1]),t);assert.ok(Math.hypot(p.x-to.x,p.y-to.y)<1e-6);
 assert.deepEqual([c.nodes[0].x,c.nodes[0].y,c.nodes[1].x,c.nodes[1].y],[0,0,100,0]);});
test('dragSegment turns a straight segment into a curve through the target',()=>{
 const c=pathToContours('M0 0L90 0')![0];dragSegment(c,0,0.5,{x:45,y:30});
 assert.ok(c.nodes[0].out&&c.nodes[1].in);const p=bezierAt(segmentPoints(c.nodes[0],c.nodes[1]),0.5);assert.ok(Math.hypot(p.x-45,p.y-30)<1e-6);
 assert.match(contoursToPath([c]),/C/);});
test('dragSegment keeps a smooth neighbour collinear',()=>{
 const cs=pathToContours('M0 0C0 40 30 40 50 40C80 40 100 40 100 0')!;const c=cs[0];assert.equal(c.nodes[1].kind,'smooth');
 dragSegment(c,0,0.5,{x:25,y:80});const n=c.nodes[1];const ix=n.x-n.in!.x,iy=n.y-n.in!.y,ox=n.out!.x-n.x,oy=n.out!.y-n.y;
 assert.ok(Math.abs(ix*oy-iy*ox)<1e-6);});
test('cloneContours is deep',()=>{const a=pathToContours(C1)!;const b=cloneContours(a);b[0].nodes[0].out!.x=999;assert.notEqual(a[0].nodes[0].out!.x,999);});
