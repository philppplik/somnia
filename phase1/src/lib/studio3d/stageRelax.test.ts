import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {relaxMesh,separateMesh,type MeshData} from './editMesh';

const grid=(n:number,jitter:number):MeshData=>{
 const positions:number[]=[];const uvs:number[]=[];const index:number[]=[];
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){
  const inner=x>0&&x<n-1&&z>0&&z<n-1;
  positions.push(x,inner?Math.sin(x*7+z*13)*jitter:0,z);uvs.push(x/(n-1),z/(n-1));
 }
 for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){
  const a=z*n+x,b=a+1,c=a+n,d=c+1;index.push(a,c,b,b,c,d);
 }
 return{positions,index,uvs};
};
const maxDev=(p:number[])=>{let m=0;for(let i=1;i<p.length;i+=3)m=Math.max(m,Math.abs(p[i]));return m;};

test('relaxMesh calms a noisy grid and pins the border',()=>{
 const g=grid(5,0.3);
 const r=relaxMesh(g,5,0.5);
 assert.ok(maxDev(r.positions)<maxDev(g.positions)*0.5,'deviation drops clearly');
 for(let v=0;v<g.positions.length/3;v++){
  const x=v%5,z=Math.floor(v/5);
  if(x>0&&x<4&&z>0&&z<4)continue;
  assert.equal(r.positions[v*3+1],g.positions[v*3+1],`border vertex ${v} pinned`);
 }
 assert.deepEqual(r.uvs,g.uvs,'UVs untouched');
});

test('relaxMesh moves UV-seam twins as one (no rips) and respects the sculpt mask',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=(st as unknown as {meshDataOf:(m:unknown)=>MeshData}).meshDataOf(c);
 const r=relaxMesh(d,3,0.5);
 assert.equal(separateMesh(r).length,1,'twins moved together');
 // positions of twin vertices (same start position) stay identical
 const byPos=new Map<string,number>();
 for(let v=0;v<d.positions.length/3;v++){
  const k=[0,1,2].map(i=>d.positions[v*3+i].toFixed(4)).join(',');
  const seen=byPos.get(k);
  if(seen===undefined)byPos.set(k,v);
  else for(let i=0;i<3;i++)assert.ok(Math.abs(r.positions[v*3+i]-r.positions[seen*3+i])<1e-9,`twin ${v} matches`);
 }
 const g=grid(5,0.3);const masked:MeshData={...g,mask:new Array(g.positions.length/3).fill(0)};
 masked.mask![6]=1; // interior vertex
 const rm=relaxMesh(masked,3,0.5);
 assert.equal(rm.positions[19],g.positions[19],'fully masked vertex does not move');
 assert.throws(()=>relaxMesh(g,0,0.5),/whole number/);
 assert.throws(()=>relaxMesh(g,1,0),/between 0/);
});

test('stage relax: batch over two meshes, one undo restores geometry exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('sphere');
 const b=st.addPrimitive('cone');
 const ga=a.geometry,gb=b.geometry;
 const ya=a.geometry.getAttribute('position').getY(0);
 assert.equal(st.relax(2,0.5,[a.id,b.id]),2);
 assert.notEqual(a.geometry.getAttribute('position').getY(0),ya);
 st.undo();
 assert.equal(a.geometry,ga);
 assert.equal(b.geometry,gb);
 st.redo();
 assert.ok(a.geometry!==ga);
});
