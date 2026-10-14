import test from 'node:test';
import assert from 'node:assert/strict';
import {transformExpr,measureInfo,formatMeasure,mergeSnap,defaultSnap,SnapError} from './model';
import {Stage} from './stage';
import {resetStudio3D,getStudio3DState} from './session';

test('transformExpr parses absolute values, including negatives',()=>{
 assert.equal(transformExpr('7',1),7);
 assert.equal(transformExpr('-3',10),-3);
 assert.equal(transformExpr(' 2.5 ',0),2.5);
});
test('transformExpr parses relative +, * and / against the current value',()=>{
 assert.equal(transformExpr('+10',5),15);
 assert.equal(transformExpr('+-2',5),3);
 assert.equal(transformExpr('*2',5),10);
 assert.equal(transformExpr('/2',5),2.5);
});
test('transformExpr rejects junk and division by zero',()=>{
 assert.equal(transformExpr('',5),null);
 assert.equal(transformExpr('abc',5),null);
 assert.equal(transformExpr('+',5),null);
 assert.equal(transformExpr('/0',5),null);
});
test('measureInfo reports distance and elevation angle',()=>{
 const d=measureInfo({x:0,y:0,z:0},{x:3,y:0,z:4});
 assert.equal(d.distance,5);
 assert.equal(d.angle,0);
 const up=measureInfo({x:0,y:0,z:0},{x:0,y:2,z:0});
 assert.equal(up.distance,2);
 assert.ok(Math.abs(up.angle-90)<1e-9);
 const mixed=measureInfo({x:0,y:0,z:0},{x:1,y:1,z:0});
 assert.ok(Math.abs(mixed.angle-45)<1e-9);
});
test('measureInfo reports the signed per-axis delta',()=>{
 const d=measureInfo({x:1,y:2,z:3},{x:4,y:1,z:3});
 assert.deepEqual(d.delta,{x:3,y:-1,z:0});
});
test('formatMeasure scales to the scene unit and lists the deltas',()=>{
 const mi=measureInfo({x:0,y:0,z:0},{x:3,y:0,z:4});
 assert.equal(formatMeasure(mi,'m'),'5.000 m · 0.0° · Δ 3.000 / 0.000 / 4.000 m');
 assert.equal(formatMeasure(mi,'cm'),'500.000 cm · 0.0° · Δ 300.000 / 0.000 / 400.000 cm');
 assert.equal(formatMeasure(mi,'mm'),'5000.000 mm · 0.0° · Δ 3000.000 / 0.000 / 4000.000 mm');
 const up=measureInfo({x:0,y:0,z:0},{x:0,y:0.5,z:0});
 assert.equal(formatMeasure(up,'m'),'0.500 m · 90.0° · Δ 0.000 / 0.500 / 0.000 m');
 const neg=measureInfo({x:1,y:0,z:0},{x:0,y:0,z:0});
 assert.equal(formatMeasure(neg,'m'),'1.000 m · 0.0° · Δ -1.000 / 0.000 / 0.000 m');
});
test('mergeSnap accepts the midpoint mode and rejects unknown modes',()=>{
 assert.equal(mergeSnap(defaultSnap(),{mode:'midpoint'}).mode,'midpoint');
 assert.throws(()=>mergeSnap(defaultSnap(),{mode:'corner' as never}),SnapError);
});
test('snapPoint midpoint finds edge midpoints, not vertices',()=>{
 const stage=new Stage();
 const cube=stage.addPrimitive('cube');
 cube.position.set(0,0,0);stage.root.updateMatrixWorld(true);
 // A 1 m cube centred at the origin has an edge midpoint at (0, 0.5, 0.5).
 const hit=stage.snapPoint({x:0.02,y:0.5,z:0.52},'midpoint',[],0.1);
 assert.ok(hit,'expected a midpoint hit');
 assert.ok(Math.abs(hit!.x-0)<1e-6&&Math.abs(hit!.y-0.5)<1e-6&&Math.abs(hit!.z-0.5)<1e-6,`got ${JSON.stringify(hit)}`);
 // Vertex mode on the same spot snaps to the corner instead.
 const v=stage.snapPoint({x:0.45,y:0.5,z:0.5},'vertex',[],0.1);
 assert.ok(v&&Math.abs(v.x-0.5)<1e-6);
 // Nothing within a tiny radius far from any edge.
 assert.equal(stage.snapPoint({x:0,y:5,z:0},'midpoint',[],0.1),null);
});
test('snapPoint midpoint respects the exclude list',()=>{
 const stage=new Stage();
 const cube=stage.addPrimitive('cube');
 stage.root.updateMatrixWorld(true);
 assert.equal(stage.snapPoint({x:0,y:0.5,z:0.5},'midpoint',[cube.id],0.2),null);
});
test('precision session state defaults and survives scene resets',()=>{
 resetStudio3D();
 const s=getStudio3DState();
 assert.equal(s.pivot,'center');
 assert.deepEqual(s.cursor,{x:0,y:0,z:0});
 assert.equal(s.measure,null);
 resetStudio3D({pivot:'cursor',cursor:{x:1,y:2,z:3}});
 const k=getStudio3DState();
 assert.equal(k.pivot,'cursor');
 assert.deepEqual(k.cursor,{x:1,y:2,z:3});
 assert.equal(k.measure,null);
 resetStudio3D();
});
