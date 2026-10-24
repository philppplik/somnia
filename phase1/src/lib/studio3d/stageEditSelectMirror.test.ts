import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectMirror: mirrors a vertex selection position-keyed, extend joins it',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[0]);
 st.editSelectMirror('x',false);
 assert.deepEqual(st.editSelection().verts,[5,10,16]);
 st.editSelectAll('none','vertex');
 st.editSelect('vertex',[0]);
 st.editSelectMirror('x',true);
 assert.deepEqual(st.editSelection().verts,[0,5,10,16]);
 st.editSelectMirror('y',true);
 assert.deepEqual(st.editSelection().verts,[0,2,5,7,10,12,13,16,18,19]);
});

test('stage editSelectMirror: faces mirror to the tris fully inside the mirrored vertex set',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[0,1]);
 st.editSelectMirror('x',false);
 assert.deepEqual(st.editSelection().faces,[2,3]);
 st.editSelectAll('none','face');
 st.editSelect('edge',[[8,10]]);
 st.editSelectMirror('x',false);
 assert.deepEqual(st.editSelection().edges,[[0,1],[9,11]]);
});

test('stage editSelectMirror: validates an empty selection and geometry without a mirror',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectMirror('x',false),/Select something first/);
 st.editSelect('vertex',[0]);
 st.editMove([0.5,0,0]);
 st.editSelectAll('none','vertex');
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editSelectMirror('x',false),/No mirrored geometry found/);
});
