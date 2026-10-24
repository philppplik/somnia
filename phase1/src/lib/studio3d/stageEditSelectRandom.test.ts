import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectRandom: the seed makes the pick repeatable, ratio 1 selects everything',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectRandom('vertex',0.5,42);
 const first=st.editSelection().verts;
 assert.ok(first.length>0&&first.length<24);
 st.editSelectRandom('vertex',0.5,42);
 assert.deepEqual(st.editSelection().verts,first);
 st.editSelectRandom('vertex',1,42);
 assert.equal(st.editSelection().verts.length,24);
});

test('stage editSelectRandom: different seeds pick differently and edges work',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectRandom('vertex',0.5,1);
 const a=st.editSelection().verts.join(',');
 st.editSelectRandom('vertex',0.5,2);
 const b=st.editSelection().verts.join(',');
 assert.notEqual(a,b);
 st.editSelectRandom('edge',1,7);
 assert.ok(st.editSelection().edges.length>0);
 st.editSelectRandom('face',1,7);
 assert.equal(st.editSelection().faces.length,12);
});

test('stage editSelectRandom: validates ratio and seed',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectRandom('vertex',0,1),/greater than 0/);
 assert.throws(()=>st.editSelectRandom('vertex',1.5,1),/at most 1/);
 assert.throws(()=>st.editSelectRandom('vertex',0.5,0),/whole number between 1 and 1000000000/);
});
