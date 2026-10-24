import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {taperMesh,separateMesh,type MeshData} from './editMesh';

const meshDataOf=(st:Stage,m:{geometry:unknown})=>(st as unknown as {meshDataOf:(x:unknown)=>MeshData}).meshDataOf(m);
const hasVert=(m:MeshData,x:number,y:number,z:number)=>{for(let v=0;v<m.positions.length/3;v++)if(Math.abs(m.positions[v*3]-x)<1e-6&&Math.abs(m.positions[v*3+1]-y)<1e-6&&Math.abs(m.positions[v*3+2]-z)<1e-6)return true;return false;};

test('taperMesh scales the top of a cube by the factor and leaves the bottom at 1',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const r=taperMesh(d,'z',2);
 assert.ok(hasVert(r,0.5,0.5,-0.5),'bottom corner (t=0) does not move');
 assert.ok(hasVert(r,1,1,0.5),'top corner doubled around the centre line');
 assert.equal(separateMesh(r).length,1,'mesh stays one part');
 assert.deepEqual(r.uvs,d.uvs,'UVs carried');
 const inv=taperMesh(d,'z',-1);
 assert.ok(hasVert(inv,-0.5,-0.5,0.5),'negative factor inverts the far end');
});

test('taperMesh respects the sculpt mask and validates its input',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const masked:MeshData={...d,mask:new Array(d.positions.length/3).fill(1)};
 assert.deepEqual(taperMesh(masked,'z',2).positions,d.positions,'fully masked mesh does not move');
 const half:MeshData={...d,mask:new Array(d.positions.length/3).fill(0.5)};
 assert.ok(hasVert(taperMesh(half,'z',2),0.75,0.75,0.5),'half mask halves the effect (scale 1.5)');
 assert.throws(()=>taperMesh(d,'x',0),/non-zero/);
 assert.throws(()=>taperMesh(d,'x',11),/non-zero/);
 assert.throws(()=>taperMesh({positions:[0,0,0,1,0,0,0,1,0],index:[0,1,2]},'z',2),/flat along the taper axis/);
});

test('stage taper: batch over two meshes, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('torus');
 const ga=a.geometry,gb=b.geometry;
 assert.equal(st.taper('y',2,[a.id,b.id]),2);
 st.undo();
 assert.equal(a.geometry,ga);
 assert.equal(b.geometry,gb);
 st.redo();
 assert.ok(a.geometry!==ga);
});
