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
test('animations give an info note, empty groups too',()=>{
 assert.deepEqual(validateScene({...base(),animations:2}).map(w=>[w.code,w.level]),[['animationsNotSaved','info']]);
 assert.deepEqual(validateScene({...emptyStats(),nodes:3}).map(w=>w.code),['noGeometry']);
});
test('textureBytes estimates RGBA with mips and ignores bad sizes',()=>{
 assert.equal(textureBytes(1024,1024),Math.ceil(1024*1024*4*4/3));assert.equal(textureBytes(0,10),0);assert.equal(textureBytes(Number.NaN,10),0);assert.equal(toMB(1024*1024*1.26),1.3);
});
test('exportBlocker refuses only above the export limit',()=>{
 assert.equal(exportBlocker({...base(),textureBytes:LIMITS.exportTextureBytes}),null);
 assert.match(exportBlocker({...base(),textureBytes:LIMITS.exportTextureBytes+1})!,/export limit/);
});
