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
test('grouped nudges inside the window merge into one undo step; undo restores the start',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');stage.markSaved();
 stage.setTransform(o.id,{position:{x:1}},{group:'nudge',now:1000});
 stage.setTransform(o.id,{position:{x:2}},{group:'nudge',now:1400});
 stage.setTransform(o.id,{position:{x:3}},{group:'nudge',now:1900});
 assert.equal(o.position.x,3);stage.undo();assert.equal(o.position.x,0);assert.equal(stage.dirty,false);
 stage.redo();assert.equal(o.position.x,3);
});
test('grouping does not merge across the time window, another group, another object or the saved mark',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('sphere');
 stage.setTransform(a.id,{position:{x:1}},{group:'nudge',now:0});
 stage.setTransform(a.id,{position:{x:2}},{group:'nudge',now:5000});
 stage.undo();assert.equal(a.position.x,1);
 stage.setTransform(a.id,{position:{x:3}},{group:'other',now:5100});stage.undo();assert.equal(a.position.x,1);
 stage.setTransform(b.id,{position:{x:1}},{group:'nudge',now:5200});stage.setTransform(a.id,{position:{x:9}},{group:'nudge',now:5300});
 stage.undo();assert.equal(b.position.x,1);
 stage.setTransform(a.id,{position:{x:4}},{group:'nudge',now:6000});stage.markSaved();
 stage.setTransform(a.id,{position:{x:5}},{group:'nudge',now:6100});
 stage.undo();assert.equal(a.position.x,4);assert.equal(stage.dirty,false);
});
test('commitTransform records one undo step for a finished gizmo drag',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');
 const before={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
 o.position.set(1,2,3);o.scale.set(2,2,2);
 stage.commitTransform(o.id,before);assert.equal(stage.canUndo,true);assert.equal(stage.dirty,true);
 stage.undo();assert.equal(o.position.x,0);assert.equal(o.scale.x,1);
 stage.redo();assert.equal(o.position.y,2);assert.equal(o.scale.z,2);
 const same={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};stage.commitTransform(o.id,same);
 stage.undo();stage.undo();assert.equal(stage.canUndo,false,'an unchanged drag adds no entry (only add + one drag)');
});
test('cameras: add, fov validation, info and undo',()=>{
 const stage=new Stage();const c=stage.addCamera();assert.ok(c.isPerspectiveCamera);
 assert.equal(stage.info(c.id)?.camera?.fov,40);assert.equal(stage.info(c.id)?.kind,'camera');
 stage.setCamera(c.id,{fov:70});assert.equal(stage.info(c.id)?.camera?.fov,70);
 assert.throws(()=>stage.setCamera(c.id,{fov:0}),StageError);assert.throws(()=>stage.setCamera(c.id,{fov:121}),StageError);
 stage.undo();assert.equal(stage.info(c.id)?.camera?.fov,40);
 stage.undo();assert.equal(stage.find(c.id),undefined);
 const p=stage.addCamera({position:{x:1,y:2,z:3},quaternion:[0,0,0,1]},55);assert.equal(p.position.z,3);assert.equal(p.fov,55);
 assert.equal(stage.info(stage.addPrimitive('cube').id)?.camera,null);
});
test('spot and area lights: defaults, info, edits, validation and undo',()=>{
 const stage=new Stage();const sp=stage.addLight('spot') as THREE.SpotLight;const ar=stage.addLight('area') as THREE.RectAreaLight;
 assert.ok(sp.isSpotLight);assert.ok(ar.isRectAreaLight);assert.equal(sp.name,'Spot light');assert.equal(ar.name,'Area light');
 assert.equal(Math.round(stage.info(sp.id)!.light!.angle!),30);assert.equal(stage.info(ar.id)!.light!.width,2);
 stage.setLight(sp.id,{angle:45,penumbra:0.5,intensity:10,color:'#ff0000'});
 assert.equal(Math.round(sp.angle*180/Math.PI),45);assert.equal(sp.penumbra,0.5);assert.equal(stage.info(sp.id)!.light!.color,'#ff0000');
 stage.undo();assert.equal(Math.round(sp.angle*180/Math.PI),30);assert.equal(sp.intensity,120);
 stage.setLight(ar.id,{width:4,height:1});assert.equal(ar.width,4);assert.equal(ar.height,1);
 assert.throws(()=>stage.setLight(ar.id,{angle:10}),StageError);assert.throws(()=>stage.setLight(sp.id,{width:3}),StageError);
 assert.throws(()=>stage.setLight(sp.id,{angle:0}),StageError);assert.throws(()=>stage.setLight(sp.id,{color:'red'}),StageError);
 const c=stage.addPrimitive('cube');assert.throws(()=>stage.setLight(c.id,{intensity:1}),StageError);
 const n=stage.addLight('point');stage.setLight(n.id,{intensity:n.intensity});assert.equal(stage.undoLabel.startsWith('Add'),true,'no-op adds no entry');
});
test('pivot to base moves the origin without moving the geometry and does not touch copies',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.duplicate(a.id) as THREE.Mesh;
 const world=()=>{a.updateMatrixWorld(true);return new THREE.Box3().setFromObject(a);};
 const before=world();stage.setPivot(a.id,'base');
 const after=world();assert.ok(after.min.distanceTo(before.min)<1e-9&&after.max.distanceTo(before.max)<1e-9);
 a.geometry.computeBoundingBox();assert.ok(Math.abs(a.geometry.boundingBox!.min.y)<1e-9);
 b.geometry.computeBoundingBox();assert.ok(b.geometry.boundingBox!.min.y<-0.4,'copy keeps its own geometry');
 stage.undo();a.geometry.computeBoundingBox();assert.ok(a.geometry.boundingBox!.min.y<-0.4);assert.equal(a.position.y,0.5);
 stage.redo();assert.equal(a.position.y,0);
 stage.setPivot(a.id,'center');assert.equal(a.position.y,0.5);
 const l=stage.addLight('point');assert.throws(()=>stage.setPivot(l.id,'center'),StageError);
});
test('pivot respects rotation and scale',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');stage.setTransform(a.id,{position:{x:0,y:0,z:0},rotation:{z:90},scale:{x:2,y:2,z:2}});
 const box=()=>{a.updateMatrixWorld(true);return new THREE.Box3().setFromObject(a);};
 const b0=box();stage.setPivot(a.id,'base');const b1=box();
 assert.ok(b0.min.distanceTo(b1.min)<1e-6&&b0.max.distanceTo(b1.max)<1e-6);
});
const boxOf=(o:THREE.Object3D)=>{o.updateMatrixWorld(true);return new THREE.Box3().setFromObject(o);};
test('align moves bounds to min, centre or max in one undo step',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('sphere');stage.setTransform(a.id,{position:{x:-3}});stage.setTransform(b.id,{position:{x:4}});
 stage.align([a.id,b.id],'x','min');assert.ok(Math.abs(boxOf(a).min.x-boxOf(b).min.x)<1e-9);assert.ok(Math.abs(boxOf(a).min.x+3.5)<1e-9);
 stage.undo();assert.equal(a.position.x,-3);assert.equal(b.position.x,4);
 stage.align([a.id,b.id],'x','center');assert.ok(Math.abs((boxOf(a).min.x+boxOf(a).max.x)/2-(boxOf(b).min.x+boxOf(b).max.x)/2)<1e-9);
 stage.undo();stage.align([a.id,b.id],'y','max');assert.ok(Math.abs(boxOf(a).max.y-boxOf(b).max.y)<1e-9);
 stage.undo();assert.equal(a.position.y,0.5);
 const before=stage.undoLabel;stage.align([a.id,b.id],'z','min');stage.align([a.id,b.id],'z','min');
 assert.throws(()=>stage.align([a.id],'x','min'),StageError);assert.throws(()=>stage.align([a.id,a.id],'x','min'),StageError);
 assert.throws(()=>stage.align([a.id,b.id],'w' as never,'min'),StageError);assert.throws(()=>stage.align([a.id,999999],'x','min'),StageError);
 const l=stage.addLight('point');assert.throws(()=>stage.align([a.id,l.id],'x','min'),StageError);void before;
});
test('distribute makes the gaps equal and keeps the outer objects',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('cube');const c=stage.addPrimitive('cube');
 stage.setTransform(a.id,{position:{x:0}});stage.setTransform(b.id,{position:{x:1}});stage.setTransform(c.id,{position:{x:10}});
 stage.distribute([c.id,a.id,b.id],'x');
 const [ba,bb,bc]=[a,b,c].map(boxOf);assert.equal(a.position.x,0);assert.equal(c.position.x,10);
 assert.ok(Math.abs((bb.min.x-ba.max.x)-(bc.min.x-bb.max.x))<1e-9);assert.ok(Math.abs(b.position.x-5)<1e-9);
 stage.undo();assert.equal(b.position.x,1);
 assert.throws(()=>stage.distribute([a.id,b.id],'x'),StageError);
});
test('light shadows: toggle, undo, info, and area lights refuse',()=>{
 const stage=new Stage();const d=stage.addLight('directional');const a=stage.addLight('area');const sp=stage.addLight('spot');
 assert.equal(stage.info(d.id)!.light!.shadow,false);assert.equal(stage.info(a.id)!.light!.shadow,undefined);
 stage.setLight(d.id,{shadow:true});assert.equal(d.castShadow,true);assert.equal(stage.info(d.id)!.light!.shadow,true);
 stage.undo();assert.equal(d.castShadow,false);stage.redo();assert.equal(d.castShadow,true);
 stage.setLight(sp.id,{shadow:true,intensity:50});assert.equal(sp.castShadow,true);assert.equal(sp.intensity,50);
 assert.throws(()=>stage.setLight(a.id,{shadow:true}),StageError);assert.throws(()=>stage.setLight(d.id,{shadow:'yes' as never}),StageError);
});
import {beginGroupDrag,applyGroupDrag,nodesOf,collectNodeExtras,applyNodeExtras} from './stage';
test('removeMany and duplicateMany are one undo step each and restore order',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('sphere');const c=stage.addPrimitive('cone');
 stage.removeMany([a.id,c.id]);assert.deepEqual(stage.root.children.map(o=>o.name),['Sphere']);
 stage.undo();assert.deepEqual(stage.root.children.map(o=>o.name),['Cube','Sphere','Cone']);
 stage.redo();assert.equal(stage.root.children.length,1);stage.undo();
 const copies=stage.duplicateMany([a.id,b.id]);assert.equal(copies.length,2);assert.equal(stage.root.children.length,5);
 assert.notEqual((copies[0] as THREE.Mesh).material,a.material);
 stage.undo();assert.equal(stage.root.children.length,3);stage.redo();assert.equal(stage.root.children.length,5);
 assert.throws(()=>stage.removeMany([a.id,a.id]),StageError);assert.throws(()=>stage.removeMany([]),StageError);assert.throws(()=>stage.removeMany([999999]),StageError);
});
test('a selected parent and its selected child are handled once',()=>{
 const stage=new Stage();const g=new THREE.Group();g.name='G';const m=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());g.add(m);stage.load(g);
 stage.removeMany([g.id,m.id]);assert.equal(stage.root.children.length,0);stage.undo();assert.equal(g.children.length,1);assert.equal(stage.root.children.length,1);
});
test('translateMany moves every object in one step',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('sphere');
 stage.translateMany([a.id,b.id],{x:2,z:-1});assert.equal(a.position.x,2);assert.equal(b.position.z,-1);
 stage.undo();assert.equal(a.position.x,0);assert.equal(b.position.z,0);
});
test('group drag rotates objects about the pivot; commitMany is one step',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');const b=stage.addPrimitive('cube');
 stage.setTransform(a.id,{position:{x:-1,y:0,z:0}});stage.setTransform(b.id,{position:{x:1,y:0,z:0}});
 const before=stage.snapshot([a.id,b.id]);const members=beginGroupDrag([a,b]);
 const p0=new THREE.Matrix4();const now=new THREE.Matrix4().makeRotationY(Math.PI/2);
 applyGroupDrag(members,p0,now);
 assert.ok(Math.abs(a.position.x)<1e-9&&Math.abs(a.position.z-1)<1e-9,'x=-1 rotates to z=+1');assert.ok(Math.abs(b.position.z+1)<1e-9);
 assert.ok(Math.abs(a.rotation.y-Math.PI/2)<1e-9);
 stage.commitMany(before);stage.undo();assert.equal(a.position.x,-1);assert.equal(b.position.x,1);assert.equal(a.rotation.y,0);
 stage.redo();assert.ok(Math.abs(b.position.z+1)<1e-9);
 const same=stage.snapshot([a.id]);const n=stage.undoLabel;stage.commitMany(same);assert.equal(stage.undoLabel,n,'no change, no entry');
});
test('group drag scale about the pivot and nested parents',()=>{
 const stage=new Stage();const g=new THREE.Group();g.position.set(10,0,0);const m=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());m.position.set(1,0,0);g.add(m);stage.load(g);
 const members=beginGroupDrag([m]);// world x = 11
 applyGroupDrag(members,new THREE.Matrix4().makeTranslation(10,0,0),new THREE.Matrix4().makeTranslation(10,0,0).multiply(new THREE.Matrix4().makeScale(2,2,2)));
 assert.ok(Math.abs(m.position.x-2)<1e-9,'local x doubles about the pivot');assert.ok(Math.abs(m.scale.x-2)<1e-9);
});
test('node extras round-trip shadows and area lights and survive stale indices',()=>{
 const stage=new Stage();stage.addPrimitive('cube');const d=stage.addLight('directional');d.castShadow=true;const ar=stage.addLight('area') as THREE.RectAreaLight;ar.width=3;ar.name='Soft box';
 const extras=collectNodeExtras(stage.root);assert.equal(extras.length,2);assert.equal(extras[0].shadow,true);assert.equal(extras[1].area!.width,3);
 // what a GLB round trip gives: an empty node where the area light was, a directional light without the shadow flag
 const fresh=new THREE.Group();fresh.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));fresh.add(new THREE.DirectionalLight());const hole=new THREE.Object3D();hole.name='Soft box';fresh.add(hole);
 const r=applyNodeExtras(fresh,extras);assert.equal(r.skipped,0);
 assert.equal((fresh.children[1] as THREE.Light).castShadow,true);const rl=fresh.children[2] as THREE.RectAreaLight;assert.ok(rl.isRectAreaLight);assert.equal(rl.width,3);assert.equal(rl.name,'Soft box');
 assert.equal(nodesOf(fresh).length,3);
 const short=new THREE.Group();short.add(new THREE.Object3D());assert.equal(applyNodeExtras(short,extras).skipped,2);
 const wrong=new THREE.Group();wrong.add(new THREE.Mesh());wrong.add(new THREE.Mesh());wrong.add(new THREE.Mesh());assert.equal(applyNodeExtras(wrong,extras).skipped,2,'nothing is applied to nodes of the wrong kind');
});
test('loadMany puts nodes at the root without a wrapper and starts clean',()=>{
 const stage=new Stage();stage.addPrimitive('cube');stage.loadMany([new THREE.Group(),new THREE.Group()]);assert.equal(stage.root.children.length,2);assert.equal(stage.dirty,false);assert.equal(stage.canUndo,false);
});
test('a primitive can be edited by parameters, with one undo step each and no change to its material or place',()=>{
 const stage=new Stage();const m=stage.addPrimitive('sphere');const id=m.id;stage.setMaterial(id,{color:'#112233'});m.position.x=3;
 const before=stage.info(id)!;assert.equal(before.primitive?.kind,'sphere');assert.equal(before.primitive?.params.radius,0.5);
 const count0=(m.geometry.attributes.position as {count:number}).count;
 stage.setPrimitive(id,{radius:2,widthSegments:12,heightSegments:6});
 const after=stage.info(id)!;assert.equal(after.primitive?.params.radius,2);assert.equal(after.primitive?.params.widthSegments,12);
 assert.ok((m.geometry.attributes.position as {count:number}).count<count0);
 m.geometry.computeBoundingBox();assert.ok(Math.abs(m.geometry.boundingBox!.max.x-2)<1e-6);
 assert.equal(m.position.x,3);assert.equal(after.material?.color,'#112233');
 stage.undo();assert.equal(stage.info(id)!.primitive?.params.radius,0.5);assert.equal((m.geometry.attributes.position as {count:number}).count,count0);
 stage.redo();assert.equal(stage.info(id)!.primitive?.params.radius,2);
});
test('a bad primitive edit throws a readable error and changes nothing',()=>{
 const stage=new Stage();const m=stage.addPrimitive('cube');const steps=stage.canUndo;
 assert.throws(()=>stage.setPrimitive(m.id,{width:-1}),StageError);assert.throws(()=>stage.setPrimitive(m.id,{radius:1}),StageError);
 assert.throws(()=>stage.setPrimitive(m.id,{segments:1e6}),StageError);
 assert.equal(stage.info(m.id)!.primitive?.params.width,1);assert.equal(stage.canUndo,steps);
 const light=stage.addLight('point');assert.throws(()=>stage.setPrimitive(light.id,{radius:1}),StageError);
});
test('a duplicate keeps its own parameters, and damaged stored data means no primitive',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cylinder');const b=stage.duplicate(a.id);
 stage.setPrimitive(b.id,{height:4});assert.equal(stage.info(a.id)!.primitive?.params.height,1);assert.equal(stage.info(b.id)!.primitive?.params.height,4);
 a.userData.somniaPrimitive={kind:'cylinder',params:{radius:-5}};assert.equal(stage.info(a.id)!.primitive,null);
});
test('material presets apply as one undo step and explicit values win',()=>{
 const stage=new Stage();const m=stage.addPrimitive('cube');
 stage.setMaterial(m.id,{preset:'gold'});let i=stage.info(m.id)!.material!;assert.equal(i.metalness,1);assert.equal(i.color,'#ffc857');
 stage.setMaterial(m.id,{preset:'steel',roughness:0.9});i=stage.info(m.id)!.material!;assert.equal(i.roughness,0.9);assert.equal(i.metalness,1);
 stage.undo();assert.equal(stage.info(m.id)!.material!.color,'#ffc857');
 assert.throws(()=>stage.setMaterial(m.id,{preset:'nope'}),StageError);
});
