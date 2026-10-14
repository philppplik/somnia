import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage,StageError,woodTexture} from './stage';
import {TEXTURE_SLOTS,SLOT_CONFIG} from './materials';
const tex4=(name:string)=>{const t=new THREE.DataTexture(new Uint8Array(4*4*4).fill(128),4,4);t.name=name;t.needsUpdate=true;return t;};
test('the metal slot drives the metalness map like the other slots',()=>{
 assert.ok(TEXTURE_SLOTS.includes('metal'));
 assert.equal(SLOT_CONFIG.metal.prop,'metalnessMap');assert.equal(SLOT_CONFIG.metal.srgb,false);
 const st=new Stage();const m=st.addPrimitive('cube');
 st.setTexture(m.id,'metal',tex4('metal.png'));
 const mat=(st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.equal(mat.metalnessMap?.name,'metal.png');
 assert.equal(st.info(m.id)!.material!.textures!.metal,'metal.png');
 st.setTextureTransform(m.id,'metal',{scaleX:2});
 assert.equal(st.info(m.id)!.material!.transforms!.metal!.scaleX,2);
 st.undo();assert.equal(st.info(m.id)!.material!.transforms!.metal!.scaleX,1);
});
test('the glass preset applies transparency and double sided, undone in one step',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 st.setMaterial(m.id,{preset:'glass'});
 const mat=(st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.ok(mat.transparent);assert.ok(Math.abs(mat.opacity-0.28)<1e-6);assert.equal(mat.side,THREE.DoubleSide);
 assert.equal(st.info(m.id)!.material!.alphaMode,'blend');
 // An explicit value in the same request wins over the preset.
 st.setMaterial(m.id,{preset:'glass',opacity:0.9});
 assert.ok(Math.abs(((st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity-0.9)<1e-6);
 st.undo();st.undo();
 const back=(st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.ok(!back.transparent);assert.equal(back.side,THREE.FrontSide);
});
test('the wood preset assigns a deterministic procedural texture, undone in one step',()=>{
 const a=woodTexture(64),b=woodTexture(64);
 assert.deepEqual(Array.from(a.image.data as Uint8Array),Array.from(b.image.data as Uint8Array),'the grain is deterministic');
 assert.equal(a.name,'wood');assert.equal(a.userData.somniaGenerated,true);
 const st=new Stage();const m=st.addPrimitive('cube');
 st.setMaterial(m.id,{preset:'wood'});
 const mat=(st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.equal(mat.map?.name,'wood');assert.equal(st.info(m.id)!.material!.textures!.color,'wood');
 assert.equal(mat.color.getHexString(),'8a5a33');assert.ok(Math.abs(mat.roughness-0.7)<1e-6);
 st.undo();assert.equal(((st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial).map,null,'one undo removes the grain');
 st.redo();assert.equal(((st.find(m.id) as THREE.Mesh).material as THREE.MeshStandardMaterial).map?.name,'wood');
});
test('copy/paste carries scalars, extras, textures and their mapping in one undo step',()=>{
 const st=new Stage();const src=st.addPrimitive('cube');const dst=st.addPrimitive('sphere');
 st.setTransform(dst.id,{position:{x:2}});
 st.setMaterial(src.id,{color:'#3366cc',metalness:0.8,roughness:0.2,emissive:'#112200',emissiveIntensity:2,opacity:0.6,alphaMode:'blend',doubleSided:true});
 st.setTexture(src.id,'color',tex4('albedo.png'));
 st.setTextureTransform(src.id,'color',{scaleX:3,offsetX:0.25});
 const snap=st.copyMaterial(src.id);
 st.pasteMaterial(dst.id,snap);
 const mat=(st.find(dst.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.equal(mat.color.getHexString(),'3366cc');assert.ok(Math.abs(mat.metalness-0.8)<1e-6);
 assert.ok(mat.transparent);assert.equal(mat.side,THREE.DoubleSide);
 assert.ok(mat.map&&mat.map.name==='albedo.png','texture travels');
 assert.notEqual(mat.map,((st.find(src.id) as THREE.Mesh).material as THREE.MeshStandardMaterial).map,'the texture is cloned, not shared');
 assert.equal(mat.map!.repeat.x,3);assert.equal(mat.map!.offset.x,0.25,'mapping travels');
 // A paste that changes nothing adds no undo entry: one undo still restores the original material.
 st.pasteMaterial(dst.id,snap);
 st.undo();
 const back=(st.find(dst.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 assert.notEqual(back.color.getHexString(),'3366cc');assert.equal(back.map,null);
 // Re-paste, then tiling the source leaves the target alone.
 st.pasteMaterial(dst.id,snap);
 const mat2=(st.find(dst.id) as THREE.Mesh).material as THREE.MeshStandardMaterial;
 st.setTextureTransform(src.id,'color',{scaleX:9});
 assert.equal(mat2.map!.repeat.x,3);
 // Lights refuse both directions.
 const light=st.addLight('point');
 assert.throws(()=>st.copyMaterial(light.id),StageError);
 assert.throws(()=>st.pasteMaterial(light.id,snap),StageError);
});
