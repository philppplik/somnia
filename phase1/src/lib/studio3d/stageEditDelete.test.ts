import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {deleteElements,EditError,type MeshData} from './editMesh';

test('stage editDelete: faces delete their triangles, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDelete('face');
 assert.equal(o.geometry.getIndex()!.count/3,10);
 assert.notEqual(o.geometry,g,'geometry swapped');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after delete');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,10);
});

test('stage editDelete: an edge removes every triangle touching it, a vertex only its own',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[1,2]]);
 st.editDelete('edge');
 assert.equal(o.geometry.getIndex()!.count/3,10,'quad diagonal deletes both quad triangles');
 st.undo();
 st.editSelect('vertex',[0]);
 st.editDelete('vertex');
 assert.equal(o.geometry.getIndex()!.count/3,11,'corner vertex touches one triangle');
 assert.equal(o.geometry.getAttribute('position').count,24,'positions stay, orphans allowed');
});

test('stage editDelete: guards refuse empty selections and a full wipe',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editDelete('face'),/Select faces/);
 st.editSelectAll('all','vertex');
 assert.throws(()=>st.editDelete('vertex'),/empty mesh/);
 assert.throws(()=>st.editDelete('edge'),/Select edges/);
 st.editEnd();
 assert.throws(()=>st.editDelete('face'),StageError);
});

test('deleteElements validates ids, keeps UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 1,0,0, 1,0,1, 0,0,1, 2,0,0],index:[0,2,1, 0,3,2, 1,2,4],uvs:[0,0, 1,0, 1,1, 0,1, 2,0],mask:[0,0,0,0,0]};
 const r=deleteElements(m,'face',{faces:[2]});
 assert.deepEqual(r.index,[0,2,1, 0,3,2]);
 assert.equal(r.uvs!.length,10,'uvs stay aligned with untouched positions');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 assert.throws(()=>deleteElements(m,'face',{faces:[3]}),EditError);
 assert.throws(()=>deleteElements(m,'vertex',{verts:[99]}),EditError);
 assert.throws(()=>deleteElements(m,'edge',{edges:[[0,99]]}),EditError);
 assert.throws(()=>deleteElements(m,'edge',{edges:[[0,4]]}),/not part of this mesh/);
 assert.throws(()=>deleteElements(m,'face',{faces:[0,1,2]}),/empty mesh/);
});
