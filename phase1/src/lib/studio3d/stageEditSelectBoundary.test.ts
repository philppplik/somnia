import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';

test('stage editSelectBoundary: a closed cube has no boundary, a deleted side opens a four-edge rim',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 st.editSelectBoundary('edge');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'closed mesh has no border');
 st.editSelect('face',[4,5]);
 st.editDelete('face');
 st.editSelectBoundary('edge');
 assert.equal(st.editSelection().edges.length,4,'the hole rim is four position-keyed edges');
 st.editSelectBoundary('vertex');
 assert.equal(st.editSelection().verts.length,12,'every split vertex on the four rim positions comes along');
 st.editEnd();
 assert.throws(()=>st.editSelectBoundary('edge'),StageError);
});

test('stage editSelectBoundary: replaces the current selection of its kind only',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDelete('face');
 st.editSelect('face',[0]);
 st.editSelectBoundary('edge');
 assert.deepEqual(st.editSelection().faces,[0],'faces untouched');
 assert.equal(st.editSelection().edges.length,4);
 st.editSelectBoundary('vertex');
 assert.equal(st.editSelection().edges.length,4,'edges untouched');
 assert.equal(st.editSelection().verts.length,12);
});
