import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {packExistingUv} from './uvUnwrap';
import {UvError} from './uv';
import type {MeshData} from './editMesh';

const uvAttr=(o:THREE.Object3D)=>((o as THREE.Mesh).geometry.getAttribute('uv') as THREE.BufferAttribute);

/** two disconnected quads: A wide UVs (0.4 x 0.1), B tall UVs (0.1 x 0.4) */
function twoQuads():MeshData{
 return{
  positions:[0,0,0, 1,0,0, 1,1,0, 0,1,0, 3,0,0, 4,0,0, 4,1,0, 3,1,0],
  index:[0,1,2,0,2,3, 4,5,6,4,6,7],
  uvs:[0,0, 0.4,0, 0.4,0.1, 0,0.1, 0,0, 0.1,0, 0.1,0.4, 0,0.4],
 };
}
const bbox=(uv:[number,number][],slots:number[])=>{
 let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
 for(const i of slots){const[u,v]=uv[i];mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
 return[mnu,mnv,mxu,mxv];
};

test('stage uvPack: the default cube packs its six face islands non-overlapping into 0..1, equal areas kept, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as THREE.Mesh;
 const before=Array.from(uvAttr(o).array as Float32Array);
 st.uvPack(o.id,{});
 const attr=uvAttr(o);
 const idx=o.geometry.getIndex()!;
 const bs=[0,1,2,3,4,5].map(f=>bbox(Array.from({length:attr.count},(_,i)=>[attr.getX(i),attr.getY(i)] as [number,number]),[0,1,2,3,4,5].map(k=>idx.getX(f*6+k))));
 for(const b of bs)assert.ok(b[0]>=-1e-6&&b[1]>=-1e-6&&b[2]<=1+1e-6&&b[3]<=1+1e-6,`in 0..1: ${b}`);
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
  const a=bs[i],b=bs[j];
  const overlap=Math.min(a[2],b[2])-Math.max(a[0],b[0])>1e-6&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>1e-6;
  assert.ok(!overlap,`faces ${i}/${j} overlap`);
 }
 const areas=bs.map(b=>(b[2]-b[0])*(b[3]-b[1]));
 for(const a of areas)assert.ok(Math.abs(a-areas[0])<1e-6,`area ${a} vs ${areas[0]}`);
 assert.ok(Math.abs(before[0]-attr.getX(0))>1e-4||Math.abs(before[1]-attr.getY(0))>1e-4,'uvs actually moved');
 st.undo();
 assert.deepEqual(Array.from(uvAttr(o).array as Float32Array),before);
 st.redo();
 assert.deepEqual(Array.from(uvAttr(o).array as Float32Array),Array.from(attr.array as Float32Array));
});

test('packExistingUv: a tall island rotates 90 degrees, relative areas are preserved',()=>{
 const r=packExistingUv(twoQuads(),[],0);
 const a=bbox(r.uv,[0,1,2,3]),b=bbox(r.uv,[4,5,6,7]);
 assert.ok(a[2]-a[0]>a[3]-a[1],'A stays wide');
 assert.ok(b[2]-b[0]>b[3]-b[1],'B rotated wide');
 const areaA=(a[2]-a[0])*(a[3]-a[1]),areaB=(b[2]-b[0])*(b[3]-b[1]);
 assert.ok(Math.abs(areaA-areaB)<1e-6,`areas ${areaA} vs ${areaB}`);
});

test('packExistingUv: packing twice is a fixed point (padding is in source units, so this holds exactly at zero padding)',()=>{
 const a=packExistingUv(twoQuads(),[],0);
 const m2=twoQuads();m2.uvs=a.uv.flat();
 const b=packExistingUv(m2,[],0);
 for(let i=0;i<a.uv.length;i++){
  assert.ok(Math.abs(a.uv[i][0]-b.uv[i][0])<1e-6&&Math.abs(a.uv[i][1]-b.uv[i][1])<1e-6,`slot ${i}`);
 }
});

test('packExistingUv: a mesh without UVs throws',()=>{
 assert.throws(()=>packExistingUv({positions:[0,0,0,1,0,0,0,1,0],index:[0,1,2]},[]),UvError);
});
