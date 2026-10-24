import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectSharp: selects edges at or above the dihedral threshold, twins included',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectSharp(30);
 assert.equal(st.editSelection().edges.length,24);
 st.editSelectSharp(91);
 assert.equal(st.editSelection().edges.length,0);
 st.editSelectSharp(0);
 assert.equal(st.editSelection().edges.length,30);
});

test('stage editSelectSharp: validates the angle and the edit session',()=>{
 const st=new Stage();
 assert.throws(()=>st.editSelectSharp(),/being edited/);
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectSharp(-1),/between 0 and 180/);
 assert.throws(()=>st.editSelectSharp(200),/between 0 and 180/);
});

test('stage editSelectSharp: a duplicated coplanar shell adds only its rim twins, never new sharp angles',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 st.editSelectSharp(30);
 assert.equal(st.editSelection().edges.length,28);
 st.editSelectSharp(91);
 assert.equal(st.editSelection().edges.length,0);
});
