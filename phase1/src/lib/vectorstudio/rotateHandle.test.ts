import {test} from 'node:test';
import assert from 'node:assert/strict';
import {angleAround,centerOf,selectionHandle,turnPoint} from './rotateHandle';
import {rotateSelection,selectionBounds} from './transforms';
import {rectPath} from './shapes';
import {normalizeDoc} from '../vectorio';
const near=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
test('handle is centred above the bounds at a fixed screen distance',()=>{
 const b={x:10,y:20,width:100,height:50},h=selectionHandle(b,2);near(h.x,60);near(h.y,20-11);
 assert.throws(()=>selectionHandle(b,0),RangeError);assert.throws(()=>selectionHandle(b,-1),RangeError);
 assert.deepEqual(centerOf(b),{x:60,y:45});
});
test('angleAround: quarter turns, snap, wrap-around and bad input',()=>{
 const c={x:0,y:0},h={x:0,y:-50};
 near(angleAround(c,h,{x:50,y:0}),90);near(angleAround(c,h,{x:-50,y:0}),-90);near(Math.abs(angleAround(c,h,{x:0,y:50})),180,0.06);near(angleAround(c,h,h),0);
 assert.equal(angleAround(c,h,turnPoint(c,h,37),true),30);assert.equal(angleAround(c,h,turnPoint(c,h,38),true),45);assert.equal(angleAround(c,h,turnPoint(c,h,40),true),45);
 assert.equal(angleAround(c,h,{x:NaN,y:1}),0);assert.equal(angleAround(c,h,c),0);
 const t=turnPoint(c,h,90);near(t.x,50);near(t.y,0);
});
test('rotating about the handle centre matches the default and an explicit centre is honoured',()=>{
 const doc=normalizeDoc({width:200,height:200,paths:[{...rectPath({x:10,y:10,w:20,h:20}),id:'a'}]} as any);
 const b=selectionBounds(doc,['a'])!;
 const d1=rotateSelection(doc,['a'],90),d2=rotateSelection(doc,['a'],90,centerOf(b));
 assert.deepEqual(d1.paths[0].nodes.map(n=>[n.x,n.y]),d2.paths[0].nodes.map(n=>[n.x,n.y]));
 const d3=rotateSelection(doc,['a'],90,{x:0,y:0});const n0=doc.paths[0].nodes[0],n3=d3.paths[0].nodes[0];near(n3.x,-n0.y);near(n3.y,n0.x);
});
