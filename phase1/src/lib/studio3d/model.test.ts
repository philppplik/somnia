import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelHeader,modelFormatFor,externalResources,frameDistance,clipPlanes,boundsCenter,boundsSize,boundsRadius,boundsValid,emptyBounds,formatCount,ModelError,MAX_MODEL_BYTES} from './model';
const pad=(b:Uint8Array,fill:number)=>{const n=(b.length+3)&~3;const o=new Uint8Array(n).fill(fill);o.set(b);return o;};
function glb(json:unknown,bin?:Uint8Array,version=2):Uint8Array{
 const j=pad(new TextEncoder().encode(JSON.stringify(json)),0x20);const b=bin?pad(bin,0):null;
 const total=12+8+j.length+(b?8+b.length:0);const out=new Uint8Array(total);const v=new DataView(out.buffer);
 v.setUint32(0,0x46546c67,true);v.setUint32(4,version,true);v.setUint32(8,total,true);
 v.setUint32(12,j.length,true);v.setUint32(16,0x4e4f534a,true);out.set(j,20);
 if(b){const o=20+j.length;v.setUint32(o,b.length,true);v.setUint32(o+4,0x004e4942,true);out.set(b,o+8);}
 return out;
}
test('format follows the suffix, not other extensions',()=>{
 assert.equal(modelFormatFor('a.GLB'),'glb');assert.equal(modelFormatFor('dir/b.gltf'),'gltf');
 assert.equal(modelFormatFor('c.obj'),null);assert.equal(modelFormatFor('noext'),null);
});
test('reads a GLB with JSON and BIN chunks',()=>{
 const h=readModelHeader('m.glb',glb({asset:{version:'2.0'},scenes:[{}]},new Uint8Array([1,2,3,4,5])));
 assert.equal(h.format,'glb');assert.equal(h.version,2);assert.equal((h.json.asset as {version:string}).version,'2.0');assert.equal(h.binLength,8);
});
test('reads a GLB without a BIN chunk and a plain .gltf JSON',()=>{
 assert.equal(readModelHeader('m.glb',glb({asset:{version:'2.0'}})).binLength,0);
 const text=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'a.bin',byteLength:4},{uri:'data:application/octet-stream;base64,AA==',byteLength:1}],images:[{uri:'t.png'}]}));
 const h=readModelHeader('m.gltf',text);assert.equal(h.format,'gltf');
 assert.deepEqual(externalResources(h.json),['a.bin','t.png']);
});
test('rejects damaged and unsupported containers with readable errors',()=>{
 const bad=(name:string,bytes:Uint8Array,re:RegExp)=>assert.throws(()=>readModelHeader(name,bytes),(e:unknown)=>e instanceof ModelError&&re.test(e.message));
 bad('e.glb',new Uint8Array(0),/empty/);
 bad('v1.glb',glb({asset:{version:'2.0'}},undefined,1),/version 1/);
 const trunc=glb({asset:{version:'2.0'}}).slice(0,24);bad('t.glb',trunc,/truncated/);
 bad('x.gltf',new TextEncoder().encode('not json'),/not a glTF/);
 bad('x.gltf',new TextEncoder().encode('[1,2]'),/not a glTF/);
 bad('x.gltf',new TextEncoder().encode('{"asset":{"version":"1.0"}}'),/glTF 1\.0/);
 bad('x.gltf',new TextEncoder().encode('{}'),/no glTF asset/);
 bad('x.gltf',new Uint8Array([0xff,0xfe,0xfd]),/not a glTF/);
 const lie=glb({asset:{version:'2.0'}});new DataView(lie.buffer).setUint32(12,9999,true);bad('l.glb',lie,/damaged chunk/);
 assert.ok(MAX_MODEL_BYTES>1e6);
});
test('a GLB survives being a subarray of a larger buffer',()=>{
 const g=glb({asset:{version:'2.0'}},new Uint8Array(8));const big=new Uint8Array(g.length+10);big.set(g,6);
 const h=readModelHeader('s.glb',big.subarray(6,6+g.length));assert.equal(h.format,'glb');assert.equal(h.binOffset,6+g.length-8);
});
test('bounds helpers',()=>{
 const b={min:[-1,0,-2] as [number,number,number],max:[1,2,2] as [number,number,number]};
 assert.deepEqual(boundsCenter(b),[0,1,0]);assert.deepEqual(boundsSize(b),[2,2,4]);
 assert.ok(Math.abs(boundsRadius(b)-Math.hypot(2,2,4)/2)<1e-9);assert.equal(boundsValid(b),true);assert.equal(boundsValid(emptyBounds()),false);
});
test('frame distance fits the sphere and respects narrow aspect ratios',()=>{
 const wide=frameDistance(1,45,2),narrow=frameDistance(1,45,0.5);
 assert.ok(narrow>wide);
 const r=1,v=45*Math.PI/180;assert.ok(Math.abs(wide-(r*1.15)/Math.sin(v/2))<1e-9);
 assert.equal(frameDistance(0,45,1),3);assert.equal(frameDistance(1,45,0),3);assert.equal(frameDistance(NaN,45,1),3);
});
test('clip planes scale with the model and always order near before far',()=>{
 for(const r of [1e-3,1,1e3,1e6]){const d=frameDistance(r,45,1.5);const {near,far}=clipPlanes(d,r);assert.ok(near>0&&near<far,String(r));assert.ok(far>d+r);}
});
test('counts format compactly',()=>{assert.equal(formatCount(999),'999');assert.equal(formatCount(12345),'12.3 k');assert.equal(formatCount(250000),'250 k');assert.equal(formatCount(1_500_000),'1.5 M');});
