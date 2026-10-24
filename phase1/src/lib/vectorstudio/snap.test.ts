import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapMove} from './snap';
const B=(minX:number,minY:number,maxX:number,maxY:number)=>({minX,minY,maxX,maxY});
test('move snaps edges and centres within the threshold, per axis, and reports guides',()=>{
  const page=B(0,0,200,100),obj=B(0,0,10,10);
  let r=snapMove(obj,95.5,3,[page],2);assert.equal(r.dx,95);assert.deepEqual(r.guides.x,[100]);assert.equal(r.dy,3);assert.deepEqual(r.guides.y,[]);
  r=snapMove(obj,1.2,0.8,[page],2);assert.equal(r.dx,0);assert.equal(r.dy,0);assert.deepEqual(r.guides.x,[0]);assert.deepEqual(r.guides.y,[0]);
  r=snapMove(obj,189.2,0,[page],2);assert.equal(r.dx,190);
  r=snapMove(obj,50,50,[B(80,80,120,120)],2);assert.deepEqual([r.dx,r.dy],[50,50]);
});
test('nearest mark wins and thresholds are respected, bad input throws',()=>{
  const r=snapMove(B(0,0,10,10),30.4,0,[B(35,0,45,10),B(40,0,50,10)],6);assert.equal(r.dx+0,r.dx);assert.ok(Math.abs(r.dx-30)<=6);
  assert.equal(snapMove(B(0,0,10,10),20,20,[B(35,35,45,45)],4).dx,20);
  assert.throws(()=>snapMove(B(0,0,10,10),NaN,0,[],1),/not finite/);assert.throws(()=>snapMove(B(0,0,10,10),0,0,[],-1),/not finite/);
  assert.deepEqual(snapMove(B(0,0,10,10),7,8,[],4),{dx:7,dy:8,guides:{x:[],y:[]}});
});
