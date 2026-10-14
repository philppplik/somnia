import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {RetargetError} from './retarget';
import {ClipError} from './clips';
class NFR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result='data:;base64,x';this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NFR;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** Two rigs with the same bone names; the target's mid bone rests rotated 45 degrees about Z. Each rig has a skinned mesh so the bind pose is real. */
const twoRigs=()=>{
 const st=new Stage();
 const makeRig=(x:number,restZ:number)=>{
  const root=new THREE.Bone();root.name='Root';
  const mid=new THREE.Bone();mid.name='Mid';mid.position.y=1;mid.rotation.z=restZ;root.add(mid);
  const end=new THREE.Bone();end.name='End';end.position.y=1;mid.add(end);
  const geo=new THREE.BoxGeometry(0.2,2,0.2);const count=geo.getAttribute('position').count;
  const si=new Uint16Array(count*4),sw=new Float32Array(count*4);for(let i=0;i<count;i++){si[i*4]=i%3;sw[i*4]=1;}
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  root.position.x=x;
  const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial());mesh.name='Body';mesh.add(root);
  mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([root,mid,end]));
  return{root,mid,end,mesh};
 };
 const a=makeRig(0,0),b=makeRig(3,Math.PI/4);
 st.loadMany([a.mesh,b.mesh]);st.root.updateMatrixWorld(true);
 return{st,a,b};
};
const zOf=(q:THREE.Quaternion)=>2*Math.atan2(q.z,q.w);
test('mapping pairs the same-named bones across the rigs',()=>{
 const{st,a,b}=twoRigs();
 const m=st.retargetMap(a.root.id,b.root.id);
 assert.equal(m.pairs.length,3);
 assert.deepEqual(m.pairs.map(p=>p.target.name),['Root','Mid','End']);
 assert.throws(()=>st.retargetMap(a.root.id,a.root.id),RetargetError,'same rig refused');
});
test('preview poses the target with the source rotation on top of its rest pose, one undo',()=>{
 const{st,a,b}=twoRigs();
 const c=st.addClip('Wave',2);
 a.mid.rotation.z=Math.PI/2;st.recordPose(c,1,[a.mid.id]);
 a.mid.rotation.z=0;st.root.updateMatrixWorld(true);
 const n=st.retargetPreview(a.root.id,b.root.id,c,1);
 assert.equal(n,3);
 assert.ok(Math.abs(zOf(b.mid.quaternion)-3*Math.PI/4)<1e-3,'45 degree rest plus 90 degree source motion');
 st.undo();
 assert.ok(Math.abs(zOf(b.mid.quaternion)-Math.PI/4)<1e-3,'undo restores the rest pose');
 st.redo();
 assert.ok(Math.abs(zOf(b.mid.quaternion)-3*Math.PI/4)<1e-3);
});
test('apply bakes a new clip with tracks on the target bones, sampled at the source keys',()=>{
 const{st,a,b}=twoRigs();
 const c=st.addClip('Wave',2);
 a.mid.rotation.z=Math.PI/2;st.recordPose(c,1,[a.mid.id]);
 const made=st.retargetApply(a.root.id,b.root.id,c);
 const clip=st.clips[made];
 assert.equal(clip.name,'Retarget: Wave');
 assert.equal(clip.duration,2);
 assert.equal(clip.tracks.length,1,'only the moved source bone produces a track');
 const tr=clip.tracks[0];
 assert.equal(tr.name,`${b.mid.uuid}.quaternion`,'the track targets the target bone');
 assert.deepEqual(Array.from(tr.times),[0,1,2],'endpoints plus the source key');
 const q=new THREE.Quaternion(tr.values[8],tr.values[9],tr.values[10],tr.values[11]);
 assert.ok(Math.abs(zOf(q)-3*Math.PI/4)<1e-3,'the baked key carries the delta');
 st.undo();assert.equal(st.clips.length,1,'apply is one undo step');
 st.redo();assert.equal(st.clips.length,2);
});
test('apply refuses a clip without source motion and validates input',()=>{
 const{st,a,b}=twoRigs();
 const c=st.addClip('Still',2);
 assert.throws(()=>st.retargetApply(a.root.id,b.root.id,c),ClipError);
 assert.throws(()=>st.retargetApply(a.root.id,b.root.id,9),ClipError);
 assert.equal(st.clips.length,1,'nothing was added');
});
test('poseAt interpolates between keys; motionPathOf follows the end bone arc',()=>{
 const{st,a}=twoRigs();
 const c=st.addClip('Swing',2);
 a.mid.rotation.z=0;st.recordPose(c,0,[a.mid.id]);
 a.mid.rotation.z=Math.PI/2;st.recordPose(c,2,[a.mid.id]);
 const pose=st.poseAt(c,1);
 const q=pose.get(a.mid.uuid)!.q!;
 assert.ok(Math.abs(zOf(new THREE.Quaternion(...q))-Math.PI/4)<1e-3,'slerp halfway');
 const path=st.motionPathOf(a.end.id,c,32);
 assert.equal(path.length,32);
 const first=path[0],last=path[31];
 assert.ok(Math.abs(first[0])<1e-6&&Math.abs(first[1]-2)<1e-6,'starts straight up');
 assert.ok(Math.abs(last[0]+1)<1e-3&&Math.abs(last[1]-1)<1e-3,'ends swung to the side');
 assert.throws(()=>st.motionPathOf(a.mesh.id,c,8),ClipError,'meshes have no motion path');
});
