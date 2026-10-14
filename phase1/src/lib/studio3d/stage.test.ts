import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage,StageError,PRIMITIVES} from './stage';
const tri=(stage:Stage)=>stage.measure().stats.triangles;
test('every primitive adds a mesh with its own name, geometry and PBR material',()=>{
 const stage=new Stage();const names=new Set<string>();
 for(const k of PRIMITIVES){const m=stage.addPrimitive(k);assert.ok(m.isMesh);assert.ok(!names.has(m.name));names.add(m.name);assert.ok(m.geometry.getAttribute('position').count>0);}
 assert.equal(stage.root.children.length,PRIMITIVES.length);
 assert.equal(stage.addPrimitive('cube').name,'Cube 2');
 assert.throws(()=>stage.addPrimitive('teapot' as never),StageError);
});
test('cube has 12 triangles and measure reports meshes, outline and bounds',()=>{
 const stage=new Stage();stage.addPrimitive('cube');const m=stage.measure();
 assert.equal(m.stats.triangles,12);assert.equal(m.stats.meshes,1);assert.equal(m.stats.materials,1);assert.equal(m.outline.length,1);assert.equal(m.outline[0].kind,'mesh');
 assert.ok(m.bounds&&Math.abs(m.bounds.max[1]-1)<1e-9&&Math.abs(m.bounds.min[1])<1e-9);
});
test('lights are listed but do not widen the bounds',()=>{
 const stage=new Stage();const l=stage.addLight('directional');assert.ok(l.isLight);
 const m=stage.measure();assert.equal(m.outline[0].kind,'light');assert.equal(m.bounds,null);
});
test('transform converts degrees, is one undo entry and validates input',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');const before=o.rotation.y;
 stage.setTransform(o.id,{position:{x:2},rotation:{y:90},scale:{x:2,y:2,z:2}});
 assert.equal(o.position.x,2);assert.ok(Math.abs(o.rotation.y-Math.PI/2)<1e-9);assert.equal(o.scale.y,2);
 stage.undo();assert.equal(o.position.x,0);assert.equal(o.rotation.y,before);assert.equal(o.scale.y,1);
 stage.redo();assert.equal(o.position.x,2);
 assert.throws(()=>stage.setTransform(o.id,{position:{x:NaN}}),/finite/);
 assert.throws(()=>stage.setTransform(o.id,{scale:{x:0}}),/zero/);
 assert.throws(()=>stage.setTransform(99999,{position:{x:1}}),/No object/);
});
test('a no-op edit adds no history',()=>{
 const stage=new Stage();const o=stage.addPrimitive('sphere');stage.markSaved();
 stage.setTransform(o.id,{position:{y:o.position.y}});stage.setMaterial(o.id,{roughness:0.6});
 assert.equal(stage.dirty,false);
});
test('material edits clamp, validate and undo',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');
 stage.setMaterial(o.id,{color:'#ff0000',metalness:5,roughness:-2});
 const info=stage.info(o.id)!;assert.equal(info.material!.color,'#ff0000');assert.equal(info.material!.metalness,1);assert.equal(info.material!.roughness,0);
 assert.throws(()=>stage.setMaterial(o.id,{color:'red'}),/#rrggbb/);
 assert.throws(()=>stage.setMaterial(o.id,{metalness:Infinity}),/finite/);
 stage.undo();assert.equal(stage.info(o.id)!.material!.color,'#b8bcc8');
 const l=stage.addLight('point');assert.throws(()=>stage.setMaterial(l.id,{roughness:1}),/no editable PBR/);
});
test('delete and undo restore the object at the same position in the list; redo removes it again',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube'),b=stage.addPrimitive('sphere'),c=stage.addPrimitive('cone');
 stage.remove(b.id);assert.deepEqual(stage.root.children.map(x=>x.name),['Cube','Cone']);
 stage.undo();assert.deepEqual(stage.root.children.map(x=>x.name),['Cube','Sphere','Cone']);assert.equal(stage.find(b.id),b);
 stage.redo();assert.equal(stage.find(b.id),undefined);assert.equal(a.parent,stage.root);assert.equal(c.parent,stage.root);
 assert.throws(()=>stage.remove(stage.root.id),StageError);
});
test('duplicate has independent material, a new name and undoes cleanly',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');const d=stage.duplicate(o.id) as THREE.Mesh;
 assert.equal(d.name,'Cube copy');assert.notEqual(d.material,(o as THREE.Mesh).material);
 stage.setMaterial(d.id,{color:'#00ff00'});assert.equal(stage.info(o.id)!.material!.color,'#b8bcc8');
 assert.equal(stage.root.children.indexOf(d),1);stage.undo();stage.undo();assert.equal(stage.root.children.length,1);
 assert.equal(tri(stage),12);
});
test('rename validates and undoes',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');stage.rename(o.id,'  Box  ');assert.equal(o.name,'Box');
 assert.throws(()=>stage.rename(o.id,'  '),/empty/);stage.undo();assert.equal(o.name,'Cube');
});
test('new edits after undo drop the redo side; dirty tracks the saved mark',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');stage.markSaved();assert.equal(stage.dirty,false);
 stage.setTransform(o.id,{position:{x:1}});assert.equal(stage.dirty,true);
 stage.undo();assert.equal(stage.dirty,false);assert.equal(stage.canRedo,true);
 stage.setTransform(o.id,{position:{x:5}});assert.equal(stage.canRedo,false);assert.equal(stage.dirty,true);
 stage.undo();assert.equal(stage.dirty,false);
});
test('discarding the saved state on the redo side leaves the scene permanently dirty',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');stage.setTransform(o.id,{position:{x:1}});stage.markSaved();
 stage.undo();stage.setTransform(o.id,{position:{x:7}});stage.undo();
 assert.equal(stage.dirty,true,'state at the save mark can no longer be reached');
});
test('objects are disposed only when no history entry can bring them back',()=>{
 const stage=new Stage();const cube=stage.addPrimitive('cube') as THREE.Mesh;let cubeD=0,sphereD=0;cube.geometry.addEventListener('dispose',()=>cubeD++);
 stage.remove(cube.id);const sphere=stage.addPrimitive('sphere') as THREE.Mesh;sphere.geometry.addEventListener('dispose',()=>sphereD++);
 assert.deepEqual([cubeD,sphereD],[0,0]);
 stage.undo();assert.deepEqual([cubeD,sphereD],[0,0],'sphere add can be redone');
 stage.addPrimitive('cone');// discards the redo entry that owned the removed sphere
 assert.deepEqual([cubeD,sphereD],[0,1]);
 stage.clear();assert.equal(cubeD,1,'clear frees what only the history still held');
});
test('load replaces the scene and starts a clean history; clear disposes',()=>{
 const stage=new Stage();stage.addPrimitive('cube');const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
 stage.load(g);assert.equal(stage.root.children[0],g);assert.equal(stage.canUndo,false);assert.equal(stage.dirty,false);assert.equal(stage.measure().stats.meshes,1);
 stage.clear();assert.equal(stage.root.children.length,0);
});
test('listeners fire on every change and can be removed',()=>{
 const stage=new Stage();let n=0;const off=stage.onChange(()=>n++);stage.addPrimitive('cube');stage.undo();stage.redo();assert.equal(n,3);off();stage.undo();assert.equal(n,3);
});
