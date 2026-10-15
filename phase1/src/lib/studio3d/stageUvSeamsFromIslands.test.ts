import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage uvSeamsFromIslands: the fully UV-split cube gets seams on its twelve real edges, not the face diagonals',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.uvSeamsFromIslands();
 assert.equal(st.seamsOf(o).length,12);
});

test('stage uvSeamsFromIslands: the sphere gets seams along its UV cut, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('sphere') as import('three').Mesh;
 st.editStart(o.id);
 st.uvSeamsFromIslands();
 const n=st.seamsOf(o).length;
 assert.ok(n>0&&n<200,`sphere seams ${n}`);
 st.undo();
 assert.equal(st.seamsOf(o).length,0);
 st.redo();
 assert.equal(st.seamsOf(o).length,n);
});

test('stage uvSeamsFromIslands: replaces the seam set, so a cleared island border comes back',()=>{
 const st=new Stage();
 const o=st.addPrimitive('sphere') as import('three').Mesh;
 st.editStart(o.id);
 st.uvSeamsFromIslands();
 const n=st.seamsOf(o).length;
 const edge=st.seamsOf(o)[0];
 st.editSelect('edge',[edge]);
 st.uvSeamMark(false);
 assert.equal(st.seamsOf(o).length,n-1);
 st.uvSeamsFromIslands();
 assert.equal(st.seamsOf(o).length,n);
});

test('stage uvSeamsFromIslands: needs UVs',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 o.geometry.deleteAttribute('uv');
 assert.throws(()=>st.uvSeamsFromIslands(),/no UVs/);
});
