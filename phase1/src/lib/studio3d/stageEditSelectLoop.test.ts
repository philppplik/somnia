import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectLoop: grows a seed edge into its loop on a subdivided cube',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editSubdivide();
 st.editSelectAll('none','edge');
 st.editSelect('edge',[[0,24]]);
 st.editSelectLoop();
 assert.deepEqual(st.editSelection().edges,[[0,24],[2,24],[10,37],[11,37]]);
});

test('stage editSelectLoop: stops at ambiguous junctions on a plain triangulated cube',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[9,10]]);
 st.editSelectLoop();
 assert.equal(st.editSelection().edges.length,1);
});

test('stage editSelectLoop: needs an edge selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectLoop(),/Select edges to grow into loops/);
});
