import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {twistMesh,separateMesh,type MeshData} from './editMesh';

const meshDataOf=(st:Stage,m:{geometry:unknown})=>(st as unknown as {meshDataOf:(x:unknown)=>MeshData}).meshDataOf(m);
const hasVert=(m:MeshData,x:number,y:number,z:number)=>{for(let v=0;v<m.positions.length/3;v++)if(Math.abs(m.positions[v*3]-x)<1e-6&&Math.abs(m.positions[v*3+1]-y)<1e-6&&Math.abs(m.positions[v*3+2]-z)<1e-6)return true;return false;};

test('twistMesh rotates the top of a cube by the full angle and leaves the bottom still',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const r=twistMesh(d,'z',45);
 assert.ok(hasVert(r,0.5,0.5,-0.5),'bottom corner (t=0) does not move');
 assert.ok(hasVert(r,0,Math.SQRT1_2,0.5),'top corner rotated 45 degrees around the centre line');
 assert.ok(!hasVert(r,0,Math.SQRT1_2,-0.5),'the rotation only applies at the top');
 assert.equal(separateMesh(r).length,1,'mesh stays one part');
 assert.deepEqual(r.uvs,d.uvs,'UVs carried');
});

test('twistMesh respects the sculpt mask and validates its input',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const masked:MeshData={...d,mask:new Array(d.positions.length/3).fill(1)};
 assert.deepEqual(twistMesh(masked,'z',90).positions,d.positions,'fully masked mesh does not move');
 assert.throws(()=>twistMesh(d,'x',0),/non-zero/);
 assert.throws(()=>twistMesh(d,'x',800),/non-zero/);
 assert.throws(()=>twistMesh({positions:[0,0,0,1,0,0,0,1,0],index:[0,1,2]},'z',90),/flat along the twist axis/);
});

test('stage twist: batch over two meshes, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('torus');
 const ga=a.geometry,gb=b.geometry;
 assert.equal(st.twist('y',120,[a.id,b.id]),2);
 st.undo();
 assert.equal(a.geometry,ga);
 assert.equal(b.geometry,gb);
 st.redo();
 assert.ok(a.geometry!==ga);
});
