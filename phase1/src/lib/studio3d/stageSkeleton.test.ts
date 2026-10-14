import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Stage} from './stage';
import {ClipError} from './clips';
class NodeFileReader{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:${b.type||'application/octet-stream'};base64,${Buffer.from((r as ArrayBuffer)).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NodeFileReader;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
/** A two-bone skinned box: root joint at the origin, child joint at y=1. */
const skinned=()=>{
 const geo=new THREE.BoxGeometry(1,2,1);
 const count=geo.getAttribute('position').count;const si=new Uint16Array(count*4),sw=new Float32Array(count*4);
 for(let i=0;i<count;i++){si[i*4]=i%2;sw[i*4]=1;}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial());mesh.name='Body';mesh.add(hip);mesh.bind(new THREE.Skeleton([hip,knee]));
 const st=new Stage();st.loadMany([mesh]);
 const bones=st.bones();return{st,mesh,hip:st.find(bones[0].id) as THREE.Bone,knee:st.find(bones[1].id) as THREE.Bone,bones};
};
test('bones are listed with names and depth, and info reports the bone kind',()=>{
 const {st,hip,knee,bones}=skinned();
 assert.deepEqual(bones.map(b=>[b.name,b.depth]),[['Hip',0],['Knee',1]]);
 assert.equal(st.info(hip.id)!.kind,'bone');assert.equal(st.info(knee.id)!.kind,'bone');
 assert.equal(st.isBone(hip.id),true);assert.equal(st.isBone(st.root.id),false);
});
test('the outline leaves bones out and the stats count them',()=>{
 const {st}=skinned();const m=st.measure();
 assert.equal(m.stats.bones,2);
 assert.ok(m.outline.some(o=>o.kind==='mesh'&&o.name==='Body'));
 assert.ok(!m.outline.some(o=>o.kind==='bone'));
});
test('rotation keys can be authored on a bone; other paths are refused',()=>{
 const {st,knee}=skinned();const c=st.addClip('Bend',2);
 st.setKey(c,knee.id,'rotation',0);st.setKey(c,knee.id,'rotation',1,{z:45});
 const k=st.keysOf(c,knee.id);assert.equal(k.length,1);assert.deepEqual(k[0].times,[0,1]);
 assert.throws(()=>st.setKey(c,knee.id,'position',0.5),/rotation keys only/);
 assert.throws(()=>st.setKey(c,knee.id,'scale',0.5),/rotation keys only/);
 assert.throws(()=>st.moveKey(c,knee.id,'position',0,1),/rotation keys only/);
 assert.throws(()=>st.removeKey(c,knee.id,'scale',0),/rotation keys only/);
 assert.throws(()=>st.setKeyEase(c,knee.id,'position',0,'step'),/rotation keys only/);
 assert.throws(()=>st.copyKeys(c,knee.id,[{path:'position',time:0}]),/rotation keys only/);
 assert.throws(()=>st.shiftKeys(c,knee.id,[{path:'scale',time:0}],1),/rotation keys only/);
 assert.throws(()=>st.pasteKeys(c,knee.id,[{path:'position',time:0,value:[0,0,0],ease:'linear'}],0),/rotation keys only/);
 // Moving, easing, copying and shifting rotation keys works like on any node.
 st.moveKey(c,knee.id,'rotation',1,1.5);assert.deepEqual(st.keysOf(c,knee.id)[0].times,[0,1.5]);
 st.setKeyEase(c,knee.id,'rotation',0,'easeInOut');assert.equal(st.keysOf(c,knee.id)[0].eases[0],'easeInOut');
 const clip=st.copyKeys(c,knee.id,[{path:'rotation',time:0},{path:'rotation',time:1.5}]);
 assert.equal(clip.length,2);assert.equal(clip[0].value.length,4);
 assert.throws(()=>st.setKey(c,knee.id,'position',0),ClipError);
});
test('bones cannot be deleted or duplicated, but rename works',()=>{
 const {st,hip}=skinned();
 assert.throws(()=>st.remove(hip.id),/cannot be deleted/);
 assert.throws(()=>st.duplicate(hip.id),/cannot be duplicated/);
 st.rename(hip.id,'Pelvis');assert.equal(hip.name,'Pelvis');assert.equal(st.bones()[0].name,'Pelvis');
});
test('a skinned mesh with bone rotation keys survives GLB export and reopen, with easing in the extras',async()=>{
 const {st,knee}=skinned();const c=st.addClip('Bend',3);
 st.setKey(c,knee.id,'rotation',0);st.setKey(c,knee.id,'rotation',1,{z:90});st.setKeyEase(c,knee.id,'rotation',0,'easeOut');
 const ex=new GLTFExporter();ex.register(st.exporterPlugin() as never);
 const out=await ex.parseAsync(st.exportScene(),{binary:false,onlyVisible:false,animations:st.exportClips()}) as {skins?:{joints:number[]}[];animations:{extras?:unknown}[]};
 assert.equal(out.skins!.length,1);assert.equal(out.skins![0].joints.length,2);
 const g=await new Promise<{scene:THREE.Group;animations:THREE.AnimationClip[];parser:{json:{animations:{extras?:unknown}[]};getDependency(t:string,i:number):Promise<THREE.Object3D>}}>((res,rej)=>new GLTFLoader().parse(JSON.stringify(out),'',res as never,rej));
 const skinnedMesh=g.scene.getObjectByProperty('isSkinnedMesh',true) as THREE.SkinnedMesh|undefined;
 assert.ok(skinnedMesh,'the reopened file still has a skinned mesh');
 const {parseExtras}=await import('./clipMeta');const metas=g.parser.json.animations.map(a=>parseExtras(a.extras));
 const nodes=new Map<number,THREE.Object3D>();for(const mt of metas[0]!.tracks)nodes.set(mt.node,await g.parser.getDependency('node',mt.node));
 const st2=new Stage();st2.loadMany([...g.scene.children]);st2.setClips(g.animations,metas,i=>nodes.get(i));
 const bones2=st2.bones();assert.deepEqual(bones2.map(b=>b.name),['Hip','Knee']);
 const k=st2.keysOf(0,bones2[1].id);assert.equal(k.length,1);assert.equal(k[0].path,'rotation');
 assert.deepEqual(k[0].times,[0,1]);assert.deepEqual(k[0].eases,['easeOut','linear']);assert.equal(st2.clips[0].duration,3);
});
