import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** A plain box next to a two-bone chain: Hip at the origin, Knee at y=1. */
const rig=()=>{
 const st=new Stage();
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 // Height-segmented so mid vertices land between the joints; lifted so the box straddles both.
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1,1,4,1),new THREE.MeshStandardMaterial());mesh.name='Body';mesh.position.y=0.5;
 st.loadMany([mesh,hip]);st.root.updateMatrixWorld(true);
 return{st,mesh,hip,knee};
};
test('bind turns a plain mesh into a skinned mesh with normalised weights, undo restores it',()=>{
 const {st,mesh,hip}=rig();const uuid=mesh.uuid;
 const sk=st.skinBind(mesh.id,hip.id,'smooth');
 assert.notEqual(sk.id,mesh.id,'the skinned mesh is a new object; the caller re-selects it');const id=sk.id;
 assert.ok(sk.isSkinnedMesh,'the mesh is skinned now');
 assert.equal(sk.uuid,uuid,'uuid survives so clip tracks keep binding');
 assert.equal(sk.skeleton.bones.length,2);
 const w=sk.geometry.getAttribute('skinWeight');
 for(let v=0;v<w.count;v++){let sum=0;for(let k=0;k<4;k++)sum+=w.getComponent(v,k);assert.ok(Math.abs(sum-1)<1e-4,'weights sum to 1');}
 // Lower vertices favour Hip, upper favour Knee.
 const pos=sk.geometry.getAttribute('position');const si=sk.geometry.getAttribute('skinIndex');
 let lowOk=false,upOk=false;
 for(let v=0;v<pos.count;v++){const y=pos.getY(v);if(y<0)lowOk=lowOk||si.getComponent(v,0)===0;if(y>0)upOk=upOk||si.getComponent(v,0)===1;}
 assert.ok(lowOk&&upOk,'nearest bone wins per region');
 st.undo();
 assert.ok(!(st.find(mesh.id) as THREE.SkinnedMesh).isSkinnedMesh,'undo restores the plain mesh under its own id');
 assert.equal(st.find(mesh.id)!.uuid,uuid);
 st.redo();
 assert.ok((st.find(id) as THREE.SkinnedMesh).isSkinnedMesh,'redo re-binds');
});
test('rigid bind gives every vertex exactly one joint',()=>{
 const {st,mesh,hip}=rig();
 const sk=st.skinBind(mesh.id,hip.id,'rigid');
 const w=sk.geometry.getAttribute('skinWeight');
 for(let v=0;v<w.count;v++){assert.equal(w.getComponent(v,0),1);for(let k=1;k<4;k++)assert.equal(w.getComponent(v,k),0);}
});
test('reweight recomputes on the existing skeleton and undo brings the old weights back',()=>{
 const {st,mesh,hip}=rig();
 const sk=st.skinBind(mesh.id,hip.id,'rigid');
 const rigid=Array.from(sk.geometry.getAttribute('skinWeight').array);
 st.skinRebind(sk.id,'smooth');
 const smooth=Array.from(sk.geometry.getAttribute('skinWeight').array);
 assert.notDeepEqual(smooth,rigid);
 assert.ok(smooth.some(w=>w>0&&w<1),'smooth bind blends');
 st.undo();
 assert.deepEqual(Array.from(sk.geometry.getAttribute('skinWeight').array),rigid);
});
test('weights follow the bones: moving the chain changes the bind',()=>{
 const a=rig();a.knee.position.y=3;a.st.root.updateMatrixWorld(true);
 const skA=a.st.skinBind(a.mesh.id,a.hip.id,'rigid');
 const posA=skA.geometry.getAttribute('position');const siA=skA.geometry.getAttribute('skinIndex');
 // With Knee far up, no box vertex (y in [-1,1]) is nearer to Knee than to Hip.
 for(let v=0;v<posA.count;v++)assert.equal(siA.getComponent(v,0),0);
});
test('bind refuses wrong targets with readable errors',()=>{
 const {st,mesh,hip}=rig();
 assert.throws(()=>st.skinBind(mesh.id,mesh.id,'smooth'),/not a bone/);
 assert.throws(()=>st.skinBind(hip.id,hip.id,'smooth'),/not a mesh/);
 const sk=st.skinBind(mesh.id,hip.id,'smooth');
 assert.throws(()=>st.skinBind(sk.id,hip.id,'smooth'),/already skinned/);
 const plain=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));plain.name='Plain';st.loadMany([plain]);
 assert.throws(()=>st.skinRebind(plain.id,'smooth'),/not a skinned mesh/);
});
test('a bound mesh exports as a second skin and the weights come back',async()=>{
 const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const {st,mesh,hip}=rig();
 st.skinBind(mesh.id,hip.id,'smooth');
 assert.equal(st.bones().length,2,'the chain is listed as bones');
 const ex=new GLTFExporter();
 const out=await ex.parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:[]}) as {skins?:{joints:number[]}[]};
 assert.equal(out.skins!.length,1);assert.equal(out.skins![0].joints.length,2);
 const g=await new Promise<{scene:THREE.Group}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 const re=g.scene.getObjectByProperty('isSkinnedMesh',true) as THREE.SkinnedMesh|undefined;
 assert.ok(re,'the reopened file has the skinned box');
 assert.equal(re.skeleton.bones.length,2);
 const w=re.geometry.getAttribute('skinWeight');let sum=0;for(let k=0;k<4;k++)sum+=w.getComponent(0,k);
 assert.ok(Math.abs(sum-1)<1e-3,'weights survive the roundtrip');
});
const brush={radius:2,strength:0.5,falloff:'constant' as const,mode:'add' as const};
test('a paint stroke changes weights per dab and undoes as one step',()=>{
 const {st,mesh,hip,knee}=rig();
 const sk=st.skinBind(mesh.id,hip.id,'rigid');
 const before=Array.from(sk.geometry.getAttribute('skinWeight').array);
 st.skinPaintStart(sk.id);
 const n1=st.skinPaint(sk.id,knee.id,[0,1,0] as const,brush);assert.ok(n1>0,'the dab hit vertices');
 const n2=st.skinPaint(sk.id,knee.id,[0,0,0] as const,brush);assert.ok(n2>0);
 st.skinPaintEnd(sk.id);
 const painted=Array.from(sk.geometry.getAttribute('skinWeight').array);
 assert.notDeepEqual(painted,before);
 for(let v=0;v<painted.length/4;v++){let sum=0;for(let k=0;k<4;k++)sum+=painted[v*4+k];assert.ok(Math.abs(sum-1)<1e-3,'still normalised');}
 st.undo();assert.deepEqual(Array.from(sk.geometry.getAttribute('skinWeight').array),before,'both dabs revert in one undo');
 st.redo();assert.deepEqual(Array.from(sk.geometry.getAttribute('skinWeight').array),painted);
});
test('a stroke with no landed dab leaves no undo step and painting needs an open stroke',()=>{
 const {st,mesh,hip,knee}=rig();
 const sk=st.skinBind(mesh.id,hip.id,'rigid');
 const labelBefore=st.undoLabel;
 assert.throws(()=>st.skinPaint(sk.id,knee.id,[0,0,0],brush),/Start a paint stroke/);
 st.skinPaintStart(sk.id);
 assert.equal(st.skinPaint(sk.id,knee.id,[99,99,99],brush),0);
 st.skinPaintEnd(sk.id);
 assert.equal(st.undoLabel,labelBefore,'no dab, no undo step');
 st.undo();assert.ok(st.find(sk.id)==null&&!(st.find(mesh.id) as THREE.SkinnedMesh).isSkinnedMesh,'the next undo is the bind, not an empty stroke');
 st.redo();
 assert.throws(()=>st.skinPaint(sk.id,mesh.id,[0,0,0],brush),/Start a paint stroke first|not part of the mesh skeleton/);
});
test('re-weighting a posed skeleton resets it to the bind pose inside the same undo step',()=>{
 const {st,mesh,hip,knee}=rig();
 const sk=st.skinBind(mesh.id,hip.id,'smooth');
 knee.rotation.z=0.7;st.root.updateMatrixWorld(true);
 const reset=st.skinRebind(sk.id,'rigid');
 assert.equal(reset,true);
 assert.ok(Math.abs(knee.rotation.z)<1e-6,'the pose was snapped back to bind');
 st.undo();
 assert.ok(Math.abs(knee.rotation.z-0.7)<1e-6,'undo restores the pose together with the weights');
 st.redo();
 assert.ok(Math.abs(knee.rotation.z)<1e-6,'redo snaps to bind again');
 // In bind pose there is nothing to reset.
 assert.equal(st.skinRebind(sk.id,'smooth'),false);
});
