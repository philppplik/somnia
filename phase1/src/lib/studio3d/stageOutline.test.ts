import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage,collectNodeExtras,applyNodeExtras,StageError} from './stage';

const world=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3()).toArray().map(n=>Math.round(n*1e6)/1e6);

test('reparent keeps world transforms and restores the hierarchy in one undo step',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');const c=st.addPrimitive('cone');
 st.setTransform(a.id,{position:{x:1,y:0.5,z:0},rotation:{y:45},scale:{x:2,y:2,z:2}});
 st.setTransform(b.id,{position:{x:3,y:1,z:0}});
 st.setTransform(c.id,{position:{x:-2,y:0,z:1}});
 const wb=world(st.find(b.id)!),wc=world(st.find(c.id)!);
 st.reparent([b.id,c.id],a.id);
 st.root.updateMatrixWorld(true);
 assert.deepEqual(world(st.find(b.id)!),wb);assert.deepEqual(world(st.find(c.id)!),wc);
 assert.equal(st.find(b.id)!.parent,st.find(a.id));assert.equal(st.find(c.id)!.parent,st.find(a.id));
 const outline=st.measure().outline;
 assert.equal(outline.find(o=>o.id===b.id)!.depth,1);assert.equal(outline.find(o=>o.id===c.id)!.depth,1);
 assert.equal(st.undoLabel?.key.startsWith('studio3d.hist.move'),true);
 st.undo();st.root.updateMatrixWorld(true);
 assert.deepEqual(world(st.find(b.id)!),wb);
 assert.equal(st.find(b.id)!.parent,st.root);assert.equal(st.find(c.id)!.parent,st.root);
 st.redo();assert.equal(st.find(b.id)!.parent,st.find(a.id));
});

test('reparent to the scene root and into a loaded group, refusing cycles and bones',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const g=st.group([a.id,b.id]);
 const c=st.addPrimitive('cone');
 st.reparent([c.id],g.id);assert.equal(st.find(c.id)!.parent,st.find(g.id));
 st.reparent([c.id],null);assert.equal(st.find(c.id)!.parent,st.root);
 assert.throws(()=>st.reparent([g.id],g.id),/itself/);
 st.reparent([c.id],g.id);
 assert.throws(()=>st.reparent([g.id],c.id),/own child/); // c sits under g
 assert.throws(()=>st.reparent([c.id],999),StageError);
 st.undo();assert.equal(st.find(c.id)!.parent,st.root);
 // Bones cannot take children: the skin would lose its structure.
 const st2=new Stage();const bone=new THREE.Bone();bone.name='Hip';st2.loadMany([bone]);
 const m=st2.addPrimitive('cube');
 assert.throws(()=>st2.reparent([m.id],st2.bones()[0].id),/bone/);
});

test('hidden and locked flags round-trip through the outline and undo',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 st.setHidden(a.id,true);st.setLocked(a.id,true);
 let outline=st.measure().outline;
 assert.equal(outline.find(o=>o.id===a.id)!.hidden,true);
 assert.equal(outline.find(o=>o.id===a.id)!.locked,true);
 assert.equal(outline.find(o=>o.id===b.id)!.hidden,false);
 assert.equal(st.find(a.id)!.visible,false);
 assert.equal(st.find(a.id)!.userData.somniaLocked,true);
 st.undo();assert.equal(st.find(a.id)!.userData.somniaLocked,false);
 st.undo();assert.equal(st.find(a.id)!.visible,true);
 // No-op calls add no undo entries.
 const label=st.undoLabel;
 st.setHidden(a.id,false);st.setLocked(a.id,false);
 assert.equal(st.measure().outline.find(o=>o.id===a.id)!.hidden,false);
 assert.equal(st.undoLabel,label);
 assert.throws(()=>st.setHidden(st.root.id,true),StageError);
});

