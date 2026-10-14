import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
test('a primitive dropped at a point keeps its height and lands on the spot',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube',{x:2.5,z:-1.5});
 assert.deepEqual([cube.position.x,cube.position.y,cube.position.z],[2.5,0.5,-1.5]);
 const plane=st.addPrimitive('plane',{x:1,z:2});
 assert.deepEqual([plane.position.x,plane.position.y,plane.position.z],[1,0,2]);
 st.undo();st.undo();
 let meshes=0;st.root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes++;});
 assert.equal(meshes,0,'both inserts undo');
});
test('assignMaterial shares the material, undoes and redoes',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const key=(a.material as THREE.Material).uuid;
 st.assignMaterial(b.id,key);
 assert.equal(b.material,a.material,'the sphere now shares the cube material');
 st.undo();assert.notEqual(b.material,a.material);
 st.redo();assert.equal(b.material,a.material);
});
test('assignMaterial refuses unknown keys, non-meshes and multi-material meshes',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');
 assert.throws(()=>st.assignMaterial(cube.id,'missing-key'),/no longer in the scene/);
 const light=st.addLight('point');
 assert.throws(()=>st.assignMaterial(light.id,(cube.material as THREE.Material).uuid),/only be assigned to meshes/);
 const multi=new THREE.Mesh(new THREE.BoxGeometry(),[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()]);st.root.add(multi);
 assert.throws(()=>st.assignMaterial(multi.id,(cube.material as THREE.Material).uuid),/several materials/);
 st.clear();
});
