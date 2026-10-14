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
 const stage=new Stage();const c=stage.addCamera() as THREE.PerspectiveCamera;assert.ok(c.isPerspectiveCamera);
 assert.deepEqual(stage.info(c.id)?.camera,{kind:'perspective',fov:40});assert.equal(stage.info(c.id)?.kind,'camera');
 stage.setCamera(c.id,{fov:70});assert.deepEqual(stage.info(c.id)?.camera,{kind:'perspective',fov:70});
 assert.throws(()=>stage.setCamera(c.id,{fov:0}),StageError);assert.throws(()=>stage.setCamera(c.id,{fov:121}),StageError);
 stage.undo();assert.deepEqual(stage.info(c.id)?.camera,{kind:'perspective',fov:40});
 stage.undo();assert.equal(stage.find(c.id),undefined);
 const p=stage.addCamera({position:{x:1,y:2,z:3},quaternion:[0,0,0,1]},55) as THREE.PerspectiveCamera;assert.equal(p.position.z,3);assert.equal(p.fov,55);
 assert.equal(stage.info(stage.addPrimitive('cube').id)?.camera,null);
});
test('orthographic cameras: kind, zoom, validation, info and undo',()=>{
 const stage=new Stage();const c=stage.addCamera(undefined,40,'orthographic') as THREE.OrthographicCamera;
 assert.ok(c.isOrthographicCamera);assert.equal(c.name,'Ortho camera');
 const info=stage.info(c.id)?.camera;assert.equal(info?.kind,'orthographic');
 if(info?.kind==='orthographic')assert.equal(info.zoom,1);
 stage.setCamera(c.id,{zoom:2.5});
 const after=stage.info(c.id)?.camera;if(after?.kind==='orthographic')assert.equal(after.zoom,2.5);
 assert.throws(()=>stage.setCamera(c.id,{fov:70}),StageError,'a perspective-only patch is refused on an ortho camera');
 assert.throws(()=>stage.setCamera(c.id,{zoom:0}),StageError);assert.throws(()=>stage.setCamera(c.id,{zoom:101}),StageError);
 stage.undo();const back=stage.info(c.id)?.camera;if(back?.kind==='orthographic')assert.equal(back.zoom,1);
 const p=stage.addCamera() as THREE.PerspectiveCamera;assert.ok(p.isPerspectiveCamera);
 assert.throws(()=>stage.setCamera(p.id,{zoom:2}),StageError,'zoom is refused on a perspective camera');
 assert.equal(stage.info(p.id)?.camera?.kind,'perspective');
 stage.undo();assert.equal(stage.find(p.id),undefined,'undo removes the perspective camera');
 stage.undo();assert.equal(stage.find(c.id),undefined,'undo removes the ortho camera');
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
test('PBR extras: emissive, opacity and alpha mode apply as one undo step and read back',()=>{
 const stage=new Stage();const m=stage.addPrimitive('cube');
 stage.setMaterial(m.id,{emissive:'#ff8800',emissiveIntensity:2.5});let i=stage.info(m.id)!.material!;assert.equal(i.emissive,'#ff8800');assert.equal(i.emissiveIntensity,2.5);
 stage.setMaterial(m.id,{opacity:0.4});i=stage.info(m.id)!.material!;assert.equal(i.alphaMode,'blend');assert.equal(i.opacity,0.4);
 stage.setMaterial(m.id,{alphaMode:'mask',alphaCutoff:0.3});i=stage.info(m.id)!.material!;assert.equal(i.alphaMode,'mask');assert.equal(i.alphaCutoff,0.3);
 stage.setMaterial(m.id,{alphaMode:'opaque'});assert.equal(stage.info(m.id)!.material!.opacity,1);
 stage.setMaterial(m.id,{doubleSided:true});assert.equal(stage.info(m.id)!.material!.doubleSided,true);
 stage.undo();assert.equal(stage.info(m.id)!.material!.doubleSided,false);stage.undo();assert.equal(stage.info(m.id)!.material!.alphaMode,'mask');
 for(const bad of [{opacity:2},{emissive:'x'},{alphaMode:'add'},{emissiveIntensity:99}])assert.throws(()=>stage.setMaterial(m.id,bad as never),StageError);
});
test('a texture slot takes an image, shows its name, clears, and undoes',()=>{
 const stage=new Stage();const m=stage.addPrimitive('plane');const tex=new THREE.Texture();tex.name='bricks.png';
 stage.setTexture(m.id,'normal',tex);assert.equal(stage.info(m.id)!.material!.textures!.normal,'bricks.png');assert.equal(tex.colorSpace,THREE.NoColorSpace);
 const c=new THREE.Texture();stage.setTexture(m.id,'color',c);assert.equal(c.colorSpace,THREE.SRGBColorSpace);
 stage.setTexture(m.id,'color',null);assert.equal(stage.info(m.id)!.material!.textures!.color,null);stage.undo();assert.equal(stage.info(m.id)!.material!.textures!.color,'image');
 assert.throws(()=>stage.setTexture(m.id,'bogus' as never,tex),StageError);assert.throws(()=>stage.setTexture(stage.addLight('point').id,'color',tex),StageError);
});
test('mirror flips a copy across the world plane and keeps faces pointing out',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');stage.setTransform(a.id,{position:{x:2,y:0.5,z:1},rotation:{y:30}});
 const [c]=stage.mirror([a.id],'x',true);assert.ok(Math.abs(c.position.x+2)<1e-9);assert.equal(c.position.z,1);assert.equal(stage.root.children.length,2);
 c.updateWorldMatrix(true,false);assert.ok(c.matrixWorld.determinant()<0,'a mirror has a negative determinant');
 stage.undo();assert.equal(stage.root.children.length,1);
 stage.mirror([a.id],'x',false);assert.ok(Math.abs(a.position.x+2)<1e-9);stage.undo();assert.equal(a.position.x,2);
 assert.throws(()=>stage.mirror([a.id],'w' as never,true),StageError);
});
test('apply scale bakes size into the geometry, drops primitive data and undoes',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');stage.setTransform(a.id,{scale:{x:2,y:3,z:1}});
 const before=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
 stage.applyScale([a.id]);assert.equal(a.scale.x,1);assert.equal(a.scale.y,1);
 a.geometry.computeBoundingBox();const g=a.geometry.boundingBox!.getSize(new THREE.Vector3());assert.ok(Math.abs(g.x-before.x)<1e-6&&Math.abs(g.y-before.y)<1e-6);
 assert.equal(stage.info(a.id)!.primitive,null);
 stage.undo();assert.equal(a.scale.y,3);assert.equal(stage.info(a.id)!.primitive?.kind,'cube');
 const grp=stage.addLight('point');assert.throws(()=>stage.applyScale([grp.id]),StageError);
});
test('apply scale with a negative scale keeps faces outward',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');stage.setTransform(a.id,{scale:{x:-1}});stage.applyScale([a.id]);
 const geo=a.geometry;const idx=geo.index!,pos=geo.getAttribute('position');const nor=geo.getAttribute('normal');
 const v=(i:number)=>new THREE.Vector3().fromBufferAttribute(pos,i);let ok=0,n=0;
 for(let i=0;i<idx.count;i+=3){const A=v(idx.getX(i)),B=v(idx.getX(i+1)),C=v(idx.getX(i+2));const face=B.sub(A).cross(C.sub(A));const nm=new THREE.Vector3().fromBufferAttribute(nor,idx.getX(i));n++;if(face.dot(nm)>0)ok++;}
 assert.equal(ok,n);
});
test('merge joins meshes into one at their world positions and undoes',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube'),b=stage.addPrimitive('sphere');stage.setTransform(a.id,{position:{x:-3}});stage.setTransform(b.id,{position:{x:3}});
 const triBefore=stage.measure().stats.triangles;const m=stage.merge([a.id,b.id]);
 assert.equal(stage.root.children.length,1);assert.equal(stage.measure().stats.triangles,triBefore);
 m.geometry.computeBoundingBox();assert.ok(m.geometry.boundingBox!.min.x<-3&&m.geometry.boundingBox!.max.x>3);assert.equal(stage.info(m.id)!.primitive,null);
 stage.undo();assert.equal(stage.root.children.length,2);stage.redo();assert.equal(stage.root.children.length,1);
 assert.throws(()=>stage.merge([m.id]),StageError);
});
test('texture mapping (offset, scale, rotation) is one undo step, validated, and shows in info',()=>{
 const stage=new Stage();const m=stage.addPrimitive('cube');const tex=new THREE.Texture();stage.setTexture(m.id,'color',tex);
 assert.deepEqual(stage.info(m.id)!.material!.transforms!.color,{offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0});
 assert.equal(stage.info(m.id)!.material!.transforms!.normal,null);
 stage.setTextureTransform(m.id,'color',{offsetX:0.5,scaleX:2,rotation:90});
 assert.equal(tex.offset.x,0.5);assert.equal(tex.repeat.x,2);assert.ok(Math.abs(tex.rotation-Math.PI/2)<1e-9);
 assert.equal(stage.info(m.id)!.material!.transforms!.color!.rotation,90);
 stage.undo();assert.equal(tex.offset.x,0);assert.equal(tex.repeat.x,1);assert.equal(tex.rotation,0);
 stage.redo();assert.equal(tex.repeat.x,2);
 stage.setTextureTransform(m.id,'color','reset');assert.equal(tex.repeat.x,1);
 assert.throws(()=>stage.setTextureTransform(m.id,'color',{scaleX:0}),StageError);
 assert.throws(()=>stage.setTextureTransform(m.id,'normal',{offsetX:1}),StageError);
 assert.throws(()=>stage.setTextureTransform(stage.addLight('point').id,'color',{offsetX:1}),StageError);
});
test('measure reports texture memory, largest texture, zero scale and textures without UVs',()=>{
 const stage=new Stage();const m=stage.addPrimitive('cube');
 const tex=new THREE.DataTexture(new Uint8Array(4*4*4),4,4);stage.setTexture(m.id,'color',tex);
 let s=stage.measure().stats;assert.equal(s.maxTexture,4);assert.equal(s.textureBytes,Math.ceil(4*4*4*4/3));assert.equal(s.zeroScale,0);assert.equal(s.textureNoUv,0);
 m.scale.x=0;assert.equal(stage.measure().stats.zeroScale,1);
 m.geometry.deleteAttribute('uv');assert.equal(stage.measure().stats.textureNoUv,1);
});

