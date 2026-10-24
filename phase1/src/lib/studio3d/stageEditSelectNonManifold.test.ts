import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectNonManifold: a healthy cube selects nothing',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectNonManifold();
 assert.equal(st.editSelection().verts.length,0);
});

test('stage editSelectNonManifold: a doubled shell makes every vertex non-manifold',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editDuplicate();
 st.editSelectNonManifold();
 assert.equal(st.editSelection().verts.length,48);
});

test('stage editSelectNonManifold: a healthy subdivided cube selects nothing',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editSubdivide();
 st.editSelectNonManifold();
 assert.equal(st.editSelection().verts.length,0);
});

test('stage editSelectNonManifold: a healthy sphere selects nothing',()=>{
 const st=new Stage();
 const o=st.addPrimitive('sphere') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectNonManifold();
 assert.equal(st.editSelection().verts.length,0);
});
