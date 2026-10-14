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
test('moving a key keeps its value and easing, keeps the order, extends the clip, and is one undo step',()=>{
 const {st,m}=setup();const c=st.addClip('A',2);
 st.setKey(c,m.id,'position',0,{y:0});st.setKey(c,m.id,'position',1,{y:4});st.setKey(c,m.id,'position',2,{y:8});st.setKeyEase(c,m.id,'position',1,'easeOut');
 st.moveKey(c,m.id,'position',1,1.5);let k=st.keysOf(c,m.id)[0];assert.deepEqual(k.times,[0,1.5,2]);assert.deepEqual(k.eases,['linear','easeOut','linear']);assert.equal(st.clips[c].tracks[0].values[4],4);
 st.moveKey(c,m.id,'position',0,3);k=st.keysOf(c,m.id)[0];assert.deepEqual(k.times,[1.5,2,3]);assert.deepEqual(k.eases,['easeOut','linear','linear']);assert.equal(st.clips[c].duration,3);
 st.undo();assert.deepEqual(st.keysOf(c,m.id)[0].times,[0,1.5,2]);assert.equal(st.clips[c].duration,2);st.undo();assert.deepEqual(st.keysOf(c,m.id)[0].times,[0,1,2]);
 assert.throws(()=>st.moveKey(c,m.id,'position',0,1),/already a key/);assert.throws(()=>st.moveKey(c,m.id,'position',0.5,1.2),/no key/);
 st.moveKey(c,m.id,'position',2,2);assert.equal(st.keysOf(c,m.id)[0].times.length,3);
});
test('easing is stored per key, validated, undoable, and survives adding and removing other keys',()=>{
 const {st,m}=setup();const c=st.addClip('A',2);
 st.setKey(c,m.id,'scale',0);st.setKey(c,m.id,'scale',2);st.setKeyEase(c,m.id,'scale',0,'step');
 st.setKey(c,m.id,'scale',1);assert.deepEqual(st.keysOf(c,m.id)[0].eases,['step','linear','linear']);
 st.removeKey(c,m.id,'scale',1);assert.deepEqual(st.keysOf(c,m.id)[0].eases,['step','linear']);st.undo();assert.deepEqual(st.keysOf(c,m.id)[0].eases,['step','linear','linear']);
 st.setKeyEase(c,m.id,'scale',2,'easeInOut');st.undo();assert.equal(st.keysOf(c,m.id)[0].eases[2],'linear');
 assert.throws(()=>st.setKeyEase(c,m.id,'scale',0,'bounce' as never),ClipError);assert.throws(()=>st.setKeyEase(c,m.id,'scale',1.7,'step'),/no key/);
});
test('playing and exporting use baked samples; the stored keys stay as authored',()=>{
 const {st,m}=setup();const c=st.addClip('A',1);st.setKey(c,m.id,'position',0,{y:0});st.setKey(c,m.id,'position',1,{y:8});
 assert.equal(st.playableClip(c)!.tracks[0].times.length,2);
 st.setKeyEase(c,m.id,'position',0,'easeIn');const p=st.playableClip(c)!.tracks[0];assert.ok(p.times.length>2);assert.equal(st.clips[c].tracks[0].times.length,2);
 const mid=p.values[(p.times.length>>1)*3+1];assert.ok(mid<4);assert.equal(st.playableClip(c),st.playableClip(c),'cached until the clips change');
});
test('auto-key records the change at the chosen time inside the same undo step, drags merge, nothing happens when off',()=>{
 const {st,m}=setup();const c=st.addClip('A',2);let src:{clip:number;time:number}|null=null;st.autoKeySource=()=>src;
 st.setTransform(m.id,{position:{x:1,y:0,z:0}});assert.equal(st.clips[c].tracks.length,0);
 src={clip:c,time:0.5};st.setTransform(m.id,{position:{x:2,y:0,z:0}});
 let k=st.keysOf(c,m.id);assert.deepEqual(k.map(x=>x.path),['position']);assert.deepEqual(k[0].times,[0.5]);assert.equal(st.clips[c].tracks[0].values[0],2);
 st.setTransform(m.id,{rotation:{x:0,y:90,z:0},scale:{x:2,y:2,z:2}});assert.deepEqual(st.keysOf(c,m.id).map(x=>x.path).sort(),['position','rotation','scale']);
 st.undo();assert.deepEqual(st.keysOf(c,m.id).map(x=>x.path),['position']);assert.equal(m.scale.x,1);
 st.undo();assert.equal(st.keysOf(c,m.id).length,0);assert.equal(m.position.x,1);st.redo();st.redo();assert.equal(st.keysOf(c,m.id).length,3);
 const before=m.position.clone();const b={p:before,r:m.rotation.clone(),s:m.scale.clone()};
 st.setTransform(m.id,{position:{x:5,y:0,z:0}},{group:'drag',now:1000});st.setTransform(m.id,{position:{x:6,y:0,z:0}},{group:'drag',now:1100});
 assert.equal(st.clips[c].tracks.find(t=>t.name.endsWith('.position'))!.values[0],6);st.undo();assert.equal(m.position.x,2);assert.equal(st.clips[c].tracks.find(t=>t.name.endsWith('.position'))!.values[0],2);void b;
});
test('clip length and easing survive glTF export and import through the animation extras',async()=>{
 const {st,m}=setup();const c=st.addClip('Hop',5);
 st.setKey(c,m.id,'position',0,{y:0});st.setKey(c,m.id,'position',1,{y:4});st.setKey(c,m.id,'position',2,{y:0});st.setKeyEase(c,m.id,'position',0,'easeOut');st.setKeyEase(c,m.id,'position',1,'step');
 const ex=new GLTFExporter();ex.register(st.exporterPlugin() as never);
 const out=await ex.parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:st.exportClips()}) as {animations:{extras?:{somnia?:{duration:number}}}[]};
 assert.equal(out.animations[0].extras!.somnia!.duration,5);
 const g=await new Promise<{scene:THREE.Group;animations:THREE.AnimationClip[];parser:{json:{animations:{extras?:unknown}[]};getDependency(t:string,i:number):Promise<THREE.Object3D>}}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 assert.ok(g.animations[0].tracks[0].times.length>3,'the file holds baked samples any viewer can play');
 const {parseExtras}=await import('./clipMeta');const metas=g.parser.json.animations.map(a=>parseExtras(a.extras));
 const nodes=new Map<number,THREE.Object3D>();for(const mt of metas[0]!.tracks)nodes.set(mt.node,await g.parser.getDependency('node',mt.node));
 const st2=new Stage();st2.loadMany([...g.scene.children]);st2.setClips(g.animations,metas,i=>nodes.get(i));
 const n=st2.root.children[0];const k=st2.keysOf(0,n.id)[0];
 assert.deepEqual(k.times,[0,1,2]);assert.deepEqual(k.eases,['easeOut','step','linear']);assert.equal(st2.clips[0].duration,5);
});
test('a file without our extras keeps its baked keys and ends at its last key',async()=>{
 const {st,m}=setup();const c=st.addClip('Hop',5);st.setKey(c,m.id,'position',0,{y:0});st.setKey(c,m.id,'position',1,{y:4});
 const out=await new GLTFExporter().parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:st.exportClips()});
 const g=await new Promise<{scene:THREE.Group;animations:THREE.AnimationClip[]}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 const st2=new Stage();st2.loadMany([...g.scene.children]);st2.setClips(g.animations);assert.equal(st2.clips[0].duration,1);
});
test('duplicateClip copies tracks, duration and easing and is one undo step',()=>{
 const {st,m}=setup();const c=st.addClip('Walk',3);
 st.setKey(c,m.id,'position',0);st.setKey(c,m.id,'position',1);st.setKeyEase(c,m.id,'position',0,'easeIn');
 const d=st.duplicateClip(c);
 assert.equal(st.clips.length,2);assert.equal(d,1);
 assert.equal(st.clips[d].name,'Walk copy');assert.equal(st.clips[d].duration,3);
 assert.deepEqual(st.keysOf(d,m.id)[0].times,[0,1]);assert.deepEqual(st.keysOf(d,m.id)[0].eases,['easeIn','linear']);
 st.setKey(d,m.id,'position',2);assert.deepEqual(st.keysOf(c,m.id)[0].times,[0,1]);
 assert.equal(st.undo(),true);assert.equal(st.clips.length,2);
 assert.equal(st.undo(),true);assert.equal(st.clips.length,1);
 assert.equal(st.redo(),true);assert.equal(st.clips.length,2);assert.equal(st.clips[1].name,'Walk copy');
});
test('shiftKeys moves a multi-path selection as one undo step',()=>{
 const {st,m}=setup();const c=st.addClip('Both',4);
 st.setKey(c,m.id,'position',0);st.setKey(c,m.id,'position',1);st.setKey(c,m.id,'scale',1);
 st.setKeyEase(c,m.id,'position',0,'step');
 const n=st.shiftKeys(c,m.id,[{path:'position',time:1},{path:'scale',time:1}],0.5);
 assert.equal(n,2);
 assert.deepEqual(st.keysOf(c,m.id).find(k=>k.path==='position')!.times,[0,1.5]);
 assert.deepEqual(st.keysOf(c,m.id).find(k=>k.path==='position')!.eases,['step','linear']);
 assert.deepEqual(st.keysOf(c,m.id).find(k=>k.path==='scale')!.times,[1.5]);
 assert.equal(st.undo(),true);
 assert.deepEqual(st.keysOf(c,m.id).find(k=>k.path==='position')!.times,[0,1]);
 assert.deepEqual(st.keysOf(c,m.id).find(k=>k.path==='scale')!.times,[1]);
});
test('shiftKeys refuses collisions with keys that stay',()=>{
 const {st,m}=setup();const c=st.addClip('Hit',4);
 st.setKey(c,m.id,'position',0);st.setKey(c,m.id,'position',1);
 assert.throws(()=>st.shiftKeys(c,m.id,[{path:'position',time:0}],1),/land on another key/);
 assert.deepEqual(st.keysOf(c,m.id)[0].times,[0,1]);
});
test('copyKeys and pasteKeys move keys with easing across times, one undo step',()=>{
 const {st,m}=setup();const c=st.addClip('Copy',6);
 st.setKey(c,m.id,'position',0);st.setKey(c,m.id,'position',1,{x:4});st.setKeyEase(c,m.id,'position',0,'easeOut');
 const clip=st.copyKeys(c,m.id,[{path:'position',time:0},{path:'position',time:1}]);
 assert.equal(clip.length,2);assert.equal(clip[1].value[0],4);assert.equal(clip[0].ease,'easeOut');
 const n=st.pasteKeys(c,m.id,clip,3);
 assert.equal(n,2);
 const k=st.keysOf(c,m.id)[0];assert.deepEqual(k.times,[0,1,3,4]);assert.deepEqual(k.eases,['easeOut','linear','easeOut','linear']);
 assert.equal(st.undo(),true);assert.deepEqual(st.keysOf(c,m.id)[0].times,[0,1]);
 assert.throws(()=>st.pasteKeys(c,m.id,[],0),/Copy keys first/);
});