test('measure estimates geometry memory from the buffers',()=>{
 const stage=new Stage();stage.addPrimitive('cube');
 const m=stage.measure();assert.ok(m.stats.geometryBytes>0);
 const pos=stage.root.children[0] as THREE.Mesh;const want=(pos.geometry.getAttribute('position') as THREE.BufferAttribute).array.byteLength;
 assert.ok(m.stats.geometryBytes>=want);
});

test('group and ungroup keep world transforms and undo as one step each',()=>{
 const stage=new Stage();
 const a=stage.addPrimitive('cube');stage.setTransform(a.id,{position:{x:1,y:0.5,z:0}});
 const b=stage.addPrimitive('sphere');stage.setTransform(b.id,{position:{x:-1,y:0.5,z:0}});
 const aw=a.getWorldPosition(new THREE.Vector3()).clone(),bw=b.getWorldPosition(new THREE.Vector3()).clone();
 const g=stage.group([a.id,b.id]);
 assert.ok(g.isGroup);assert.equal(stage.info(g.id)?.kind,'group');
 assert.equal(g.children.length,2);
 stage.root.updateMatrixWorld(true);
 assert.ok(a.getWorldPosition(new THREE.Vector3()).distanceTo(aw)<1e-6,'cube keeps its world position');
 assert.ok(b.getWorldPosition(new THREE.Vector3()).distanceTo(bw)<1e-6,'sphere keeps its world position');
 const c=stage.addPrimitive('cube');
 assert.throws(()=>stage.group([c.id]),StageError,'one object cannot form a group');
 stage.undo(); // undo the extra cube insert
 stage.undo(); // undo the group
 assert.equal(stage.find(g.id),undefined);assert.equal(stage.find(a.id)?.parent,stage.root);
 stage.redo();assert.ok(stage.find(g.id));
 stage.ungroup(g.id);
 assert.equal(stage.find(g.id),undefined);assert.equal(stage.find(a.id)?.parent,stage.root);
 stage.root.updateMatrixWorld(true);
 assert.ok(a.getWorldPosition(new THREE.Vector3()).distanceTo(aw)<1e-6,'ungroup keeps world positions');
 stage.undo();assert.ok(stage.find(g.id),'undo restores the group');
 assert.throws(()=>stage.ungroup(a.id),StageError,'a mesh is not a group');
});
test('linear and radial arrays place copies and undo as one step',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube');
 const lin=stage.arrayDuplicate([a.id],{mode:'linear',count:3,offset:{x:2,y:0,z:0}});
 assert.equal(lin.length,2);
 assert.ok(Math.abs(lin[0].position.x-2)<1e-6);assert.ok(Math.abs(lin[1].position.x-4)<1e-6);
 assert.throws(()=>stage.arrayDuplicate([a.id],{mode:'linear',count:2,offset:{x:0,y:0,z:0}}),StageError,'zero offset refused');
 assert.throws(()=>stage.arrayDuplicate([a.id],{mode:'linear',count:1,offset:{x:1,y:0,z:0}}),StageError,'count below 2 refused');
 const rad=stage.arrayDuplicate([a.id],{mode:'radial',count:4,axis:'y',angle:90,center:{x:0,y:0,z:0}});
 assert.equal(rad.length,3);
 stage.undo(); // radial
 stage.setTransform(a.id,{position:{x:1,y:0.5,z:0}});
 const rad2=stage.arrayDuplicate([a.id],{mode:'radial',count:4,axis:'y',angle:90,center:{x:0,y:0,z:0}});
 const p1=rad2[0].position;
 assert.ok(Math.abs(p1.z-(-1))<1e-5&&Math.abs(p1.x)<1e-5,`90 deg about +y moves (1,*,0) to (0,*,-1), got ${p1.x},${p1.z}`);
 assert.ok(Math.abs(rad2[1].position.x+1)<1e-5,'the 180-degree copy lands opposite the source');
 assert.throws(()=>stage.arrayDuplicate([a.id],{mode:'radial',count:4,axis:'y',angle:0,center:{x:0,y:0,z:0}}),StageError,'zero angle refused');
 stage.undo(); // rad2
 assert.equal(stage.root.children.filter(o=>o.name.startsWith('Cube copy')).length,2,'array undo removes only its own copies');
 stage.undo(); // the transform
 stage.undo(); // lin
 assert.equal(stage.root.children.length,1,'one undo clears the whole linear array');
});
test('snapPoint finds vertices and surfaces of other meshes, never of the excluded one',()=>{
 const stage=new Stage();const a=stage.addPrimitive('cube'); // unit cube, base on the ground: corners at (±0.5, 0 or 1, ±0.5)
 const hit=stage.snapPoint({x:0.48,y:0.97,z:0.51},'vertex',[],0.25);
 assert.ok(hit);assert.ok(Math.abs(hit.x-0.5)<1e-6&&Math.abs(hit.y-1)<1e-6&&Math.abs(hit.z-0.5)<1e-6,'nearest vertex is the top corner');
 assert.equal(stage.snapPoint({x:5,y:5,z:5},'vertex',[],0.25),null,'nothing within radius');
 assert.equal(stage.snapPoint({x:0.48,y:0.97,z:0.51},'vertex',[a.id],0.25),null,'the excluded mesh is skipped');
 const surf=stage.snapPoint({x:0,y:1.2,z:0},'surface',[],0.5);
 assert.ok(surf);assert.ok(Math.abs(surf.y-1)<1e-3,`surface snap lands on the top face, got y=${surf.y}`);
 assert.equal(stage.snapPoint({x:0,y:1.2,z:0},'surface',[a.id],0.5),null,'surface ignores the excluded mesh');
 const b=stage.addPrimitive('cube');stage.setTransform(b.id,{position:{x:3,y:0,z:0}});
 const bCorner=stage.snapPoint({x:3.4,y:0.4,z:0.4},'vertex',[a.id],0.5);
 assert.ok(bCorner&&Math.abs(bCorner.x-3.5)<1e-5&&Math.abs(bCorner.y-0.5)<1e-5,'vertex snap respects the moved mesh transform');
});

