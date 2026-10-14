import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {IkError} from './ik';
class NFR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result='data:;base64,x';this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NFR;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** Straight spine Root -> A -> B -> C -> Tip, one unit apart along +Y (4 segments). */
const rig=()=>{
 const st=new Stage();
 const root=new THREE.Bone();root.name='Root';
 const a=new THREE.Bone();a.name='A';a.position.y=1;root.add(a);
 const b=new THREE.Bone();b.name='B';b.position.y=1;a.add(b);
 const c=new THREE.Bone();c.name='C';c.position.y=1;b.add(c);
 const tip=new THREE.Bone();tip.name='Tip';tip.position.y=1;c.add(tip);
 st.loadMany([root]);st.root.updateMatrixWorld(true);
 return{st,root,a,b,c,tip};
};
const world=(st:Stage,b:THREE.Bone)=>{st.root.updateMatrixWorld(true);return b.getWorldPosition(new THREE.Vector3());};
test('toggling FABRIK on snaps the target to the end effector without moving the pose',()=>{
 const{st,root,tip}=rig();
 st.fabrikToggle(root.id,true);
 const s=st.fabrikState(root.id)!;
 assert.equal(s.on,true);assert.equal(s.look.on,false);
 assert.ok(Math.abs(s.target[1]-4)<1e-6,'target sits at the end effector');
 assert.ok(Math.abs(world(st,tip).y-4)<1e-6,'pose did not move');
 st.undo();assert.equal(st.fabrikState(root.id)!.on,false,'toggle is one undo step');
 st.redo();assert.equal(st.fabrikState(root.id)!.on,true);
});
test('moving the target bends the chain, keeps every segment length and the root, one undo',()=>{
 const{st,root,a,b,c,tip}=rig();
 st.fabrikToggle(root.id,true);
 st.fabrikSetTarget(root.id,[2,2,0]);
 const e=world(st,tip);
 assert.ok(e.distanceTo(new THREE.Vector3(2,2,0))<1e-3,'end reached the target');
 const chain=[root,a,b,c,tip];
 for(let i=0;i+1<chain.length;i++)assert.ok(Math.abs(world(st,chain[i]).distanceTo(world(st,chain[i+1]))-1)<1e-6,`segment ${i} length`);
 assert.ok(world(st,root).length()<1e-9,'root pinned');
 assert.ok(Math.abs(world(st,b).z)<1e-9,'bend stays in the solve plane');
 st.undo();
 assert.ok(Math.abs(world(st,tip).y-4)<1e-6,'undo restores the straight chain');
 assert.equal(st.undoLabel,'FABRIK on Root','one undo step for the move');
});
test('an unreachable target stretches the chain straight at it',()=>{
 const{st,root,tip}=rig();
 st.fabrikToggle(root.id,true);
 st.fabrikSetTarget(root.id,[10,0,0]);
 const e=world(st,tip);
 assert.ok(Math.abs(e.x-4)<1e-6&&Math.abs(e.y)<1e-6,'full reach toward the target');
});
test('drags solve live and only the commit makes an undo step',()=>{
 const{st,root}=rig();
 st.fabrikToggle(root.id,true);
 const label=st.undoLabel;
 const before=st.fabrikBegin(root.id);
 st.fabrikDragTarget(root.id,[1,3,0]);st.fabrikDragTarget(root.id,[2,2,0]);
 assert.equal(st.undoLabel,label,'live drags add no undo entries');
 st.fabrikCommit(root.id,before,'FABRIK target');
 assert.equal(st.undoLabel,'FABRIK target');
 st.undo();assert.equal(st.undoLabel,label);
});
test('look-at aims the end bone at its target and toggles with one undo',()=>{
 const{st,root,tip}=rig();
 st.fabrikToggle(root.id,true);
 st.fabrikLookToggle(root.id,true);
 st.fabrikSetLook(root.id,[0,4,3]);
 const dir=new THREE.Vector3(0,1,0).applyQuaternion(tip.getWorldQuaternion(new THREE.Quaternion()));
 assert.ok(dir.distanceTo(new THREE.Vector3(0,0,1))<1e-3,'end +Y aims at the look target');
 assert.equal(st.fabrikState(root.id)!.look.on,true);
 st.undo();st.undo(); // look target + look toggle
 assert.equal(st.fabrikState(root.id)!.look.on,false,'look toggle is undoable');
});
test('joint limits clamp the solved rotations',()=>{
 const{st,root,b,tip}=rig();
 st.setBoneLimits(b.id,[Number.NaN,Number.NaN,-5],[Number.NaN,Number.NaN,5]);
 st.fabrikToggle(root.id,true);
 st.fabrikSetTarget(root.id,[2,2,0]);
 assert.ok(Math.abs(b.rotation.z)<=THREE.MathUtils.degToRad(5)+1e-9,'bend respects the limit');
 assert.ok(world(st,tip).distanceTo(new THREE.Vector3(2,2,0))>1e-3,'the clamped chain cannot fully reach');
 st.undo();st.undo();st.undo(); // target + toggle + limits
 assert.equal(st.boneLimitsOf(b.id),null,'limits removal is undoable');
});
test('head resolution, driven bones and validation',()=>{
 const{st,root,a,b,c,tip}=rig();
 assert.equal(st.fabrikChainHead(b.id)!.id,a.id,'nearest valid head walking up');
 assert.equal(st.fabrikChainHead(tip.id)!.id,a.id,'the tip joins the nearest valid chain below the root');
 st.fabrikToggle(root.id,true);
 assert.equal(st.fabrikChainHead(b.id)!.id,root.id,'the active chain wins');
 for(const bone of[root,a,b,c])assert.ok(st.fabrikDriven(bone.id),`${bone.name} is driven`);
 assert.ok(!st.fabrikDriven(tip.id),'the end bone stays FK until look-at is on');
 st.fabrikLookToggle(root.id,true);
 assert.ok(st.fabrikDriven(tip.id),'look-at drives the end bone too');
 st.fabrikToggle(root.id,false);
 assert.ok(!st.fabrikDriven(a.id),'off drives nothing');
 // Validation.
 assert.throws(()=>st.fabrikToggle(c.id,true),IkError,'a one-segment chain is too short');
 assert.equal(st.fabrikState(c.id),null,'no FABRIK state below three segments');
 assert.throws(()=>st.fabrikDragTarget(root.id,[0,0,0]),IkError,'drag needs FABRIK on');
 assert.throws(()=>st.fabrikSetLook(root.id,[0,0,1]),IkError,'look drag needs FABRIK on');
 st.fabrikToggle(root.id,true);
 assert.throws(()=>st.fabrikDragLook(root.id,[0,0,1]),IkError,'look drag needs look-at on');
 // A two-bone chain still belongs to two-bone IK.
 const r2=new THREE.Bone();const m2=new THREE.Bone();m2.position.y=1;r2.add(m2);const e2=new THREE.Bone();e2.position.y=1;m2.add(e2);
 st.loadMany([r2]);
 assert.equal(st.fabrikState(r2.id),null,'two segments stay with two-bone IK');
});
