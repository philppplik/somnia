import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyShading} from './shading';
const mk=()=>{
 const root=new THREE.Group();
 const a:THREE.Mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xff0000}));
 const b:THREE.Mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x00ff00}));
 root.add(a,b);
 const normal=new THREE.MeshNormalMaterial();
 const orig=new WeakMap<THREE.Mesh,THREE.Material|THREE.Material[]>();
 return{root,a,b,normal,orig};
};
test('normals swaps and shaded restores every mesh material',()=>{
 const {root,a,b,normal,orig}=mk();
 const ma=a.material,mb=b.material;
 applyShading(root,'normals',normal,orig);
 assert.equal(a.material,normal);assert.equal(b.material,normal);
 applyShading(root,'normals',normal,orig); // idempotent
 assert.equal(a.material,normal);
 applyShading(root,'shaded',normal,orig);
 assert.equal(a.material,ma);assert.equal(b.material,mb);
 assert.equal(orig.has(a),false);
});
test('a material changed during the preview is never clobbered and gets previewed too',()=>{
 const {root,a,normal,orig}=mk();
 const ma=a.material;
 applyShading(root,'normals',normal,orig);
 const fresh=new THREE.MeshStandardMaterial({color:0x0000ff});
 a.material=fresh; // the user assigned a new material while the preview was on
 applyShading(root,'normals',normal,orig); // the next sync re-previews it
 assert.equal(a.material,normal);
 applyShading(root,'shaded',normal,orig);
 assert.equal(a.material,fresh,'the newer material wins, not the stale original');
 assert.notEqual(a.material,ma);
});
test('array materials round-trip',()=>{
 const {root,a,normal,orig}=mk();
 const pair=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()];
 a.material=pair;
 applyShading(root,'normals',normal,orig);
 assert.equal(a.material,normal);
 applyShading(root,'shaded',normal,orig);
 assert.equal(a.material,pair);
});

test('matcap swaps through its own material, previews never become originals, direct mode switch round-trips',()=>{
 const {root,a,normal,orig}=mk();
 const matcap=new THREE.MeshMatcapMaterial();
 const ma=a.material;
 applyShading(root,'normals',normal,orig,matcap);
 assert.equal(a.material,normal);
 applyShading(root,'matcap',normal,orig,matcap); // direct normals -> matcap
 assert.equal(a.material,matcap);
 assert.equal(orig.get(a),ma,'the normals preview was not stored as the original');
 applyShading(root,'normals',normal,orig,matcap); // and back
 assert.equal(a.material,normal);
 assert.equal(orig.get(a),ma);
 applyShading(root,'shaded',normal,orig,matcap);
 assert.equal(a.material,ma);
 assert.equal(orig.has(a),false);
});
