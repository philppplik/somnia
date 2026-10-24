import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {PoseError} from './poses';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** A skinned box on a LeftArm/RightArm chain plus a Spine root. */
const rig=()=>{
 const st=new Stage();
 const spine=new THREE.Bone();spine.name='Spine';
 const left=new THREE.Bone();left.name='Arm.L';left.position.x=-1;spine.add(left);
 const right=new THREE.Bone();right.name='Arm.R';right.position.x=1;spine.add(right);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh.name='Body';
 st.loadMany([mesh,spine]);st.root.updateMatrixWorld(true);
 const sk=st.skinBind(mesh.id,spine.id,'rigid');
 return{st,sk,spine,left,right};
};
test('save, apply, remove: round trip, one undo each',()=>{
 const {st,sk,left}=rig();
 st.poseSave(sk.id,'Rest');
 assert.deepEqual(st.poseList(sk.id),[{name:'Rest',bones:3}]);
 left.rotation.z=0.7;
 st.poseSave(sk.id,'Bent');
 st.poseApply(sk.id,'Rest');
 assert.ok(Math.abs(left.rotation.z)<1e-7,'apply restores the saved pose');
 st.undo();
 assert.ok(Math.abs(left.rotation.z-0.7)<1e-7,'one undo restores the pre-apply pose');
 st.poseApply(sk.id,'Rest');
 st.poseRemove(sk.id,'Rest');
 assert.deepEqual(st.poseList(sk.id).map(p=>p.name),['Bent']);
 st.undo();
 assert.deepEqual(st.poseList(sk.id).map(p=>p.name),['Rest','Bent'],'remove is one undo step');
});
test('saving with a duplicate or empty name refuses',()=>{
 const {st,sk}=rig();
 st.poseSave(sk.id,'Rest');
 assert.throws(()=>st.poseSave(sk.id,'Rest'),PoseError);
 assert.throws(()=>st.poseSave(sk.id,'  '),PoseError);
 assert.throws(()=>st.poseApply(sk.id,'Nope'),PoseError);
 assert.throws(()=>st.poseRemove(sk.id,'Nope'),PoseError);
});
test('mirror swaps the L/R pair and keeps unpaired bones',()=>{
 const {st,sk,left,right,spine}=rig();
 left.rotation.z=0.5;right.rotation.z=-0.25;spine.rotation.y=0.1;
 st.poseSave(sk.id,'Twist');
 left.rotation.z=0;right.rotation.z=0;spine.rotation.y=0;
 st.poseMirror(sk.id,'Twist');
 assert.ok(Math.abs(left.rotation.z-(-0.25))<1e-7,'left takes the right side');
 assert.ok(Math.abs(right.rotation.z-0.5)<1e-7,'right takes the left side');
 assert.ok(Math.abs(spine.rotation.y-0.1)<1e-7,'unpaired bone keeps its own pose');
 st.undo();
 assert.ok(Math.abs(left.rotation.z)<1e-7,'mirror is one undo step');
});
test('blend of two poses lands between them, t from the command is honoured',()=>{
 const {st,sk,left}=rig();
 st.poseSave(sk.id,'A');
 left.rotation.z=1;st.poseSave(sk.id,'B');
 left.rotation.z=0;
 st.poseBlend(sk.id,'A','B',0.25);
 assert.ok(Math.abs(left.rotation.z-0.25)<1e-3,`expected ~0.25, got ${left.rotation.z}`);
 st.undo();
 assert.ok(Math.abs(left.rotation.z)<1e-7);
});
test('poses are per rig and do not leak between rigs',()=>{
 const st=new Stage();
 const spine=new THREE.Bone();spine.name='Spine';
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh.name='Body';
 const spine2=new THREE.Bone();spine2.name='Spine2';
 const mesh2=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());mesh2.name='Body2';
 st.loadMany([mesh,spine,mesh2,spine2]);st.root.updateMatrixWorld(true);
 const sk=st.skinBind(mesh.id,spine.id,'rigid');
 st.poseSave(sk.id,'Rest');
 const sk2=st.skinBind(mesh2.id,spine2.id,'rigid');
 assert.deepEqual(st.poseList(sk2.id),[]);
 assert.deepEqual(st.poseList(sk.id).map(p=>p.name),['Rest']);
});
test('a plain mesh or a missing id has no rig',()=>{
 const st=new Stage();
 const spine=new THREE.Bone();spine.name='Spine';
 const plain=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());plain.name='Plain';
 st.loadMany([plain,spine]);st.root.updateMatrixWorld(true);
 assert.throws(()=>st.poseSave(plain.id+10000,'X'),/No object with id/);
 assert.throws(()=>st.poseSave(plain.id,'X'),PoseError);
 assert.deepEqual(st.poseList(plain.id),[]);
});