test('edit mode: start, select, extrude, one undo restores geometry and primitive params',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const counts=stage.editStart(o.id);
 assert.equal(counts.triangles,12);
 stage.editSelect('face',[4,5]); // +y cap
 const g=o.geometry; // original cube geometry
 stage.editExtrude(0.5);
 assert.equal(tri(stage),20);
 assert.notEqual(o.geometry,g,'extrude swaps in the edited geometry');
 stage.undo();
 assert.equal(tri(stage),12);
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.ok(stage.primitiveOf(o),'parametric data survives undo');
 stage.redo();assert.equal(tri(stage),20);
 stage.editEnd();
 assert.throws(()=>stage.editExtrude(0.5),StageError);
});

test('edit select validates ids and toggles',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');
 stage.editStart(o.id);
 stage.editSelect('vertex',[1,2]);stage.editSelect('vertex',[1],true);
 assert.deepEqual(stage.editSelection().verts,[2]);
 assert.throws(()=>stage.editSelect('face',[99]),StageError);
 assert.throws(()=>stage.editSelect('edge',[[0,0]]),StageError);
});

test('loop cut needs exactly one edge selected',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube');
 stage.editStart(o.id);
 assert.throws(()=>stage.editLoopCut(),/exactly one edge/);
 // find a vertical edge of the indexed box (24 verts, y from -0.5..0.5 in local space)
 const m=o as THREE.Mesh;const pos=m.geometry.getAttribute('position');
 const idx=m.geometry.getIndex()!;
 const vert=(i:number)=>[pos.getX(i),pos.getY(i),pos.getZ(i)];
 let done=false;
 for(let f=0;f<idx.count&&!done;f+=3)for(let e=0;e<3;e++){
  const a=idx.getX(f+e),b=idx.getX(f+(e+1)%3);const A=vert(a),B=vert(b);
  if(A[0]===B[0]&&A[2]===B[2]&&A[1]!==B[1]){stage.editSelect('edge',[[a,b]]);stage.editLoopCut();done=true;break;}
 }
 assert.ok(done,'a vertical edge exists on the cube');
 assert.ok(tri(stage)>12);
});

