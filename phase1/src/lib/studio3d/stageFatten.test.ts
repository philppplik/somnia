import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {fattenMesh,separateMesh,type MeshData} from './editMesh';

const meshDataOf=(st:Stage,m:{geometry:unknown})=>(st as unknown as {meshDataOf:(x:unknown)=>MeshData}).meshDataOf(m);
const maxAbs=(p:number[],slot:number)=>{let m=0;for(let i=slot;i<p.length;i+=3)m=Math.max(m,Math.abs(p[i]));return m;};

test('fattenMesh pushes corners along their diagonal normal and shrinks on negative amounts',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const out=fattenMesh(d,0.1);
 assert.ok(Math.abs(maxAbs(out.positions,0)-0.5-0.1/Math.sqrt(3))<1e-6,'corner moves 0.1 along the diagonal');
 assert.equal(separateMesh(out).length,1,'twins push along one shared normal, no rip');
 const back=fattenMesh(d,-0.1);
 assert.ok(Math.abs(maxAbs(back.positions,0)-0.5+0.1/Math.sqrt(3))<1e-6,'negative shrinks');
 assert.deepEqual(out.uvs,d.uvs,'UVs untouched');
 assert.throws(()=>fattenMesh(d,0),/non-zero/);
});

test('fattenMesh respects the sculpt mask',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const masked:MeshData={...d,mask:new Array(d.positions.length/3).fill(1)};
 const out=fattenMesh(masked,0.5);
 assert.deepEqual(out.positions,d.positions,'fully masked mesh does not move');
 const half:MeshData={...d,mask:new Array(d.positions.length/3).fill(0.5)};
 const oh=fattenMesh(half,0.1);
 assert.ok(Math.abs(maxAbs(oh.positions,0)-0.5-0.05/Math.sqrt(3))<1e-6,'half mask halves the push');
});

test('stage fatten: batch over two meshes, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('sphere');
 const b=st.addPrimitive('torus');
 const ga=a.geometry,gb=b.geometry;
 assert.equal(st.fatten(0.1,[a.id,b.id]),2);
 st.undo();
 assert.equal(a.geometry,ga);
 assert.equal(b.geometry,gb);
 st.redo();
 assert.ok(a.geometry!==ga);
});
