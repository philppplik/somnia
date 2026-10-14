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
test('the scene exports as glTF 2.0 JSON and its primitives stay editable after reading it back',async()=>{
 const stage=new Stage();const m=stage.addPrimitive('torus');stage.setPrimitive(m.id,{radius:1.5,tubularSegments:20});stage.setMaterial(m.id,{preset:'copper'});
 const out=await new GLTFExporter().parseAsync([...stage.root.children],{binary:false,onlyVisible:false}) as {asset:{version:string};buffers:{uri:string}[];nodes:unknown[]};
 assert.equal(out.asset.version,'2.0');assert.ok(out.buffers[0].uri.startsWith('data:'),'buffers are embedded, nothing external');
 const text=JSON.stringify(out);assert.ok(!/"uri":"(?!data:)/.test(text),'no external references');
 const g=await new Promise<{scene:import('three').Group}>((res,rej)=>new GLTFLoader().parse(text,'',res as never,rej));
 const back=g.scene.children[0];const prim=stage.primitiveOf(back);
 assert.equal(prim?.kind,'torus');assert.equal(prim?.params.radius,1.5);assert.equal(prim?.params.tubularSegments,20);
});

/** A two-bone skinned box with a Wave clip, authored in the stage and exported the way the viewport does. */
const skinnedStage=()=>{
 const geo=new THREE.BoxGeometry(1,2,1);
 const count=geo.getAttribute('position').count;const si=new Uint16Array(count*4),sw=new Float32Array(count*4);
 for(let i=0;i<count;i++){si[i*4]=i%2;sw[i*4]=1;}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial());mesh.name='Body';mesh.add(hip);
 mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([hip,knee]));
 const st=new Stage();st.loadMany([mesh]);
 return{st,mesh,knee:st.find(st.bones()[1].id) as THREE.Bone};
};
const exportGlb=(st:Stage,animations:import('three').AnimationClip[])=>{
 const e=new GLTFExporter();e.register(st.exporterPlugin() as never);
 return e.parseAsync(st.exportScene() as never,{binary:true,animations,onlyVisible:false}) as Promise<ArrayBuffer>;
};
const importGlb=(buf:ArrayBuffer)=>new Promise<{scene:import('three').Group;animations:import('three').AnimationClip[]}>((res,rej)=>new GLTFLoader().parse(buf,'',res as never,rej));
test('a binary GLB round trip keeps the skeleton, the skin, the clip and the material scalars',async()=>{
 const {st,mesh,knee}=skinnedStage();
 st.setMaterial(mesh.id,{color:'#3366cc',metalness:0.7,roughness:0.2,emissive:'#112233',emissiveIntensity:1.5});
 const clip=st.addClip('Wave',1);
 st.setKey(clip,knee.id,'rotation',0,{y:0});st.setKey(clip,knee.id,'rotation',1,{y:90});
 const glb=await exportGlb(st,st.exportClips());
 assert.equal(new DataView(glb).getUint32(0,true),0x46546c67,'real binary glTF');
 const back=await importGlb(glb);
 let skinned:import('three').SkinnedMesh|undefined;
 back.scene.traverse(o=>{if((o as import('three').SkinnedMesh).isSkinnedMesh)skinned=o as import('three').SkinnedMesh;});
 assert.ok(skinned,'a SkinnedMesh comes back');
 assert.deepEqual(skinned.skeleton.bones.map(b=>b.name),['Hip','Knee']);
 assert.equal(back.animations.length,1);
 assert.equal(back.animations[0].name,'Wave');
 assert.ok(Math.abs(back.animations[0].duration-1)<1e-3);
 assert.ok(back.animations[0].tracks.length>=1,'the rotation track survives');
 const mat=skinned.material as import('three').MeshStandardMaterial;
 assert.equal(mat.color.getHexString(),'3366cc');assert.ok(Math.abs(mat.metalness-0.7)<1e-3);assert.ok(Math.abs(mat.roughness-0.2)<1e-3);
 assert.equal(mat.emissive.getHexString(),'112233');assert.ok(Math.abs(mat.emissiveIntensity-1.5)<1e-2);
});
test('positions, rotations and scale survive a round trip unchanged (glTF is metres, Y-up, no conversion)',async()=>{
 const st=new Stage();const m=st.addPrimitive('cube');
 st.setTransform(m.id,{position:{x:1.25,y:2.5,z:-3.75},rotation:{y:30},scale:{x:2,y:1,z:0.5}});
 const back=await importGlb(await exportGlb(st,st.exportClips()));
 const cube=back.scene.getObjectByName('Cube')!;
 assert.ok(cube,'the named node survives');
 assert.ok(Math.abs(cube.position.x-1.25)<1e-4&&Math.abs(cube.position.y-2.5)<1e-4&&Math.abs(cube.position.z+3.75)<1e-4,'position is unchanged');
 assert.ok(Math.abs(cube.scale.x-2)<1e-4&&Math.abs(cube.scale.z-0.5)<1e-4,'scale is unchanged');
 const e=new THREE.Euler().setFromQuaternion(cube.quaternion,'XYZ');
 assert.ok(Math.abs(THREE.MathUtils.radToDeg(e.y)-30)<0.01,'rotation about Y is unchanged');
});
