import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Stage,exportClone,applyImportOptions,StageError} from './stage';

class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;

test('opening a file is one undo step that restores the old scene and its clips exactly',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');st.rename(cube.id,'OldCube');
 const oldClip=new THREE.AnimationClip('Old',1,[]);st.setClips([oldClip]);
 const before=st.undoLabel;
 // A new file "opens" over the scene, with its clip import inside the same step.
 const g=new THREE.Group();g.name='file';
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name='NewMesh';g.add(mesh);
 st.loadUndoable([g],'Open file',()=>st.setClips([new THREE.AnimationClip('New',2,[])]));
 assert.equal(st.dirty,false,'clean right after the open');
 assert.equal(st.root.children.length,1);assert.equal(st.root.children[0],g);
 assert.deepEqual(st.clips.map(c=>c.name),['New']);
 assert.equal(st.undoLabel,'Open file');
 st.undo();
 assert.equal(st.root.children.length,1);assert.equal(st.root.children[0].name,'OldCube');
 assert.deepEqual(st.clips.map(c=>c.name),['Old']);
 assert.equal(st.dirty,true,'content differs from the file on disk now');
 st.redo();
 assert.equal(st.root.children[0],g);assert.deepEqual(st.clips.map(c=>c.name),['New']);
 assert.equal(st.dirty,false);
 assert.equal(st.find(cube.id),undefined);
 assert.ok(before!==st.undoLabel);
});

test('the content nobody shows any more is disposed when the load entry falls off the history',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.name='NewMesh';
 let disposed=false;mesh.geometry.addEventListener('dispose',()=>{disposed=true;});
 st.loadUndoable([mesh],'Open file');
 st.undo(); // old cube live again, the loaded mesh only exists on the redo side
 st.addPrimitive('sphere'); // truncates the redo side and releases the load entry
 assert.equal(disposed,true);
 assert.equal(st.canRedo,false);
});

test('exportClone keeps only the picked subtrees with their world transforms',()=>{
 const st=new Stage();
 const parent=st.addPrimitive('cube');st.setTransform(parent.id,{position:{x:2,y:0,z:0}});
 const child=st.addPrimitive('sphere');st.reparent([child.id],parent.id);st.setTransform(child.id,{position:{x:0,y:1,z:0}});
 const other=st.addPrimitive('cone');st.setTransform(other.id,{position:{x:-3,y:0,z:1}});
 const g=exportClone(st.root,[child.id,other.id]);
 assert.equal(g.children.length,2);
 const c=g.children.find(o=>o.name===child.name)!;
 assert.deepEqual(c.position.toArray().map(n=>Math.round(n*1e6)/1e6),[2,1,0]);
 const o=g.children.find(o=>o.name===other.name)!;
 assert.deepEqual(o.position.toArray().map(n=>Math.round(n*1e6)/1e6),[-3,0,1]);
 assert.throws(()=>exportClone(st.root,[999]),StageError);
 // Picking parent and child together exports the pair once, under the parent.
 const both=exportClone(st.root,[parent.id,child.id]);
 assert.equal(both.children.length,1);assert.equal(both.children[0].children.length,1);
});

test('a selection-only GLB round trip carries just the picked meshes in place',async()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');st.setTransform(a.id,{position:{x:5,y:0.5,z:-2}});st.setMaterial(a.id,{color:'#2244cc'});
 st.addPrimitive('sphere');
 const g=exportClone(st.root,[a.id]);
 const out=await new GLTFExporter().parseAsync(g,{binary:true}) as ArrayBuffer;
 const back=await new Promise<{scene:THREE.Group}>((res,rej)=>new GLTFLoader().parse(out,'',res as never,rej));
 const meshes:THREE.Mesh[]=[];back.scene.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
 assert.equal(meshes.length,1);assert.equal(meshes[0].name,a.name);
 assert.deepEqual(meshes[0].position.toArray().map(n=>Math.round(n*1e3)/1e3),[5,0.5,-2]);
});

test('applyImportOptions scales file units into metres and reorients Z-up files',()=>{
 const sc=new THREE.Group();applyImportOptions(sc,{unit:'mm',upAxis:'z'});
 assert.ok(Math.abs(sc.scale.x-0.001)<1e-12);
 assert.ok(Math.abs(sc.rotation.x+Math.PI/2)<1e-9);
 const flat=new THREE.Group();applyImportOptions(flat,{unit:'m',upAxis:'y'});
 assert.equal(flat.scale.x,1);assert.equal(flat.rotation.x,0);
});
