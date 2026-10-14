import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {IkError} from './ik';
class NFR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(()=>{this.result='data:;base64,x';this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NFR;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** Chain Root(0,0,0) -> Mid(0,1,0) -> End(0,2,0). */
const rig=()=>{
 const st=new Stage();
 const root=new THREE.Bone();root.name='Root';
 const mid=new THREE.Bone();mid.name='Mid';mid.position.y=1;root.add(mid);
 const end=new THREE.Bone();end.name='End';end.position.y=1;mid.add(end);
 st.loadMany([root]);st.root.updateMatrixWorld(true);
 return{st,root,mid,end};
};
const worldY=(st:Stage,b:THREE.Bone)=>{st.root.updateMatrixWorld(true);return b.getWorldPosition(new THREE.Vector3());};
test('toggling IK on snaps the target to the end effector without moving the pose',()=>{
 const {st,root,mid,end}=rig();
 const before=mid.rotation.z;
 st.ikToggle(root.id,true);
 const s=st.ikState(root.id)!;
 assert.equal(s.on,true);
 assert.ok(Math.abs(s.target[1]-2)<1e-6,'target sits at the end effector');
 assert.equal(mid.rotation.z,before,'pose did not move');
 const e=worldY(st,end);
 assert.ok(Math.abs(e.y-2)<1e-6);
 st.undo();
 assert.equal(st.ikState(root.id)!.on,false,'toggle is one undo step');
 st.redo();
 assert.equal(st.ikState(root.id)!.on,true);
});
test('moving the target pulls the end effector there, keeps lengths, one undo',()=>{
 const {st,root,mid,end}=rig();
 st.ikToggle(root.id,true);
 st.ikSetTarget(root.id,[1,1,0]);
 const e=worldY(st,end),m=worldY(st,mid);
 assert.ok(e.distanceTo(new THREE.Vector3(1,1,0))<1e-4,'end reached the target');
 assert.ok(Math.abs(m.distanceTo(new THREE.Vector3(0,0,0))-1)<1e-6,'L1 kept');
 assert.ok(Math.abs(e.distanceTo(m)-1)<1e-6,'L2 kept');
 st.undo();
 const e2=worldY(st,end);
 assert.ok(Math.abs(e2.y-2)<1e-6,'undo restores the straight chain');
 assert.deepEqual(st.ikState(root.id)!.target.map(v=>Math.round(v*1e4)/1e4),[0,2,0]);
});
test('the pole flips the bend side',()=>{
 const {st,root,mid}=rig();
 st.ikToggle(root.id,true);
 st.ikSetTarget(root.id,[1.5,0.4,0]);
 st.ikSetPole(root.id,[0,1,1]);
 const up=worldY(st,mid).z;
 st.ikSetPole(root.id,[0,1,-1]);
 const down=worldY(st,mid).z;
 assert.ok(up*down<0,'the mid joint flips sides with the pole');
});
test('drags solve live and only the commit makes an undo step',()=>{
 const {st,root}=rig();
 st.ikToggle(root.id,true);
 const label=st.undoLabel;
 const before=st.ikBegin(root.id);
 st.ikDragTarget(root.id,[1,1,0]);
 st.ikDragTarget(root.id,[1,0.6,0]);
 assert.equal(st.undoLabel,label,'live drags add no undo entries');
 st.ikCommit(root.id,before,'IK target');
 assert.equal(st.undoLabel,'IK target');
 st.undo();
 assert.equal(st.undoLabel,label);
});
test('joint limits clamp the solved pose and gizmo commits',()=>{
 const {st,root,mid}=rig();
 st.ikToggle(root.id,true);
 // The mid joint may only bend one way around Z.
 st.setBoneLimits(mid.id,[0,Number.NaN,Number.NaN],[Number.NaN,Number.NaN,Number.NaN]);
 st.ikSetTarget(root.id,[-1.5,0.4,0]);
 const l=st.boneLimitsOf(mid.id)!;
 assert.equal(l.min[0],0);
 assert.ok(mid.rotation.z>=-1e-9,'the solved pose respects the limit');
 st.undo();st.undo(); // target + limits
 assert.equal(st.boneLimitsOf(mid.id),null,'limits removal is undoable');
 // A committed bone transform clamps too.
 st.setBoneLimits(mid.id,[Number.NaN,Number.NaN,-0.5],[Number.NaN,Number.NaN,0.5]);
 const before={p:mid.position.clone(),r:mid.rotation.clone(),s:mid.scale.clone()};
 mid.rotation.z=2;st.commitTransform(mid.id,before);
 assert.ok(mid.rotation.z<=0.5+1e-9,'gizmo commit clamps');
});
test('limits validation and chain validation refuse bad input',()=>{
 const {st,root,end}=rig();
 assert.throws(()=>st.setBoneLimits(root.id,[30,0,0],[10,0,0]),IkError);
 assert.throws(()=>st.ikToggle(end.id,true),IkError,'an end bone heads no chain');
 assert.throws(()=>st.ikSetTarget(root.id,[1,1,0]),IkError,'IK off: target refuses');
 assert.equal(st.ikChainHead(end.id)?.id,root.id,'chain head found from the end bone');
 assert.equal(st.ikChainHead(root.id+999),null);
 assert.equal(st.ikState(end.id),null,'a mid/end bone shows the chain of its head, not its own');
});
