import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editFlipEdge: rotates a shared edge to the other diagonal, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[9,10]]);
 st.editFlipEdge();
 let idx=Array.from(o.geometry.getIndex()!.array);
 assert.deepEqual(idx.slice(12,18),[8,11,9,11,8,10]);
 assert.equal(idx.length/3,12);
 st.undo();
 idx=Array.from(o.geometry.getIndex()!.array);
 assert.deepEqual(idx.slice(12,18),[8,10,9,10,11,9]);
});

test('stage editFlipEdge: refuses boundary edges and empty selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editFlipEdge(),/Select edges to flip/);
 st.editSelect('edge',[[8,9]]);
 assert.throws(()=>st.editFlipEdge(),/can be flipped/);
});

test('stage editFlipEdge: flips several independent diagonals in one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[9,10],[0,2]]);
 st.editFlipEdge();
 const idx=Array.from(o.geometry.getIndex()!.array);
 assert.equal(idx.length/3,12);
 assert.ok(!(idx.includes(9)&&idx.includes(10)&&idx.slice(12,18).join()===[8,10,9,10,11,9].join()));
 st.undo();
 assert.deepEqual(Array.from(o.geometry.getIndex()!.array).slice(12,18),[8,10,9,10,11,9]);
});