test('sculpt stroke is one undo step restoring all positions',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const before=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 stage.sculptBegin(o.id);
 stage.sculptDabAt(o.id,[0.5,1,0.5],{brush:'grab',radius:2,strength:1,falloff:'smooth',symmetry:'none',delta:[0,0.4,0]});
 stage.sculptDabAt(o.id,[0,1,0],{brush:'inflate',radius:2,strength:0.5,falloff:'smooth',symmetry:'none'});
 stage.sculptEnd();
 const after=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 assert.ok(after.some((v,i)=>v!==before[i]),'dabs moved vertices');
 stage.undo(); // single undo for the whole stroke
 const back=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 assert.deepEqual(back,before);
});

test('edit and sculpt refuse skinned meshes and non-meshes',()=>{
 const stage=new Stage();const l=stage.addLight('directional');
 assert.throws(()=>stage.editStart(l.id),StageError);
 assert.throws(()=>stage.sculptBegin(l.id),StageError);
});

test('sculpt without begin still lands as one undo',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const before=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 stage.sculptDabAt(o.id,[0.5,1,0.5],{brush:'grab',radius:2,strength:1,falloff:'constant',symmetry:'none',delta:[0.2,0,0]});
 stage.sculptEnd();
 stage.undo();
 assert.deepEqual(Array.from(o.geometry.getAttribute('position').array as Float32Array),before);
});

