import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectChecker: drops every nth selected vertex from the offset',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','vertex');
 st.editSelectChecker('vertex',2,0);
 assert.deepEqual(st.editSelection().verts,[1,3,5,7,9,11,13,15,17,19,21,23]);
 st.editSelectAll('all','vertex');
 st.editSelectChecker('vertex',2,1);
 assert.deepEqual(st.editSelection().verts,[0,2,4,6,8,10,12,14,16,18,20,22]);
});

test('stage editSelectChecker: faces and edges follow the same sorted-id pattern',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editSelectChecker('face',3,2);
 assert.deepEqual(st.editSelection().faces,[0,1,3,4,6,7,9,10]);
 st.editSelectAll('all','edge');
 const total=st.editSelection().edges.length;
 st.editSelectChecker('edge',2,0);
 assert.equal(st.editSelection().edges.length,Math.ceil(total/2));
});

test('stage editSelectChecker: validates step, offset and empty selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectChecker('vertex',2,0),/Select something first/);
 st.editSelectAll('all','vertex');
 assert.throws(()=>st.editSelectChecker('vertex',1,0),/step must be a whole number of 2 or more/);
 assert.throws(()=>st.editSelectChecker('vertex',2,2),/offset must be a whole number below the step/);
});
