import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGlb} from './glbValidate';

const pad4=(u:Uint8Array,fill:number)=>{const n=(4-(u.length%4))%4;if(!n)return u;const o=new Uint8Array(u.length+n);o.set(u);o.fill(fill,u.length);return o;};
/** Minimal GLB assembler for tests: JSON chunk plus an optional BIN chunk. */
function glb(json:object,bin?:Uint8Array):Uint8Array{
 const js=pad4(new TextEncoder().encode(JSON.stringify(json)),0x20);
 const bb=bin?pad4(bin,0):null;
 const total=12+8+js.length+(bb?8+bb.length:0);
 const out=new Uint8Array(total);const dv=new DataView(out.buffer);
 dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
 dv.setUint32(12,js.length,true);dv.setUint32(16,0x4e4f534a,true);out.set(js,20);
 if(bb){const o=20+js.length;dv.setUint32(o,bb.length,true);dv.setUint32(o+4,0x004e4942,true);out.set(bb,o+8);}
 return out;
}
/** One triangle: 3 positions + 3 uint16 indices, fully wired scene. */
function triangle(indices=[0,1,2]){
 const pos=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const bin=new Uint8Array(42);new Uint8Array(pos.buffer).forEach((b,i)=>bin[i]=b);
 new Uint16Array(indices).forEach((v,i)=>{bin[36+i*2]=v&255;bin[36+i*2+1]=v>>8;});
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
  buffers:[{byteLength:42}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
 return glb(json,bin);
}

test('a well-formed triangle GLB passes every check',()=>{
 assert.deepEqual(validateGlb(triangle()),[]);
});

test('container problems: magic, declared length, first chunk not JSON',()=>{
 const bad1=triangle();bad1[0]=0;
 assert.equal(validateGlb(bad1)[0].code,'magic');
 const bad2=triangle();const dv=new DataView(bad2.buffer);dv.setUint32(8,999,true);
 assert.ok(validateGlb(bad2).some(p=>p.code==='length'));
 const j={asset:{version:'2.0'}};
 const binOnly=new Uint8Array(20);const dv2=new DataView(binOnly.buffer);
 dv2.setUint32(0,0x46546c67,true);dv2.setUint32(4,2,true);dv2.setUint32(8,20,true);dv2.setUint32(12,4,true);dv2.setUint32(16,0x004e4942,true);
 assert.ok(validateGlb(binOnly).some(p=>p.code==='chunk'||p.code==='json'));
 void j;
});

test('buffer and accessor range problems are caught',()=>{
 const t=triangle();
 const j=JSON.parse(new TextDecoder().decode(t.subarray(20,20+new DataView(t.buffer).getUint32(12,true))));
 j.buffers[0].byteLength=1000;
 assert.ok(validateGlb(glb(j,new Uint8Array(42))).some(p=>p.code==='buffer'));
 j.buffers[0].byteLength=42;j.bufferViews[0].byteLength=100;
 assert.ok(validateGlb(glb(j,new Uint8Array(42))).some(p=>p.code==='bufferView'));
 j.bufferViews[0].byteLength=36;j.accessors[0].count=30;
 assert.ok(validateGlb(glb(j,new Uint8Array(42))).some(p=>p.code==='accessor'));
});

test('an index outside the vertex count is caught',()=>{
 assert.ok(validateGlb(triangle([0,1,7])).some(p=>p.code==='indices'));
});

test('dangling references: node mesh, bufferView, texture',()=>{
 const t=triangle();
 const j=JSON.parse(new TextDecoder().decode(t.subarray(20,20+new DataView(t.buffer).getUint32(12,true))));
 j.nodes[0].mesh=5;
 assert.ok(validateGlb(glb(j,new Uint8Array(42))).some(p=>p.code==='reference'));
 j.nodes[0].mesh=0;j.images=[{bufferView:9,mimeType:'image/png'}];j.textures=[{source:0}];j.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:3}}}];
 const ps=validateGlb(glb(j,new Uint8Array(42)));
 assert.ok(ps.some(p=>p.code==='reference'&&p.detail.includes('image 0')));
 assert.ok(ps.some(p=>p.code==='reference'&&p.detail.includes('baseColorTexture')));
});