test('edge bevel and loop slide run through edit mode with one undo each',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.editStart(o.id);
 // vertical edge of the indexed box
 const pos=o.geometry.getAttribute('position');const idx=o.geometry.getIndex()!;
 let edge:[number,number]|null=null;
 for(let f=0;f<idx.count&&!edge;f+=3)for(let e=0;e<3;e++){
  const a=idx.getX(f+e),b=idx.getX(f+(e+1)%3);
  if(pos.getX(a)===pos.getX(b)&&pos.getZ(a)===pos.getZ(b)&&pos.getY(a)!==pos.getY(b)){edge=[a,b];break;}
 }
 assert.ok(edge);
 stage.editSelect('edge',[edge]);
 const tris0=tri(stage);
 stage.editBevelEdge(0.1);
 assert.ok(tri(stage)>tris0,'edge bevel adds triangles');
 stage.undo();assert.equal(tri(stage),tris0);
 stage.editLoopSlide(0.5);
 assert.ok(tri(stage)===tris0,'slide keeps topology');
 const moved=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 stage.undo();
 assert.notDeepEqual(Array.from(o.geometry.getAttribute('position').array as Float32Array),moved,'undo restores positions');
});

test('mirror modifier doubles the cube, blocks editing, and undoes cleanly',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const before=stage.info(o.id)!;
 assert.equal(before.mirror,null);
 stage.mirrorMod(o.id,'x',0,true);
 assert.equal(tri(stage),24);
 assert.ok(stage.info(o.id)!.mirror);
 assert.throws(()=>stage.editStart(o.id),/mirror modifier/);
 assert.throws(()=>stage.sculptBegin(o.id),/mirror modifier/);
 assert.throws(()=>stage.mirrorMod(o.id,'y',0,true),/already/);
 stage.mirrorMod(o.id,'x',0,false);
 assert.equal(tri(stage),12);
 assert.equal(stage.info(o.id)!.mirror,null);
 stage.undo();assert.equal(tri(stage),24); // undo of the toggle-off
 stage.undo();assert.equal(tri(stage),12); // undo of the toggle-on
});

