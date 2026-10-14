import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {readPin} from './pins';
class NFR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
 readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
 readAsDataURL(b:Blob){void b.arrayBuffer().then(()=>{this.result='data:;base64,x';this.onloadend?.();},()=>this.onerror?.());}}
(globalThis as unknown as {FileReader:unknown}).FileReader??=NFR;
(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
test('a pin lands at the given point, sizes to the scene and undoes in one step',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const pin=st.addPin({x:1,y:2,z:3});
 assert.deepEqual([pin.position.x,pin.position.y,pin.position.z],[1,2,3]);
 assert.equal(readPin(pin.userData),'');
 assert.ok(pin.name.startsWith('Pin'));
 st.undo();assert.equal(st.find(pin.id),undefined);
 st.redo();assert.equal(st.find(pin.id),pin);
});
test('a pin without a point floats above the bounds centre',()=>{
 const st=new Stage();
 st.addPrimitive('cube');st.setTransform(st.addPrimitive('cube').id,{position:{x:4,y:0,z:0}});
 const pin=st.addPin();
 assert.ok(pin.position.y>0.5,'above the centre');
 assert.ok(pin.position.x>0&&pin.position.x<4,'over the content');
});
test('setPinText edits, validates, undoes and redoes; non-pins are refused',()=>{
 const st=new Stage();
 const pin=st.addPin();
 st.setPinText(pin.id,'  loose   bolt ');
 assert.equal(readPin(pin.userData),'loose bolt');
 assert.equal(st.measure().outline.find(o=>o.id===pin.id)?.kind,'pin');
 assert.equal(st.info(pin.id)?.pin,'loose bolt');
 st.undo();assert.equal(readPin(pin.userData),'');
 st.redo();assert.equal(readPin(pin.userData),'loose bolt');
 const cube=st.addPrimitive('cube');
 assert.throws(()=>st.setPinText(cube.id,'x'),/not a pin/);
 assert.equal(st.info(cube.id)?.pin,null);
 assert.equal(st.measure().outline.find(o=>o.id===cube.id)?.kind,'mesh');
});
test('pins survive a glTF export and import round-trip',async()=>{
 const{GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 const{GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const st=new Stage();
 const pin=st.addPin({x:0.5,y:1.2,z:0});st.setPinText(pin.id,'weld seam');
 const glb=await new GLTFExporter().parseAsync(st.root,{binary:true}) as ArrayBuffer;
 const loaded=await new GLTFLoader().parseAsync(glb.slice(0),'');
 let found:string|null=null;loaded.scene.traverse(o=>{const t=readPin(o.userData);if(t!==null)found=t;});
 assert.equal(found,'weld seam');
});

test('pins() lists labeled pins with their world position and skips empty or hidden ones',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const a=st.addPin({x:1,y:2,z:3});st.setPinText(a.id,'anchor');
 const empty=st.addPin({x:9,y:9,z:9});
 const hidden=st.addPin({x:5,y:5,z:5});st.setPinText(hidden.id,'gone');st.setHidden(hidden.id,true);
 const list=st.pins();
 assert.equal(list.length,1);
 assert.equal(list[0]!.id,a.id);
 assert.equal(list[0]!.text,'anchor');
 assert.deepEqual(list[0]!.position,{x:1,y:2,z:3});
 assert.ok(!list.some(p=>p.id===empty.id));
 st.setHidden(hidden.id,false);
 assert.equal(st.pins().length,2);
 st.setPinText(a.id,'');
 assert.equal(st.pins().length,1);
});
test('pins() reports the world position inside a moved group',()=>{
 const st=new Stage();
 const pin=st.addPin({x:1,y:0,z:0});st.setPinText(pin.id,'in group');
 const cube=st.addPrimitive('cube');
 const grp=st.group([pin.id,cube.id]);
 st.setTransform(grp.id,{position:{x:10,y:0,z:0}});
 const p=st.pins().find(p=>p.id===pin.id);
 assert.ok(p);
 assert.ok(p!.position.x>10,`world x ${p!.position.x} follows the moved group`);
});

test('historyLabels lists undo newest-first and redo next-up first',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 st.rename(a.id,'box');
 st.setTransform(a.id,{position:{x:1,y:0,z:0}});
 const h=st.historyLabels();
 assert.equal(h.undo.length,3);
 assert.equal(h.redo.length,0);
 assert.equal(h.undo[0],st.undoLabel);
 st.undo();
 const h2=st.historyLabels();
 assert.equal(h2.undo.length,2);
 assert.equal(h2.redo.length,1);
 assert.equal(h2.redo[0],h.undo[0]);
 st.redo();
 assert.equal(st.historyLabels().redo.length,0);
});