test('collectNodeExtras/applyNodeExtras carry hidden and locked flags, alone and on lights',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const l=st.addLight('directional');st.setLight(l.id,{shadow:true});
 st.setHidden(a.id,true);st.setLocked(l.id,true);
 const extras=collectNodeExtras(st.root);
 const cubeEx=extras.find(e=>e.hidden&&!e.locked);assert.ok(cubeEx);
 const lightEx=extras.find(e=>e.locked);assert.ok(lightEx);assert.equal(lightEx!.shadow,true);
 // Apply onto a fresh clone of the same tree: indices line up by pre-order.
 const clone=st.root.clone(true);
 const {skipped}=applyNodeExtras(clone,extras);assert.equal(skipped,0);
 const flagAt=(root:THREE.Object3D,i:number)=>{const out:THREE.Object3D[]=[];const w=(o:THREE.Object3D)=>{for(const c of o.children){out.push(c);w(c);}};w(root);return out[i];};
 const nodes=(r:THREE.Object3D)=>{const out:THREE.Object3D[]=[];const w=(o:THREE.Object3D)=>{for(const c of o.children){out.push(c);w(c);}};w(r);return out;};
 const ci=nodes(st.root).findIndex(o=>o.id===a.id),li=nodes(st.root).findIndex(o=>o.id===l.id);
 assert.equal(flagAt(clone,ci).visible,false);
 assert.equal(flagAt(clone,li).userData.somniaLocked,true);
 assert.equal((flagAt(clone,li) as THREE.DirectionalLight).castShadow,true);
});

test('reorder moves a node before or after a sibling in one undo step',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');const c=st.addPrimitive('cone');
 const names=()=>st.root.children.map(o=>o.name);
 assert.deepEqual(names(),['Cube','Sphere','Cone']);
 st.reorder([c.id],a.id,'before');
 assert.deepEqual(names(),['Cone','Cube','Sphere']);
 st.undo();
 assert.deepEqual(names(),['Cube','Sphere','Cone']);
 st.redo();
 assert.deepEqual(names(),['Cone','Cube','Sphere']);
 st.reorder([a.id],c.id,'after');
 assert.deepEqual(names(),['Cone','Cube','Sphere']); // already after
 st.reorder([b.id],a.id,'before');
 assert.deepEqual(names(),['Cone','Sphere','Cube']);
});
test('reorder across parents keeps the world transform and restores both in one undo',()=>{
 const st=new Stage();
 const g=st.group([st.addPrimitive('cube').id,st.addPrimitive('cone').id]);
 const solo=st.addPrimitive('sphere');solo.position.set(3,1,0);
 st.root.updateMatrixWorld(true);
 const before=solo.getWorldPosition(new THREE.Vector3()).clone();
 st.reorder([solo.id],g.id,'after');
 assert.equal(st.find(solo.id)!.parent,st.root); // the group is a root child: after it means root level
 const after=st.find(solo.id)!.getWorldPosition(new THREE.Vector3());
 assert.ok(after.distanceTo(before)<1e-9,'world transform kept');
 st.undo();
 assert.ok(st.find(solo.id)!.getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-9);
});
test('reorder into a group child slot and drop-on-self no-op',()=>{
 const st=new Stage();
 const kid=st.addPrimitive('cube');
 const g=st.group([kid.id,st.addPrimitive('cone').id]);
 const loose=st.addPrimitive('sphere');
 st.reorder([loose.id],kid.id,'before');
 assert.equal(st.find(loose.id)!.parent,g);
 assert.deepEqual(g.children.map(o=>o.name),['Sphere','Cube','Cone']);
 st.undo();
 assert.equal(st.find(loose.id)!.parent,st.root);
 // Dropping a row onto itself changes nothing and pushes no undo entry.
 const undoBefore=st.canUndo;
 st.reorder([loose.id],loose.id,'before');
 assert.equal(st.find(loose.id)!.parent,st.root);
 assert.equal(st.canUndo,undoBefore);
});