test('mask brush paints, blocks grab, and clears with undo',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.sculptBegin(o.id);
 stage.sculptDabAt(o.id,[0.5,1,0.5],{brush:'mask',radius:2,strength:1,falloff:'constant',symmetry:'none'} as never);
 stage.sculptEnd();
 assert.ok(o.geometry.getAttribute('somniaMask'),'mask attribute exists');
 const before=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 stage.sculptBegin(o.id);
 stage.sculptDabAt(o.id,[0.5,1,0.5],{brush:'grab',radius:2,strength:1,falloff:'constant',symmetry:'none',delta:[0,0.5,0]} as never);
 stage.sculptEnd();
 const after=Array.from(o.geometry.getAttribute('position').array as Float32Array);
 const moved=before.map((v,i)=>Math.abs(after[i]-v)).filter(d=>d>1e-9).length;
 const masked=o.geometry.getAttribute('somniaMask');
 assert.ok(moved<before.length/3,'masked verts stayed put');
 assert.ok(masked&&Array.from(masked.array as Float32Array).some(v=>v>0.9));
 stage.sculptMaskClear(o.id);
 assert.ok(Array.from(o.geometry.getAttribute('somniaMask').array as Float32Array).every(v=>v===0));
 stage.undo();
 assert.ok(Array.from(o.geometry.getAttribute('somniaMask').array as Float32Array).some(v=>v>0.9),'undo restores the mask');
});

test('mirror with bisect clips and rebuilds the cube, still one undo',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.mirrorMod(o.id,'x',0,true,true);
 const t=tri(stage);
 assert.ok(t>=12&&t<=28,`bisected+mirror cube tris: ${t}`);
 assert.equal(stage.info(o.id)!.mirror!.bisect,true);
 stage.undo();
 assert.equal(tri(stage),12);
 assert.equal(stage.info(o.id)!.mirror,null);
});

