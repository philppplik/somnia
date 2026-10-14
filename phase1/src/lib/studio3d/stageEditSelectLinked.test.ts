import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';

test('stage editSelectLinked: a whole cube links from one seed, a duplicated shell links only itself',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 st.editSelect('vertex',[0]);
 st.editSelectLinked('vertex');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'the split cube sides are index islands: one side links');
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'duplicate cleared the selection');
 st.editSelect('vertex',[24]);
 st.editSelectLinked('vertex');
 assert.deepEqual(st.editSelection().verts,[24,25,26,27],'the fresh shell links only its own vertices');
 st.editSelectLinked('face');
 assert.deepEqual(st.editSelection().faces,[12,13],'the two copied faces');
 st.editSelectLinked('edge');
 assert.equal(st.editSelection().edges.length,5,'quad rim plus its diagonal');
});

test('stage editSelectLinked: seeds from any kind, refuses an empty selection and edit mode off',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editSelectLinked('vertex'),/Select something first/);
 st.editSelect('edge',[[1,2]]);
 st.editSelectLinked('vertex');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'an edge seeds its endpoints, linked across its side');
 st.editSelectAll('none','vertex');
 st.editSelect('face',[7]);
 st.editSelectLinked('vertex');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3,12,13,14,15],'a face seeds its corners, and two sides share index verts here');
 st.editEnd();
 assert.throws(()=>st.editSelectLinked('vertex'),StageError);
});
