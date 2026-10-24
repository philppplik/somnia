import test from 'node:test';
import assert from 'node:assert/strict';
import {externalImages,externalGltfNeeds,externalResources} from './model';

const doc=(buffers:unknown[],images:unknown[])=>({asset:{version:'2.0'},buffers,images});

test('externalImages lists only non-embedded image uris',()=>{
 const j=doc([{uri:'a.bin'}],[{uri:'t.png'},{uri:'data:image/png;base64,xx'},{bufferView:0},{uri:'t.png'}]);
 assert.deepEqual(externalImages(j),['t.png']);
 assert.deepEqual(externalImages({asset:{version:'2.0'}}),[]);
 assert.deepEqual(externalResources(j),['a.bin','t.png']);
});
test('externalGltfNeeds splits fatal buffers from fallback textures',()=>{
 const j=doc([{uri:'a.bin'},{uri:'b.bin'}],[{uri:'t.png'},{uri:'u.jpg'}]);
 const none=externalGltfNeeds(j,()=>false);
 assert.deepEqual(none.missing,['a.bin','b.bin']);
 assert.deepEqual(none.missingTextures,['t.png','u.jpg']);
 const some=externalGltfNeeds(j,u=>u==='a.bin'||u==='t.png');
 assert.deepEqual(some.missing,['b.bin']);
 assert.deepEqual(some.missingTextures,['u.jpg']);
 const all=externalGltfNeeds(j,()=>true);
 assert.deepEqual(all,{missing:[],missingTextures:[]});
});
test('externalGltfNeeds treats embedded resources as present',()=>{
 const j=doc([{uri:'data:application/octet-stream;base64,AA=='}],[{uri:'data:image/png;base64,xx'}]);
 assert.deepEqual(externalGltfNeeds(j,()=>false),{missing:[],missingTextures:[]});
});
