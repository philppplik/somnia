import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectRing: grows a vertical seed edge into the ring of the four vertical cube edges',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[0,2]]);
 st.editSelectRing();
 assert.deepEqual(st.editSelection().edges,[[0,2],[1,3],[4,6],[5,7]]);
});

test('stage editSelectRing: a face-diagonal seed rings into all six face diagonals of the cube',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[21,22]]);
 st.editSelectRing();
 assert.deepEqual(st.editSelection().edges,[[1,2],[5,6],[9,10],[13,14],[17,18],[21,22]]);
});

test('stage editSelectRing: two disjoint seeds grow into the union of both rings',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[0,2],[8,9]]);
 st.editSelectRing();
 assert.deepEqual(st.editSelection().edges,[[0,2],[1,3],[4,6],[5,7],[8,9],[10,11],[12,13],[14,15]]);
});

test('stage editSelectRing: needs an edge selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectRing(),/Select edges to grow into rings/);
});
