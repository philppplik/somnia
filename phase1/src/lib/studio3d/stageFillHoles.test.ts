import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {fillHolesMesh,separateMesh,solidifyMesh,type MeshData} from './editMesh';

const quad=()=>({positions:[0,0,0, 1,0,0, 1,0,1, 0,0,1],index:[0,2,1, 0,3,2],uvs:[0,0, 1,0, 1,1, 0,1]});
const volume=(positions:number[],index:number[])=>{
 let v=0;
 for(let f=0;f<index.length;f+=3){
  const a=index[f]*3,b=index[f+1]*3,c=index[f+2]*3;
  v+=positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])
   +positions[a+1]*(positions[b+2]*positions[c]-positions[b]*positions[c+2])
   +positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]);
 }
 return v/6;
};
const meshDataOf=(st:Stage,m:{geometry:unknown})=>(st as unknown as {meshDataOf:(x:unknown)=>MeshData}).meshDataOf(m);

test('fillHolesMesh caps a lone quad and closes its border',()=>{
 const r=fillHolesMesh(quad());
 assert.equal(r.holes,1);
 assert.equal(r.mesh.positions.length/3,5,'centre vertex added');
 assert.equal(r.mesh.index.length/3,6,'4 cap triangles');
 assert.equal(r.mesh.uvs!.length,10,'centre UV averaged in');
 // no open border left: solidify adds no side walls
 assert.equal(solidifyMesh(r.mesh,0.1,0).index.length/3,12);
});

test('fillHolesMesh on a cube without its top restores the closed volume',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 const keep:number[]=[];
 for(let f=0;f<d.index.length;f+=3){
  const ys=[d.positions[d.index[f]*3+1],d.positions[d.index[f+1]*3+1],d.positions[d.index[f+2]*3+1]];
  if(!(ys[0]>0.4&&ys[1]>0.4&&ys[2]>0.4))keep.push(d.index[f],d.index[f+1],d.index[f+2]);
 }
 const r=fillHolesMesh({positions:d.positions,index:keep,...(d.uvs?{uvs:d.uvs}:{})});
 assert.equal(r.holes,1);
 assert.equal(separateMesh(r.mesh).length,1);
 assert.ok(Math.abs(volume(r.mesh.positions,r.mesh.index)-1)<1e-6,'watertight cube again');
});

test('fillHolesMesh fills two holes and refuses a closed mesh',()=>{
 const two=quad();const base=two.positions.length/3;
 const m:MeshData={positions:[...two.positions,...two.positions.map((v,i)=>i%3===0?v+5:v)],index:[...two.index,...two.index.map(i=>i+base)],uvs:[...two.uvs!,...two.uvs!]};
 assert.equal(fillHolesMesh(m).holes,2);
 const st=new Stage();
 const c=st.addPrimitive('cube');
 assert.throws(()=>fillHolesMesh(meshDataOf(st,c)),/no open borders/);
});

test('stage fillHoles: batch skips closed meshes, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const p=st.addPrimitive('plane');
 const c=st.addPrimitive('cube');
 const gp=p.geometry;
 assert.equal(st.fillHoles([p.id,c.id]),1,'plane filled, closed cube skipped');
 assert.equal(p.geometry.getAttribute('position').count,5);
 st.undo();
 assert.equal(p.geometry,gp,'plane geometry restored');
 st.redo();
 assert.ok(p.geometry!==gp);
 const st2=new Stage();
 const cc=st2.addPrimitive('cube');
 assert.throws(()=>st2.fillHoles([cc.id]),/already closed/);
});