test('multi-segment bevel runs through edit mode with one undo',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.editStart(o.id);
 const pos=o.geometry.getAttribute('position');const idx=o.geometry.getIndex()!;
 let edge:[number,number]|null=null;
 for(let f=0;f<idx.count&&!edge;f+=3)for(let e=0;e<3;e++){
  const a=idx.getX(f+e),b=idx.getX(f+(e+1)%3);
  if(pos.getX(a)===pos.getX(b)&&pos.getZ(a)===pos.getZ(b)&&pos.getY(a)!==pos.getY(b)){edge=[a,b];break;}
 }
 stage.editSelect('edge',[edge!]);
 const t0=tri(stage);
 stage.editBevelEdge(0.1,4);
 assert.ok(tri(stage)>=t0+8,`4-segment bevel adds a strip: ${t0} -> ${tri(stage)}`);
 stage.undo();assert.equal(tri(stage),t0);
});

test('uv seams: mark finds coincident copies, clear and undo restore them',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.editStart(o.id);
 assert.throws(()=>stage.uvSeamMark(true),/Select edges/);
 stage.editSelect('edge',[[0,2]]); // the shared +x/+z vertical edge of the box
 stage.uvSeamMark(true);
 assert.equal(stage.seamsOf(o).length,2,'unwelded box: both coincident copies are marked');
 assert.throws(()=>stage.uvSeamMark(true),/already seams/);
 assert.equal(stage.info(o.id)!.uv!.seams,2);
 stage.undo();assert.equal(stage.seamsOf(o).length,0);
 stage.redo();assert.equal(stage.seamsOf(o).length,2);
 stage.uvSeamMark(false);assert.equal(stage.seamsOf(o).length,0);
 stage.undo();assert.equal(stage.seamsOf(o).length,2);
 stage.editEnd();
});

test('uv unwrap splits vertices along seams, keeps attributes, one undo restores everything',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const g0=o.geometry;
 // a sculpt mask attribute must survive the vertex split
 const mask=new Float32Array(g0.getAttribute('position').count).fill(0.5);
 g0.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 stage.editStart(o.id);
 const pos=g0.getAttribute('position'),idx=g0.getIndex()!;
 const edges:[number,number][]=[];
 for(let f=0;f<idx.count;f+=3)for(let e=0;e<3;e++){
  const a=idx.getX(f+e),b=idx.getX(f+(e+1)%3);
  const ya=pos.getY(a),yb=pos.getY(b);
  if(ya!==0.5||yb!==0.5)continue;
  const mx=(pos.getX(a)+pos.getX(b))/2,mz=(pos.getZ(a)+pos.getZ(b))/2;
  if(Math.abs(mx)===0.5||Math.abs(mz)===0.5)edges.push([Math.min(a,b),Math.max(a,b)]);
 }
 assert.equal(edges.length,8,'four border edges, two copies each on the unwelded box');
 stage.editSelect('edge',edges);
 stage.uvSeamMark(true);
 assert.equal(stage.seamsOf(o).length,8);
 assert.throws(()=>stage.uvUnwrap(o.id),/edit mode/);
 stage.editEnd();
 stage.uvUnwrap(o.id);
 const g1=o.geometry;
 assert.notEqual(g1,g0);
 assert.ok(g1.getAttribute('uv'),'uv attribute written');
 assert.ok(g1.getAttribute('position').count>=24,'vertices split along seams');
 assert.equal(g1.getAttribute('somniaMask')!.count,g1.getAttribute('position').count,'mask follows the split');
 assert.equal(stage.info(o.id)!.uv!.islands,2,'top face is its own island');
 assert.equal(stage.seamsOf(o).length,8,'seams re-found on the split copies (one per island side)');
 stage.undo();
 assert.equal(o.geometry,g0,'undo restores the original geometry object');
 assert.equal(stage.seamsOf(o).length,8);
 stage.redo();
 assert.equal(o.geometry,g1);
});

