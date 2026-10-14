import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOpen,classify} from './openResolver';
import {createOpenCoordinator,type OpenDeps} from './openCoordinator';
import './3d';
const pad=(b:Uint8Array)=>{const o=new Uint8Array((b.length+3)&~3).fill(0x20);o.set(b);return o;};
function glb(json:unknown):Uint8Array{
 const j=pad(new TextEncoder().encode(JSON.stringify(json)));const out=new Uint8Array(20+j.length);const v=new DataView(out.buffer);
 v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,j.length,true);v.setUint32(16,0x4e4f534a,true);out.set(j,20);return out;
}
const ok={asset:{version:'2.0'}};
test('a GLB routes to the 3D studio by content',()=>{
 const r=resolveOpen('chair.glb',glb(ok));
 assert.equal(r.status,'ready');if(r.status==='ready'){assert.equal(r.kind,'model3d');assert.equal(r.studioId,'3d');assert.equal(r.preview,false);assert.equal(r.mismatch,undefined);}
});
test('a .gltf with valid JSON routes to 3D; the same JSON as .txt stays text',()=>{
 const bytes=new TextEncoder().encode(JSON.stringify(ok));
 const r=resolveOpen('scene.gltf',bytes);assert.equal(r.status,'ready');if(r.status==='ready')assert.equal(r.studioId,'3d');
 assert.equal(classify('notes.txt',bytes).kind,'text');
});
test('GLB bytes under another suffix ask instead of guessing',()=>{
 const r=resolveOpen('chair.bin',glb(ok));assert.equal(r.status,'choose-handler');
 const forced=resolveOpen('chair.bin',glb(ok),{target:'3d'});assert.equal(forced.status,'ready');
});
test('broken glTF is invalid with a readable reason and never falls back to text or Code',()=>{
 for(const [name,bytes,re] of [['a.glb',new Uint8Array([1,2,3]),/not a glTF/],['b.gltf',new TextEncoder().encode('{"asset":{"version":"1.0"}}'),/glTF 1\.0/],['c.gltf',new TextEncoder().encode('hello'),/not a glTF/],['d.glb',new Uint8Array(0),/empty/]] as const){
  const r=resolveOpen(name,bytes as Uint8Array);assert.equal(r.status,'invalid',name);if(r.status==='invalid')assert.match(r.reason,re);
 }
});
test('the coordinator opens a GLB through prepare/commit and switches to 3D once',async()=>{
 const calls:string[]=[];
 const deps:OpenDeps={
  async prepare(input,resolution){calls.push('prepare:'+resolution.kind);return{name:input.name,studioId:resolution.handler.studioId,affectedDocs:()=>[],dispose(){},commit(){calls.push('commit');return{ok:true,key:'3d:'+input.name};},focus(){calls.push('focus');}};},
  approve:async()=>'approved',revalidate:()=>true,switchStudio(id,key){calls.push('switch:'+id+':'+key);},notify(){},singleDocument:id=>id==='3d',
 };
 const report=await createOpenCoordinator(deps).openFiles([{name:'a.glb',bytes:glb(ok)},{name:'b.glb',bytes:glb(ok)}]);
 assert.deepEqual(calls,['prepare:model3d','prepare:model3d','commit','focus','switch:3d:3d:a.glb']);
 assert.equal(report.outcomes[0].status,'opened');assert.equal(report.outcomes[1].status,'deferred');
});
test('OBJ, STL, PLY and som3d files route to the 3D studio after content checks',()=>{
 const e=(s:string)=>new TextEncoder().encode(s);
 for(const [name,body] of [['a.obj','v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'],['a.stl','solid x\nfacet normal 0 0 1\nendsolid'],['a.ply','ply\nformat ascii 1.0\nelement vertex 3\nend_header\n0 0 0\n'],['a.som3d','{"format":"somnia-3d","version":1}']] as const){
  const r=resolveOpen(name,e(body));assert.equal(r.status,'ready',name);if(r.status==='ready'){assert.equal(r.kind,'model3d');assert.equal(r.studioId,'3d');}
 }
 const bad=resolveOpen('b.obj',e('hello'));assert.notEqual(bad.status,'ready');
 const badDoc=resolveOpen('b.som3d',e('{"format":"x"}'));assert.notEqual(badDoc.status,'ready');
});
