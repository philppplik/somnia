import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {extrudeFacesIndividual,type MeshData} from './editMesh';

// Single square face (two triangles) in the z=0 plane.
const quad=():MeshData=>({positions:[0,0,0,1,0,0,1,1,0,0,1,0],index:[0,1,2,0,2,3]});

test('extrudeFacesIndividual: each face grows along its own normal with its own walls',()=>{
 const r=extrudeFacesIndividual(quad(),[0,1],0.5);
 assert.equal(r.positions.length/3,4+6,'four originals plus three duplicates per face');
 assert.equal(r.index.length/3,14,'two tops plus six wall quads (twelve triangles)');
 const tops=[6,7,8,9].map(v=>r.positions[v*3+2]);
 assert.ok(tops.every(z=>Math.abs(z-0.5)<1e-9),'both tops sit at +0.5 along z');
 assert.equal(r.uvs,undefined,'UVs dropped');
});

test('extrudeFacesIndividual: neighbouring selected faces grow apart (walls on the shared edge too)',()=>{
 const ind=extrudeFacesIndividual(quad(),[0,1],0.5);
 const wallTris=ind.index.length/3-2;
 assert.equal(wallTris,12,'every edge of every face walls up, including the shared one');
 assert.throws(()=>extrudeFacesIndividual(quad(),[0],0),/non-zero/);
 assert.throws(()=>extrudeFacesIndividual(quad(),[7],0.5),/does not exist|Face/);
});

test('stage editExtrudeIndividual: cube side faces become towers, one undo restores',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 st.editSelect('face',[0,1]);
 const before=m.geometry.getAttribute('position').count;
 st.editExtrudeIndividual(0.4);
 assert.equal(m.geometry.getAttribute('position').count,before+6,'six duplicates');
 st.undo();
 assert.equal(m.geometry.getAttribute('position').count,before,'undo restores the vertex count');
 st.redo();
 assert.equal(m.geometry.getAttribute('position').count,before+6);
});
