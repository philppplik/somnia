import test from 'node:test';
import assert from 'node:assert/strict';
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
