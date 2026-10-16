import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
const mk=(segments=0)=>{
 const st=new Stage();
 const mesh=new THREE.Mesh(segments?new THREE.BoxGeometry(1,1,1,segments,segments,segments):new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xb8bcc8}));mesh.name='Box';
 st.loadMany([mesh]);st.root.updateMatrixWorld(true);
 return{st,mesh};
};
const posOf=(m:THREE.Mesh)=>Array.from(m.geometry.getAttribute('position').array as Float32Array);
/** Rest grid of a 2x2x2 lattice over the local cube bounds +-0.5, x fastest. */
const rest222=()=>{const r:number[]=[];for(const z of[-0.5,0.5])for(const y of[-0.5,0.5])for(const x of[-0.5,0.5])r.push(x,y,z);return r;};
test('create binds a lattice and a rest apply is the identity, with undo/redo',()=>{
 const {st,mesh}=mk();
 assert.equal(st.latticeCreate([2,2,2],[mesh.id]),1);
 const before=posOf(mesh);
 st.latticeApply([mesh.id]);
 assert.deepEqual(posOf(mesh),before,'the rest grid displaces nothing');
 st.undo();assert.deepEqual(posOf(mesh),before);
 st.redo();assert.deepEqual(posOf(mesh),before);
 assert.throws(()=>st.latticeApply([mesh.id]),/no lattice/,'apply consumes the lattice');
});
test('moving every control point by the same offset translates the mesh rigidly',()=>{
 const {st,mesh}=mk();
 st.latticeCreate([2,2,2],[mesh.id]);
 const off=[0.3,-0.2,0.1];
 const moved=rest222().map((v,i)=>v+off[i%3]);
 st.latticeSetPoints(moved,[mesh.id]);
 const before=posOf(mesh);
 st.latticeApply([mesh.id]);
 const after=posOf(mesh);
 assert.equal(after.length,before.length);
 for(let i=0;i<after.length;i++)assert.ok(Math.abs(after[i]-(before[i]+off[i%3]))<1e-6,`vertex coordinate ${i} moved by the offset`);
 st.undo();
 const restored=posOf(mesh);
 for(let i=0;i<restored.length;i++)assert.ok(Math.abs(restored[i]-before[i])<1e-6,'undo restores');
});
test('one moved corner tugs the nearest vertex fully and the face centre softly',()=>{
 const {st,mesh}=mk(4);
 st.latticeCreate([2,2,2],[mesh.id]);
 const moved=rest222();
 moved[7*3]+=0.4; // the (+0.5,+0.5,+0.5) corner control point
 st.latticeSetPoints(moved,[mesh.id]);
 const before=posOf(mesh);
 st.latticeApply([mesh.id]);
 const after=posOf(mesh);
 let cornerDx=0,faceDx=0;
 for(let v=0;v<before.length/3;v++){
  const x=before[v*3],y=before[v*3+1],z=before[v*3+2];
  if(Math.abs(x-0.5)<1e-6&&Math.abs(y-0.5)<1e-6&&Math.abs(z-0.5)<1e-6)cornerDx=after[v*3]-x;
  if(Math.abs(x)<1e-6&&Math.abs(y)<1e-6&&Math.abs(z-0.5)<1e-6)faceDx=after[v*3]-x;
 }
 assert.ok(Math.abs(cornerDx-0.4)<1e-6,`the corner vertex follows fully, got ${cornerDx}`);
 assert.ok(Math.abs(faceDx-0.1)<1e-6,`the +z face centre feels one quarter, got ${faceDx}`);
});
test('reset restores the rest grid and clear drops the lattice',()=>{
 const {st,mesh}=mk();
 st.latticeCreate([2,2,2],[mesh.id]);
 const moved=rest222().map(v=>v+0.25);
 st.latticeSetPoints(moved,[mesh.id]);
 st.latticeReset([mesh.id]);
 const before=posOf(mesh);
 st.latticeApply([mesh.id]);
 assert.deepEqual(posOf(mesh),before,'a reset lattice deforms nothing');
 st.latticeCreate([3,2,2],[mesh.id]);
 assert.equal(st.latticeClear([mesh.id]),1);
 assert.throws(()=>st.latticeSetPoints(moved,[mesh.id]),/no lattice/);
});
test('bad dimensions, wrong point counts and changed meshes are readable errors',()=>{
 const st=new Stage();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh.name='Box';
 const other=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());other.name='Other';
 st.loadMany([mesh,other]);st.root.updateMatrixWorld(true);
 assert.throws(()=>st.latticeCreate([1,2,2],[mesh.id]),/three integers from 2 to 8/);
 assert.throws(()=>st.latticeCreate([2,2,9],[mesh.id]),/three integers from 2 to 8/);
 assert.throws(()=>st.latticeCreate([2,2] as unknown as [number,number,number],[mesh.id]),/three integers from 2 to 8/);
 st.latticeCreate([2,2,2],[mesh.id]);
 assert.throws(()=>st.latticeSetPoints([0,0,0],[mesh.id]),/exactly 24/);
 assert.throws(()=>st.latticeApply([other.id]),/no lattice/);
 st.subdivide(1,[mesh.id]);
 assert.throws(()=>st.latticeApply([mesh.id]),/changed since the lattice was created/);
});
