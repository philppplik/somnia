import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const TOP=[0,1,4,5,8,9,10,11,16,17,20,21];
const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;

test('stage editSnapToCursor: the selected vertices land on the cursor point, the rest stays',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',TOP);
 st.editSnapToCursor([2,0.5,0],false);
 const pos=o.geometry.getAttribute('position');
 for(const v of TOP)assert.ok(near(pos.getX(v),2)&&near(pos.getY(v),0)&&near(pos.getZ(v),0),`vertex ${v}`);
 assert.ok(near(pos.getX(2),0.5)&&near(pos.getY(2),-0.5)&&near(pos.getZ(2),0.5),'bottom untouched');
});

test('stage editSnapToCursor: offset mode keeps the selection shape and lands its centroid on the cursor',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',TOP);
 st.editSnapToCursor([2,0.5,0],true);
 const pos=o.geometry.getAttribute('position');
 // top centroid (0,0.5,0) -> cursor local (2,0,0): offset (2,-0.5,0)
 assert.ok(near(pos.getX(0),2.5)&&near(pos.getY(0),0)&&near(pos.getZ(0),0.5),`v0 ${pos.getX(0)},${pos.getY(0)},${pos.getZ(0)}`);
 assert.ok(near(pos.getX(2),0.5)&&near(pos.getY(2),-0.5)&&near(pos.getZ(2),0.5),'bottom untouched');
});

test('stage editSnapToCursor: is one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const before=[...(o.geometry.getAttribute('position').array as Float32Array)];
 st.editSelect('vertex',TOP);
 st.editSnapToCursor([2,0.5,0],false);
 st.undo();
 assert.deepEqual([...(o.geometry.getAttribute('position').array as Float32Array)],before);
});

test('stage editSnapToCursor: needs a vertex selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSnapToCursor([2,0.5,0],false),/Select vertices to snap/);
});
