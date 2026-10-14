import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {subdivideFaces,EditError,type MeshData} from './editMesh';

test('stage editSubdivide: one cube side splits into eight triangles, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editSubdivide();
 assert.equal(o.geometry.getIndex()!.count/3,18,'two triangles become eight');
 assert.notEqual(o.geometry,g,'geometry swapped');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after subdivide');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,18);
});

test('stage editSubdivide: guards refuse empty selections and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editSubdivide(),/Select faces to subdivide/);
 assert.throws(()=>st.editSelect('face',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editSubdivide(),StageError);
});

test('subdivideFaces shares midpoints across selected neighbours, interpolates UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1],mask:[1,1,1,1]};
 const r=subdivideFaces(m,[0]);
 assert.equal(r.index.length/3,4+1,'one split, one passthrough');
 assert.equal(r.positions.length/3,7,'three midpoints added');
 assert.deepEqual(r.index.slice(-3),[1,3,2],'unselected triangle untouched');
 const mid01=[(m.positions[0]+m.positions[3])/2,(m.positions[1]+m.positions[4])/2];
 assert.deepEqual([r.positions[12],r.positions[13]],mid01,'first midpoint sits on edge 0-1');
 assert.equal(r.uvs!.length,14,'uv rows stay aligned with positions');
 assert.deepEqual([r.uvs![8],r.uvs![9]],[0.5,0],'uv midpoint interpolates');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 const both=subdivideFaces(m,[0,1]);
 assert.equal(both.positions.length/3,4+5,'the shared edge midpoint is created once');
 assert.throws(()=>subdivideFaces(m,[]),EditError);
 assert.throws(()=>subdivideFaces(m,[2]),EditError);
 assert.throws(()=>subdivideFaces(m,[-1]),EditError);
});
