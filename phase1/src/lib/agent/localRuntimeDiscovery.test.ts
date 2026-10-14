import test from 'node:test';import assert from 'node:assert/strict';
import {discoveryOrigin,discoveryPath,parseDiscoveredModels} from './localRuntimeDiscovery';
test('alternate runtime discovery never upgrades locality',()=>{
 assert.deepEqual(parseDiscoveredModels('llama.cpp',{data:[{id:'local.gguf'}]}),[{id:'local.gguf',sizeBytes:undefined,capabilities:null,locality:'unverified'}]);
 assert.equal(parseDiscoveredModels('lmstudio',{models:[{key:'publisher/model',size_bytes:123} ]})[0].sizeBytes,123);
 assert.equal(discoveryPath('llama.cpp'),'/v1/models');assert.equal(discoveryPath('lmstudio'),'/api/v1/models');
});
test('discovery rejects unusual origin and malformed inventory without fallback',()=>{
 for(const url of ['https://localhost','http://remote.invalid','http://localhost/path','http://user@localhost','http://localhost?x=1'])assert.throws(()=>discoveryOrigin(url));
 for(const v of [{},{data:[null]},{data:[{id:'unsafe\nname'}]}])assert.throws(()=>parseDiscoveredModels('llama.cpp',v));
 assert.deepEqual(parseDiscoveredModels('llama.cpp',{data:[]}),[]);
});
