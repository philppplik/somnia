import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
class NFR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(()=>{this.result='data:;base64,x';this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NFR;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
test('the three-point rig adds key, fill and rim aimed at the scene, one undo step',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');st.setTransform(cube.id,{position:{x:4,y:0,z:0}});
 const lights=st.addLightRig();
 assert.equal(lights.length,3);
 const[key,fill,rim]=lights;
 assert.equal(key.name,'Key light');assert.equal(fill.name,'Fill light');assert.equal(rim.name,'Rim light');
 assert.equal(key.castShadow,true,'the key light casts shadows');
 assert.equal(fill.castShadow,false);assert.equal(rim.castShadow,false);
 assert.ok(key.intensity>fill.intensity,'the key is the strongest');
 // Every light sits on the stage with its target, aimed at the bounds centre (the cube at x=4).
 let nodes=0;st.root.traverse(()=>{nodes++;});
 assert.equal(nodes,8,'root + cube + 3 lights + 3 targets');
 for(const l of lights){assert.ok(Math.abs(l.target.position.x-4)<1e-6,'target on the bounds centre');assert.ok(l.target.parent===st.root,'the target is in the scene so the direction holds');}
 assert.ok(key.position.x>4&&key.position.y>0,'key front-right-top of the subject');
 assert.ok(fill.position.x<4&&fill.position.z>0,'fill from the other side');
 assert.ok(rim.position.z<0,'rim from behind');
 st.undo();nodes=0;st.root.traverse(()=>{nodes++;});assert.equal(nodes,2,'one undo removes the whole rig (root and cube stay)');
 st.redo();nodes=0;st.root.traverse(()=>{nodes++;});assert.equal(nodes,8,'redo restores it');
});
test('the rig falls back to the origin on an empty scene and names stay unique',()=>{
 const st=new Stage();
 const a=st.addLightRig();const b=st.addLightRig();
 assert.ok(Math.abs(a[0].target.position.x)<1e-6&&Math.abs(a[0].target.position.y-0.5)<1e-6,'fallback centre');
 assert.notEqual(a[0].name,b[0].name,'second rig gets unique names');
 st.undo();st.undo();
 let lights=0;st.root.traverse(o=>{if((o as THREE.Light).isLight)lights++;});
 assert.equal(lights,0);
});
