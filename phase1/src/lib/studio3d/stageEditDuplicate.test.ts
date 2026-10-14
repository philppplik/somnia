import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {duplicateFaces,EditError,type MeshData} from './editMesh';

test('stage editDuplicate: one cube side doubles as a detached shell, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 assert.equal(o.geometry.getIndex()!.count/3,14,'two triangles copied');
 assert.equal(o.geometry.getAttribute('position').count,28,'four fresh vertex copies (the pair shares its diagonal)');
 assert.notEqual(o.geometry,g,'geometry swapped');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after duplicate');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,14);
});

test('stage editDuplicate: guards refuse empty selections and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editDuplicate(),/Select faces to duplicate/);
 assert.throws(()=>st.editSelect('face',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editDuplicate(),StageError);
});

test('duplicateFaces copies with fresh shared vertices, keeps UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1],mask:[1,1,1,1]};
 const r=duplicateFaces(m,[0]);
 assert.equal(r.index.length/3,3,'original two plus the copy');
 assert.equal(r.positions.length/3,7,'three fresh vertex copies');
 assert.deepEqual(r.index.slice(-3),[4,5,6],'copy appended with fresh indices');
 assert.deepEqual([r.positions[12],r.positions[13],r.positions[14]],[0,0,0],'copy matches the original position');
 assert.equal(r.uvs!.length,14,'uv rows copied with the vertices');
 assert.deepEqual([r.uvs![10],r.uvs![11]],[1,0],'uv copy matches');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 const both=duplicateFaces(m,[0,1]);
 assert.equal(both.positions.length/3,8,'copies share vertices where the originals share them');
 assert.equal(both.index.length/3,4);
 assert.throws(()=>duplicateFaces(m,[]),EditError);
 assert.throws(()=>duplicateFaces(m,[2]),EditError);
 assert.throws(()=>duplicateFaces(m,[-1]),EditError);
});
