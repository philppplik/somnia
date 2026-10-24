import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {pokeFaces,EditError,type MeshData} from './editMesh';

test('stage editPoke: one cube side splits into six triangles, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editPoke();
 assert.equal(o.geometry.getIndex()!.count/3,16,'two triangles become six');
 assert.equal(o.geometry.getAttribute('position').count,26,'one centroid per poked face');
 assert.notEqual(o.geometry,g,'geometry swapped');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after poke');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,16);
});

test('stage editPoke: guards refuse empty selections and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editPoke(),/Select faces to poke/);
 assert.throws(()=>st.editSelect('face',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editPoke(),StageError);
});

test('pokeFaces inserts a centroid per face, interpolates UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1],mask:[1,1,1,1]};
 const r=pokeFaces(m,[0]);
 assert.equal(r.index.length/3,3+1,'one poked, one passthrough');
 assert.equal(r.positions.length/3,5,'one centroid added');
 assert.deepEqual(r.index.slice(-3),[1,3,2],'unselected triangle untouched');
 assert.deepEqual([r.positions[12],r.positions[13],r.positions[14]],[2/3,2/3,0],'centroid sits at the average of the corners');
 assert.equal(r.uvs!.length,10,'uv rows stay aligned with positions');
 assert.deepEqual([r.uvs![8],r.uvs![9]],[1/3,1/3],'uv centroid interpolates');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 const both=pokeFaces(m,[0,1]);
 assert.equal(both.positions.length/3,6,'each poked face gets its own centroid');
 assert.equal(both.index.length/3,6);
 assert.throws(()=>pokeFaces(m,[]),EditError);
 assert.throws(()=>pokeFaces(m,[2]),EditError);
 assert.throws(()=>pokeFaces(m,[-1]),EditError);
});
