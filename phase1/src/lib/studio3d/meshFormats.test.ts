import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STLExporter} from 'three/examples/jsm/exporters/STLExporter.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {OBJExporter} from 'three/examples/jsm/exporters/OBJExporter.js';
import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {Stage} from './stage';
import {unitScale} from './model';
test('a binary STL round trip keeps every triangle, scaled by the chosen unit like the viewport export',()=>{
 const st=new Stage();const cube=st.addPrimitive('cube');
 const holder=new THREE.Group();holder.add(cube.clone(true));
 holder.scale.multiplyScalar(unitScale('mm'));holder.updateMatrixWorld(true);
 const dv=new STLExporter().parse(holder,{binary:true}) as unknown as DataView;
 const geo=new STLLoader().parse(dv.buffer.slice(dv.byteOffset,dv.byteOffset+dv.byteLength) as ArrayBuffer);
 const pos=geo.getAttribute('position');
 assert.ok(pos.count>0,'triangles come back');
 assert.equal(pos.count,cube.geometry.getAttribute('position').count+(cube.geometry.getIndex()?cube.geometry.getIndex()!.count-cube.geometry.getAttribute('position').count:0),'non-indexed triangle soup has the same vertex count');
 // the unit cube spans 1m on each axis; in millimetres every axis extent is 1000
 for(const a of ['getX','getY','getZ'] as const){
  let min=Infinity,max=-Infinity;for(let i=0;i<pos.count;i++){const v=pos[a](i);min=Math.min(min,v);max=Math.max(max,v);}
  assert.ok(Math.abs(max-min-1000)<0.5,`${a} extent scales to millimetres, got ${max-min}`);
 }
});
test('an OBJ round trip keeps the geometry extent and produces meshes',()=>{
 const st=new Stage();const cube=st.addPrimitive('cube');st.setTransform(cube.id,{position:{x:2,y:0.5,z:0}});
 const holder=new THREE.Group();holder.add(cube.clone(true));holder.updateMatrixWorld(true);
 const text=new OBJExporter().parse(holder);
 const back=new OBJLoader().parse(text);
 let meshes=0;back.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes++;});
 assert.ok(meshes>=1,'at least one mesh comes back');
 const size=new THREE.Box3().setFromObject(back).getSize(new THREE.Vector3());
 assert.ok(Math.abs(size.x-1)<1e-3&&Math.abs(size.y-1)<1e-3&&Math.abs(size.z-1)<1e-3,`the unit cube keeps its extent, got ${size.x}`);
 const center=new THREE.Box3().setFromObject(back).getCenter(new THREE.Vector3());
 assert.ok(Math.abs(center.x-2)<1e-3,'the placement offset survives');
});
