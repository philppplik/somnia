import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Stage} from './stage';
import {ClipError} from './clips';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
const setup=()=>{const st=new Stage();const m=st.addPrimitive('cube');st.rename?.(m.id,'My Cube.1');return{st,m};};
test('a key records the current transform, replaces at the same time and sorts by time',()=>{
 const {st,m}=setup();const c=st.addClip('Move',2);
 st.setKey(c,m.id,'position',1);st.setTransform(m.id,{position:{x:5,y:0,z:0}});st.setKey(c,m.id,'position',0);st.setKey(c,m.id,'position',1,{x:9});
 const k=st.keysOf(c,m.id);assert.equal(k.length,1);assert.deepEqual(k[0].times,[0,1]);
 const tr=st.clips[c].tracks[0];assert.equal(tr.values[0],5);assert.equal(tr.values[3],9);assert.equal(tr.name,`${m.uuid}.position`);
});
test('rotation keys take degrees and store a quaternion; keys past the end extend the clip',()=>{
 const {st,m}=setup();const c=st.addClip('Spin',1);st.setKey(c,m.id,'rotation',3,{y:180});
 assert.equal(st.clips[c].duration,3);const t=st.clips[c].tracks[0];assert.equal(t.values.length,4);assert.ok(Math.abs(t.values[1]-1)<1e-9);assert.equal(t.name,`${m.uuid}.quaternion`);
});
test('clip edits are single undo steps and mark the scene changed',()=>{
 const {st,m}=setup();st.markSaved();const c=st.addClip('A');assert.equal(st.dirty,true);
 st.setKey(c,m.id,'scale',0.5);assert.equal(st.clips[c].tracks.length,1);st.undo();assert.equal(st.clips[c].tracks.length,0);assert.equal(st.clips[c].duration,2);st.redo();assert.equal(st.clips[c].tracks.length,1);
 st.removeKey(c,m.id,'scale',0.5);assert.equal(st.clips[c].tracks.length,0);st.undo();assert.equal(st.clips[c].tracks.length,1);
 st.undo();st.undo();assert.equal(st.clips.length,0);st.redo();assert.equal(st.clips.length,1);
});
test('clips can be renamed, resized (not before the last key) and deleted, with undo',()=>{
 const {st,m}=setup();const c=st.addClip('A',2);const d=st.addClip('A',2);assert.equal(st.clips[d].name,'A 2');
 st.setKey(c,m.id,'position',1.5);assert.throws(()=>st.setClipDuration(c,1),ClipError);st.setClipDuration(c,4);assert.equal(st.clips[c].duration,4);st.undo();assert.equal(st.clips[c].duration,2);
 st.renameClip(c,'Walk');assert.equal(st.clips[c].name,'Walk');st.undo();assert.equal(st.clips[c].name,'A');
 st.removeClip(d);assert.equal(st.clips.length,1);st.undo();assert.equal(st.clips.length,2);
});
test('bad input is refused with a readable error and changes nothing',()=>{
 const {st,m}=setup();const c=st.addClip();
 assert.throws(()=>st.setKey(9,m.id,'position',0),ClipError);assert.throws(()=>st.setKey(c,m.id,'position',-1),ClipError);assert.throws(()=>st.setKey(c,m.id,'bogus' as never,0),ClipError);
 assert.throws(()=>st.setKey(c,st.root.id,'position',0),ClipError);assert.throws(()=>st.removeKey(c,m.id,'position',0),ClipError);assert.throws(()=>st.addClip('',2),ClipError);assert.throws(()=>st.addClip('x',0),ClipError);
 assert.equal(st.canUndo,true);st.undo();assert.equal(st.clips.length,0);
});
test('a cubic spline track cannot be edited key by key',()=>{
 const {st,m}=setup();const clip=new THREE.AnimationClip('C',1,[new THREE.VectorKeyframeTrack(`${m.name.replace(/[ .]/g,'_')}.position`,[0,1],new Array(18).fill(0))]);
 st.setClips([clip]);// not canonicalised: the name does not match a node, so it is left alone
 const odd=new THREE.VectorKeyframeTrack(`${m.uuid}.position`,[0,1],new Array(18).fill(0));st.setClips([new THREE.AnimationClip('C',1,[odd])]);
 assert.equal(st.keysOf(0,m.id)[0].editable,false);assert.throws(()=>st.setKey(0,m.id,'position',0.5),/cubic/);
});
test('imported clips are re-targeted to node uuids and deleted nodes are left out of the export',()=>{
 const {st,m}=setup();st.rename(m.id,'Hero');
 st.setClips([new THREE.AnimationClip('Run',1,[new THREE.VectorKeyframeTrack('Hero.position',[0,1],[0,0,0,1,1,1]),new THREE.VectorKeyframeTrack('Gone.position',[0,1],[0,0,0,1,1,1])])]);
 assert.equal(st.clips[0].tracks[0].name,`${m.uuid}.position`);assert.equal(st.clips[0].tracks[1].name,'Gone.position');
 assert.equal(st.exportClips()[0].tracks.length,1);st.remove(m.id);assert.equal(st.exportClips().length,0);
});
test('clips survive a glTF export and import, with names that contain spaces and dots',async()=>{
 const {st,m}=setup();const c=st.addClip('Hop',2);
 st.setKey(c,m.id,'position',0);st.setTransform(m.id,{position:{x:0,y:3,z:0}});st.setKey(c,m.id,'position',1);st.setKey(c,m.id,'rotation',2,{x:90});st.setKey(c,m.id,'scale',2);
 const out=await new GLTFExporter().parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:st.exportClips()}) as {animations:{name:string;channels:unknown[]}[];scenes:{nodes:number[]}[]};
 assert.equal(out.animations.length,1);assert.equal(out.animations[0].name,'Hop');assert.equal(out.animations[0].channels.length,3);assert.equal(out.scenes[0].nodes.length,1);
 const g=await new Promise<{scene:THREE.Group;animations:THREE.AnimationClip[]}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 const st2=new Stage();st2.loadMany([...g.scene.children]);st2.setClips(g.animations);
 const node=st2.root.children[0];const keys=st2.keysOf(0,node.id);
 assert.deepEqual(keys.map(k=>k.path),['position','rotation','scale']);assert.deepEqual(keys[0].times,[0,1]);assert.deepEqual(keys[1].times,[2]);assert.equal(st2.clips[0].name,'Hop');
});
