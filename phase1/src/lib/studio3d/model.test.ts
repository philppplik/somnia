import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelHeader,modelFormatFor,externalResources,frameDistance,clipPlanes,boundsCenter,boundsSize,boundsRadius,boundsValid,emptyBounds,formatCount,ModelError,MAX_MODEL_BYTES,mergeEnv,defaultEnv,EnvError,nudgeFor,envFormatFor,isMeshFormat,defaultSnap,mergeSnap,SnapError,snapTo,stlUnitHint,mtlReferences,mtlTextures,clampRenderSize} from './model';
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
 assert.equal(modelFormatFor('c.obj'),'obj');assert.equal(modelFormatFor('d.STL'),'stl');assert.equal(modelFormatFor('e.ply'),'ply');assert.equal(modelFormatFor('c.fbx'),null);assert.equal(modelFormatFor('noext'),null);
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
test('mergeEnv validates, clamps and wraps',()=>{
 const d=defaultEnv();
 assert.equal(mergeEnv(d,{intensity:9}).intensity,3);assert.equal(mergeEnv(d,{intensity:-1}).intensity,0);
 assert.equal(mergeEnv(d,{rotation:190}).rotation,-170);assert.equal(mergeEnv(d,{preset:'sky',background:true}).background,true);
 assert.throws(()=>mergeEnv(d,{preset:'moon' as never}),EnvError);assert.throws(()=>mergeEnv(d,{intensity:NaN}),EnvError);
 assert.throws(()=>mergeEnv(d,{background:'yes' as never}),EnvError);
 assert.throws(()=>mergeEnv(d,{preset:'custom'}),EnvError,'custom needs a loaded file');
 assert.equal(mergeEnv(d,{preset:'custom',customName:'a.hdr'}).preset,'custom');
 assert.deepEqual(d,defaultEnv(),'input is not mutated');
});
test('nudgeFor maps keys to axes and ignores others',()=>{
 assert.deepEqual(nudgeFor('ArrowLeft',0.5),{x:-0.5});assert.deepEqual(nudgeFor('ArrowUp'),{z:-0.1});assert.deepEqual(nudgeFor('PageUp',2),{y:2});
 assert.equal(nudgeFor('a'),null);
});
test('envFormatFor accepts hdr and exr only',()=>{
 assert.equal(envFormatFor('Sky.HDR'),'hdr');assert.equal(envFormatFor('x.exr'),'exr');assert.equal(envFormatFor('x.png'),null);assert.equal(envFormatFor('hdr'),null);
});
const enc=(s:string)=>new TextEncoder().encode(s);
test('OBJ, STL and PLY are recognised by content checks',()=>{
 assert.equal(isMeshFormat('obj'),true);assert.equal(isMeshFormat('glb'),false);
 assert.equal(readModelHeader('a.obj',enc('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')).format,'obj');
 assert.throws(()=>readModelHeader('a.obj',enc('hello')),ModelError);
 assert.throws(()=>readModelHeader('a.obj',enc('v 0 0 0\n')),ModelError);
 assert.throws(()=>readModelHeader('a.obj',new Uint8Array([0xff,0xfe,0,1,2])),ModelError);
 assert.equal(readModelHeader('a.stl',enc('solid x\nfacet normal 0 0 1\nouter loop\n')).format,'stl');
 const bin=new Uint8Array(84+50);new DataView(bin.buffer).setUint32(80,1,true);
 assert.equal(readModelHeader('a.stl',bin).format,'stl');
 const bad=new Uint8Array(100);new DataView(bad.buffer).setUint32(80,5,true);
 assert.throws(()=>readModelHeader('a.stl',bad),ModelError);
 const ply=readModelHeader('a.ply',enc('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nelement face 1\nend_header\n0 0 0\n'));
 assert.equal(ply.format,'ply');assert.equal(ply.pointCloud,false);
 assert.equal(readModelHeader('a.ply',enc('ply\nformat ascii 1.0\nelement vertex 3\nend_header\n')).pointCloud,true);
 assert.throws(()=>readModelHeader('a.ply',enc('ply\nformat ascii 1.0\nelement vertex 3\n')),ModelError);
 assert.throws(()=>readModelHeader('a.ply',enc('ply\nformat ascii 1.0\nelement vertex 99999999999\nend_header\n')),ModelError);
 assert.throws(()=>readModelHeader('a.ply',enc('nope')),ModelError);
});
test('a GLB renamed to .obj is still read as GLB',()=>{
 assert.equal(readModelHeader('x.obj',glb({asset:{version:'2.0'}})).format,'glb');
});
test('mergeSnap validates ranges and keeps untouched fields',()=>{
 const d=defaultSnap();const n=mergeSnap(d,{on:true,move:0.5});assert.equal(n.on,true);assert.equal(n.move,0.5);assert.equal(n.rotate,d.rotate);
 assert.throws(()=>mergeSnap(d,{move:0}),SnapError);assert.throws(()=>mergeSnap(d,{rotate:500}),SnapError);assert.throws(()=>mergeSnap(d,{scale:NaN}),SnapError);assert.throws(()=>mergeSnap(d,{on:1 as never}),SnapError);
 assert.equal(d.on,false);
});
test('snapTo rounds to the nearest step',()=>{assert.equal(snapTo(0.37,0.25),0.25);assert.equal(snapTo(0.38,0.25),0.5);assert.equal(snapTo(-0.6,0.5),-0.5);assert.equal(snapTo(1.23,0),1.23);});
test('stlUnitHint suggests millimetres for parts larger than 10 units only',()=>{
 assert.deepEqual(stlUnitHint([120,40,10]),{unit:'mm',factor:0.001});assert.equal(stlUnitHint([1,2,0.5]),null);assert.equal(stlUnitHint([9.9,1,1]),null);
 assert.equal(stlUnitHint([1e7,1,1]),null);assert.equal(stlUnitHint([NaN,1,1]),null);
});
test('mtl helpers list base names only and skip URLs',()=>{
 assert.deepEqual(mtlReferences('mtllib a.mtl\nmtllib dir\\b.mtl\nv 0 0 0'),['a.mtl','b.mtl']);
 const mtl='newmtl x\nmap_Kd wood.png\n map_Bump -bm 0.5 tex/normal.jpg\nmap_Ks http://evil.example/x.png\nmap_Kd file:///etc/passwd\nmap_d C:\\img\\a.png\nKd 1 1 1';
 assert.deepEqual(mtlTextures(mtl),['wood.png','normal.jpg','a.png']);
});
test('clampRenderSize rounds, limits and keeps the aspect ratio',()=>{
 assert.deepEqual(clampRenderSize(1920.4,1080,16384),{width:1920,height:1080});
 assert.deepEqual(clampRenderSize(8000,4000,4000),{width:4000,height:2000});
 assert.throws(()=>clampRenderSize(0,10,100),SnapError);assert.throws(()=>clampRenderSize(10,NaN,100),SnapError);
});
import {toggleSelection,marqueeRect,inRect,turntablePlan,frameName,exportFileName,unitScale,isUnit,UNIT_IDS} from './model';
test('toggleSelection adds, removes and seeds from the primary selection',()=>{
 assert.deepEqual(toggleSelection([],5,7),{marked:[5,7],selected:7});
 assert.deepEqual(toggleSelection([5,7],7,7),{marked:[5],selected:5});
 assert.deepEqual(toggleSelection([],null,3),{marked:[3],selected:3});
 assert.deepEqual(toggleSelection([3],3,3),{marked:[],selected:null});
 const m=[1,2];toggleSelection(m,2,9);assert.deepEqual(m,[1,2],'input is not mutated');
});
test('marquee rectangle normalises corners and tests points',()=>{
 const r=marqueeRect({x:50,y:80},{x:10,y:20});assert.deepEqual(r,{x0:10,y0:20,x1:50,y1:80});
 assert.equal(inRect(r,{x:10,y:80}),true);assert.equal(inRect(r,{x:9,y:30}),false);assert.equal(inRect(r,{x:30,y:81}),false);
});
test('turntablePlan validates frames and the pixel budget',()=>{
 const p=turntablePlan(36,1280,720);assert.equal(p.frames,36);assert.ok(Math.abs(p.step*36-Math.PI*2)<1e-12);
 assert.throws(()=>turntablePlan(1,10,10),SnapError);assert.throws(()=>turntablePlan(361,10,10),SnapError);assert.throws(()=>turntablePlan(2.5,10,10),SnapError);
 assert.throws(()=>turntablePlan(360,8192,8192),SnapError);assert.throws(()=>turntablePlan(10,0,10),SnapError);
});
test('frame names are zero padded and sort in order',()=>{
 assert.equal(frameName(0,36),'frame-0001.png');assert.equal(frameName(35,36),'frame-0036.png');assert.equal(frameName(0,12000),'frame-00001.png');
});
test('units scale metres and name export files',()=>{
 assert.equal(unitScale('mm'),1000);assert.equal(unitScale('m'),1);assert.ok(Math.abs(unitScale('in')-39.37007874)<1e-6);
 assert.equal(isUnit('mm'),true);assert.equal(isUnit('ft'),false);assert.equal(isUnit('toString'),false);assert.deepEqual([...UNIT_IDS].sort(),['cm','in','m','mm']);
 assert.equal(exportFileName('part','stl','mm'),'part-mm.stl');assert.equal(exportFileName('part','stl','m'),'part.stl');assert.equal(exportFileName('part','glb','mm'),'part.glb');
});
test('som3d files are recognised by their format marker',()=>{
 assert.equal(modelFormatFor('a.SOM3D'),'som3d');
 assert.equal(readModelHeader('a.som3d',enc('{"format":"somnia-3d","version":1}')).format,'som3d');
 assert.throws(()=>readModelHeader('a.som3d',enc('{"format":"other"}')),ModelError);assert.throws(()=>readModelHeader('a.som3d',enc('x')),ModelError);
});