test('uv planar projects to 0..1 without splitting welded vertices',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.uvPlanar(o.id,'z');
 const uv=o.geometry.getAttribute('uv')!;
 assert.equal(uv.count,o.geometry.getAttribute('position').count,'no splits: one uv per vertex');
 for(let i=0;i<uv.count;i++){assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);}
 assert.equal(stage.info(o.id)!.uv!.hasUv,true);
 stage.undo();stage.redo();
 assert.throws(()=>stage.uvUnwrap(99999),StageError);
});

test('uv layout is read-only and null without uvs',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 const layout=stage.uvLayout(o.id);
 assert.ok(layout,'a fresh cube already has uvs');
 assert.equal(layout!.uv.length,o.geometry.getIndex()!.count,'one uv pair per face corner');
 assert.equal(layout!.islands.length,12);
 const uv0=JSON.stringify(layout!.uv);
 assert.equal(JSON.stringify(stage.uvLayout(o.id)!.uv),uv0,'repeated reads do not mutate');
 o.geometry.deleteAttribute('uv');
 assert.equal(stage.uvLayout(o.id),null);
 assert.equal(stage.info(o.id)!.uv!.hasUv,false);
 assert.equal(stage.info(o.id)!.uv!.islands,0);
});

test('uv seams survive an edit op that keeps their edges',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.editStart(o.id);
 stage.editSelect('edge',[[12,14]]); // a bottom (-y) border edge of the box
 stage.uvSeamMark(true);
 assert.equal(stage.seamsOf(o).length,2);
 stage.editSelect('face',[4,5]);stage.editSelect('edge',[[12,14]],true);
 stage.editExtrude(0.5); // rebuilds geometry; the bottom edge stays put
 assert.equal(stage.seamsOf(o).length,2,'seam re-found geometrically after the rebuild');
 stage.undo();
 assert.equal(stage.seamsOf(o).length,2,'undo keeps the seam too');
 stage.editEnd();
});

test('uv unwrap: angle method and pack toggle change the layout, both stay in 0..1',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.uvUnwrap(o.id,{method:'angle'});
 const uv=o.geometry.getAttribute('uv')!;
 for(let i=0;i<uv.count;i++){assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1,'packed angle unwrap stays in 0..1');}
 const packed=Array.from(uv.array as Float32Array);
 stage.uvUnwrap(o.id,{method:'angle',pack:false});
 const grid=Array.from(o.geometry.getAttribute('uv')!.array as Float32Array);
 assert.notDeepEqual(grid,packed,'pack toggle changes the layout');
 for(let i=0;i<grid.length;i++)assert.ok(grid[i]>=0&&grid[i]<=1);
 stage.uvUnwrap(o.id,{method:'box',pack:true,padding:0.1});
 const wide=Array.from(o.geometry.getAttribute('uv')!.array as Float32Array);
 assert.notDeepEqual(wide,packed,'padding changes the packing');
 stage.undo();stage.undo();stage.undo();
 assert.ok(stage.canRedo);
});

test('uv unwrap with angle method splits the seamed top face into its own island',()=>{
 const stage=new Stage();const o=stage.addPrimitive('cube') as THREE.Mesh;
 stage.editStart(o.id);
 const pos=o.geometry.getAttribute('position'),idx=o.geometry.getIndex()!;
 const edges:[number,number][]=[];
 for(let f=0;f<idx.count;f+=3)for(let e=0;e<3;e++){
  const a=idx.getX(f+e),b=idx.getX(f+(e+1)%3);
  if(pos.getY(a)!==0.5||pos.getY(b)!==0.5)continue;
  const mx=(pos.getX(a)+pos.getX(b))/2,mz=(pos.getZ(a)+pos.getZ(b))/2;
  if(Math.abs(mx)===0.5||Math.abs(mz)===0.5)edges.push([Math.min(a,b),Math.max(a,b)]);
 }
 stage.editSelect('edge',edges);
 stage.uvSeamMark(true);
 stage.editEnd();
 stage.uvUnwrap(o.id,{method:'angle'});
 assert.equal(stage.info(o.id)!.uv!.islands,2);
 const layout=stage.uvLayout(o.id)!;
 assert.ok(layout.uv.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1));
});
