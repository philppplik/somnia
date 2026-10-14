import test from 'node:test';import assert from 'node:assert/strict';
import {validateScene,exportBlocker,textureBytes,toMB,LIMITS} from './validate';
import {emptyStats} from './model';
const base=()=>({...emptyStats(),meshes:1,nodes:1,triangles:100});
test('a small scene has no warnings',()=>{assert.deepEqual(validateScene(base()),[]);});
test('each limit produces its own warning with the numbers',()=>{
 const s={...base(),triangles:LIMITS.triangles+1,textureBytes:LIMITS.textureBytes+1,maxTexture:8192,draws:900,zeroScale:2,textureNoUv:1};
 const codes=validateScene(s).map(w=>w.code);
 assert.deepEqual(codes,['highTriangles','highTextureMemory','largeTexture','manyDraws','zeroScale','textureNoUv']);
 assert.equal(validateScene(s)[2].values.size,8192);
});
test('exactly at the limit is fine',()=>{assert.deepEqual(validateScene({...base(),triangles:LIMITS.triangles,maxTexture:LIMITS.textureSize,draws:LIMITS.draws}),[]);});
test('animations raise no warning, empty groups get a note',()=>{
 assert.deepEqual(validateScene({...base(),animations:2}),[]);
 assert.deepEqual(validateScene({...emptyStats(),nodes:3}).map(w=>w.code),['noGeometry']);
});
test('textureBytes estimates RGBA with mips and ignores bad sizes',()=>{
 assert.equal(textureBytes(1024,1024),Math.ceil(1024*1024*4*4/3));assert.equal(textureBytes(0,10),0);assert.equal(textureBytes(Number.NaN,10),0);assert.equal(toMB(1024*1024*1.26),1.3);
});
test('exportBlocker refuses only above the export limit',()=>{
 assert.equal(exportBlocker({...base(),textureBytes:LIMITS.exportTextureBytes}),null);
 assert.match(exportBlocker({...base(),textureBytes:LIMITS.exportTextureBytes+1})!,/export limit/);
});

test('geometry memory and bone budgets warn above their limits',()=>{
 const codes=validateScene({...base(),geometryBytes:LIMITS.geometryBytes+1,bones:LIMITS.bones+1}).map(w=>w.code);
 assert.deepEqual(codes,['highGeometryMemory','manyBones']);
 const w=validateScene({...base(),geometryBytes:LIMITS.geometryBytes+1})[0];
 assert.equal(w.values.mb,toMB(LIMITS.geometryBytes+1));
 assert.deepEqual(validateScene({...base(),geometryBytes:LIMITS.geometryBytes,bones:LIMITS.bones}),[]);
});
import {sceneHints,HINT_LIMITS} from './validate';
test('instancing hint fires only above the candidate limit',()=>{
 assert.deepEqual(sceneHints({...base(),instancingCandidates:HINT_LIMITS.instancing-1}),[]);
 const h=sceneHints({...base(),instancingCandidates:HINT_LIMITS.instancing});
 assert.deepEqual(h.map(w=>w.code),['instancingHint']);
 assert.equal(h[0].level,'info');assert.equal(h[0].values.count,HINT_LIMITS.instancing);
});
test('lod hint fires for a large static scene, not for skinned or animated ones',()=>{
 assert.deepEqual(sceneHints({...base(),triangles:HINT_LIMITS.lodTriangles+1}).map(w=>w.code),['lodHint']);
 assert.deepEqual(sceneHints({...base(),triangles:HINT_LIMITS.lodTriangles+1,bones:10}),[]);
 assert.deepEqual(sceneHints({...base(),triangles:HINT_LIMITS.lodTriangles+1,animations:2}),[]);
 assert.deepEqual(sceneHints({...base(),triangles:HINT_LIMITS.lodTriangles}),[]);
});
