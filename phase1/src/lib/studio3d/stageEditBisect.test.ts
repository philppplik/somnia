import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editBisect: cuts the mesh by a plane and keeps both halves, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editBisect('y',0,true);
 assert.equal(o.geometry.getIndex()!.array.length/3,44);
 assert.ok(o.geometry.getAttribute('uv'));
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]});
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 assert.equal(o.geometry.getAttribute('position').count,24);
});

test('stage editBisect: without fill the halves stay open',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editBisect('y',0,false);
 assert.equal(o.geometry.getIndex()!.array.length/3,28);
});

test('stage editBisect: validates the axis and a plane that misses',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editBisect('q' as 'x',0,true),/must be x, y or z/);
 assert.throws(()=>st.editBisect('y',5,true),/does not cut through the mesh/);
});
