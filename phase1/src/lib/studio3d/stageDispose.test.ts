import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
/** Wraps dispose on every geometry, material and texture under root and returns the counters. */
const spy=(root:THREE.Object3D)=>{
 const counts={geo:0,mat:0,tex:0};const seen={geo:new Set(),mat:new Set(),tex:new Set()};
 root.traverse(o=>{
  const m=o as THREE.Mesh;
  if(m.geometry&&!seen.geo.has(m.geometry)){seen.geo.add(m.geometry);const d=m.geometry.dispose.bind(m.geometry);m.geometry.dispose=()=>{counts.geo++;d();};}
  const mats=(Array.isArray(m.material)?m.material:m.material?[m.material]:[]) as THREE.Material[];
  for(const mat of mats){if(seen.mat.has(mat))continue;seen.mat.add(mat);const d=mat.dispose.bind(mat);mat.dispose=()=>{counts.mat++;d();};
   for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture&&!seen.tex.has(v)){seen.tex.add(v);const td=v.dispose.bind(v);v.dispose=()=>{counts.tex++;td();};}}
 });
 return{counts,seen};
};
test('clear() disposes every geometry, material and texture in the scene',()=>{
 const st=new Stage();
 st.addPrimitive('cube');st.addPrimitive('sphere');st.addLightRig('outdoor');
 const tex=new THREE.DataTexture(new Uint8Array(4),1,1);tex.needsUpdate=true;
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:tex}));st.root.add(mesh);
 const{counts,seen}=spy(st.root);
 st.clear();
 assert.equal(counts.geo,seen.geo.size,'all geometries disposed');
 assert.equal(counts.mat,seen.mat.size,'all materials disposed');
 assert.equal(counts.tex,seen.tex.size,'all textures disposed');
 assert.ok(counts.geo>=3&&counts.mat>=3&&counts.tex>=1,'the scene really held content');
});
test('undone content owned by the history is disposed when it falls off',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');
 const mesh=st.find(cube.id) as THREE.Mesh;
 const{counts}=spy(st.root);
 st.undo();
 assert.equal(counts.geo,0,'undo alone keeps the content for redo');
 st.clear();
 assert.equal(counts.geo,1,'clearing releases the history and disposes the undone mesh');
});
test('loading a replacement and then clearing disposes both scenes exactly once',()=>{
 const st=new Stage();
 const a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());a.name='a';
 st.load(a);
 const{counts,seen}=spy(st.root);
 const b=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());b.name='b';
 const bGeo=b.geometry,bMat=b.material;let bGeoN=0,bMatN=0;
 bGeo.dispose=()=>{bGeoN++;};bMat.dispose=()=>{bMatN++;};
 st.load(b);
 assert.ok(st.find(b.id),'the replacement is live');
 st.clear();
 assert.equal(counts.geo,seen.geo.size);assert.equal(counts.mat,seen.mat.size);
 assert.equal(bGeoN,1);assert.equal(bMatN,1);
});
