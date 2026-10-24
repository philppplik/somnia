import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editMergeByDistance: welds position and UV twins, keeps UV seams, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','vertex');
 st.editMergeByDistance(0.001);
 assert.equal(o.geometry.getAttribute('position').count,20);
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 st.undo();
 assert.equal(o.geometry.getAttribute('position').count,24);
});

test('stage editMergeByDistance: a duplicated shell welds back onto its source in one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 assert.equal(o.geometry.getAttribute('position').count,28);
 st.editSelectAll('all','vertex');
 st.editMergeByDistance(0.001);
 assert.equal(o.geometry.getAttribute('position').count,20);
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 st.undo();
 assert.equal(o.geometry.getAttribute('position').count,28);
});

test('stage editMergeByDistance: validates selection, distance and doubles, never welds UV seams or unselected verts',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editMergeByDistance(0.001),/Select vertices to merge/);
 st.editSelectAll('all','vertex');
 assert.throws(()=>st.editMergeByDistance(0),/positive/);
 assert.throws(()=>st.editMergeByDistance(Number.NaN),/positive/);
 st.editSelectAll('none','vertex');
 st.editSelect('vertex',[0,11]);
 assert.throws(()=>st.editMergeByDistance(0.001),/within the merge distance/);
 st.editSelectAll('none','vertex');
 st.editSelect('vertex',[1,9]);
 st.editMergeByDistance(0.001);
 assert.equal(o.geometry.getAttribute('position').count,23);
});
