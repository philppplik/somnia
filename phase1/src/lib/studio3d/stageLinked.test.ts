import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Stage} from './stage';
/** The exporter needs FileReader, which Node does not have. A tiny stand-in over Blob is enough here. */
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;

test('duplicateLinkedMany: copies share the source geometry, source and copies are marked, one undo step',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const copies=st.duplicateLinkedMany([m.id]);
 assert.equal(copies.length,1);
 const c=copies[0] as THREE.Mesh;
 assert.equal(c.geometry,m.geometry,'geometry is shared, not cloned');
 assert.notEqual(c.material,m.material,'materials stay per-object');
 assert.equal(st.isLinked(m),true);assert.equal(st.isLinked(c),true);
 assert.equal(st.geometryUsers(m.geometry),2);
 st.undo();assert.equal(st.geometryUsers(m.geometry),1);assert.equal(st.isLinked(m),false);
 st.redo();assert.equal(st.geometryUsers(m.geometry),2);assert.equal(st.isLinked(m),true);
});

test('a regular duplicate shares geometry but stays unmarked and freely editable',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicate(m.id) as THREE.Mesh;
 assert.equal(c.geometry,m.geometry,'existing duplicate behaviour unchanged');
 assert.equal(st.isLinked(m),false);assert.equal(st.isLinked(c),false);
 st.editStart(c.id);st.editEnd();
});

test('editStart refuses a linked instance until it is made single-user',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 assert.throws(()=>st.editStart(c.id),/linked instance/);
 assert.throws(()=>st.editStart(m.id),/linked instance/);
 st.makeSingleUser(c.id);
 assert.notEqual(c.geometry,m.geometry);
 assert.equal(st.isLinked(c),false);
 st.editStart(c.id);st.editEnd();
});

test('makeSingleUser: undo restores the shared geometry and the marker, redo detaches again',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 const shared=m.geometry;
 st.makeSingleUser(c.id);
 assert.notEqual(c.geometry,shared);assert.equal(st.geometryUsers(shared),1);
 st.undo();
 assert.equal(c.geometry,shared,'undo re-links the instance');
 assert.equal(st.isLinked(c),true);
 st.redo();
 assert.notEqual(c.geometry,shared);assert.equal(st.isLinked(c),false);
});

test('makeSingleUser refuses meshes that are not linked instances',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 assert.throws(()=>st.makeSingleUser(m.id),/not a linked instance/);
});

test('mesh ops refuse linked instances: primitive params, apply scale, mirror modifier, sculpt, vertex paint, separate',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 assert.throws(()=>st.setPrimitive(c.id,{size:2}),/linked instance/);
 c.scale.set(2,2,2);
 assert.throws(()=>st.applyScale([c.id]),/linked instance/);
 assert.throws(()=>st.mirrorMod(c.id,'x',0.001,true),/linked instance/);
 assert.throws(()=>st.sculptBegin(c.id),/linked instance/);
 assert.throws(()=>st.vcolPaintStart(c.id),/linked instance/);
 assert.throws(()=>st.separate([c.id]),/linked instance/);
});

test('undoing a linked duplicate and dropping the entry releases the copy but never the shared geometry',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 let sharedDisposed=0,copyMatDisposed=0;
 m.geometry.addEventListener('dispose',()=>sharedDisposed++);
 (c.material as THREE.Material).addEventListener('dispose',()=>copyMatDisposed++);
 st.undo();// copy leaves the scene; the duplicate entry is now redo-only
 st.addPrimitive('cube');// pushing drops the redo branch: the duplicate entry releases and disposes the copy
 assert.equal(sharedDisposed,0,'shared geometry survives the released copy (the source still uses it)');
 assert.equal(copyMatDisposed,1,'the copy-only material is disposed (proves the release ran)');
});

test('undo-delete of a linked instance releases nothing: geometry and material stay alive',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 let disposed=0;
 m.geometry.addEventListener('dispose',()=>disposed++);
 (c.material as THREE.Material).addEventListener('dispose',()=>disposed++);
 st.removeMany([c.id]);
 st.undo();// the instance is back; the delete entry is redo-only with the objects owned by the scene
 st.addPrimitive('cube');// drops the redo branch: release sees the objects owned and disposes nothing
 assert.equal(disposed,0);
 assert.equal(st.geometryUsers(m.geometry),2,'both instances are live and still linked');
});

test('measure flags linked instances with their geometry user count',()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 const c=st.duplicateLinkedMany([m.id])[0] as THREE.Mesh;
 const lone=st.addPrimitive('cube');
 const outline=st.measure().outline;
 const a=outline.find(e=>e.id===m.id)!,b=outline.find(e=>e.id===c.id)!,d=outline.find(e=>e.id===lone.id)!;
 assert.equal(a.linked,true);assert.equal(a.linkedUsers,2);
 assert.equal(b.linked,true);assert.equal(b.linkedUsers,2);
 assert.equal(d.linked,undefined);assert.equal(d.linkedUsers,undefined);
 st.makeSingleUser(c.id);
 const after=st.measure().outline;
 assert.equal(after.find(e=>e.id===m.id)!.linked,undefined,'single user again: badge gone');
});

test('linked instances round-trip through glTF with a shared mesh',async()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 st.duplicateLinkedMany([m.id]);
 const bin=await new GLTFExporter().parseAsync([...st.root.children],{binary:true,onlyVisible:false}) as ArrayBuffer;
 const g=await new Promise<{scene:THREE.Group}>((res,rej)=>new GLTFLoader().parse(bin,'',res as never,rej));
 const meshes:THREE.Mesh[]=[];g.scene.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
 assert.equal(meshes.length,2);
 assert.equal(meshes[0].geometry,meshes[1].geometry,'the loader re-shares one BufferGeometry for both instances');
});
