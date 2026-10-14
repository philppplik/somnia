import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalModelsRuntime,localOrigin,parseEvidence,parseInventory} from './localModels';
import {LOCAL_MODELS_CATALOGUES} from './localModelsI18n';
const version={version:'0.12.1'};
const tags={models:[{name:'model:7b',digest:'sha256:x',size:42,details:{parameter_size:'7B',quantization_level:'Q4'}}]};
test('read-only native runtime rejects remote endpoints and unusual URL components',()=>{
 for(const base of ['http://127.0.0.1:11434','http://localhost:11434','http://[::1]:11434'])assert.ok(localOrigin(base));
 for(const base of ['https://localhost:11434','http://example.com','http://localhost.evil','http://user@localhost','http://localhost/path','http://localhost?x=1','http://localhost#x'])assert.throws(()=>localOrigin(base));
});
test('inventory preserves exact variant and unknown sizes instead of zero',()=>{
 assert.deepEqual(parseInventory(tags),[{id:'model:7b',digest:'sha256:x',sizeBytes:42,parameterSize:'7B',quantization:'Q4'}]);
 assert.equal(parseInventory({models:[{model:'unknown',size:-1}]})[0].sizeBytes,undefined);
 assert.throws(()=>parseInventory({}));assert.throws(()=>parseInventory({models:[null]}));
 assert.deepEqual(parseInventory({models:[]}),[]);
});
test('capabilities come from show, never names; locality is separate, cloud aliases are visible',()=>{
 assert.deepEqual(parseEvidence('vision-tools',{model_info:{architecture:'llama'}}),{capabilities:null,locality:'reported-local'});
 assert.deepEqual(parseEvidence('text',{capabilities:['completion','tools','vision','embedding'],model_info:{architecture:'llama'}}).capabilities,['text','tools','vision','embedding']);
 assert.equal(parseEvidence('tag-cloud',{model_info:{x:1}}).locality,'remote');
 assert.equal(parseEvidence('tag',{remote_host:'cloud',model_info:{x:1}}).locality,'remote');
 assert.equal(parseEvidence('tag',{model_info:{}}).locality,'unverified');
 assert.equal(parseEvidence('tag',{model_info:[],capabilities:'tools'}).capabilities,null);
 assert.deepEqual(parseEvidence('tag',{capabilities:['audio','future']} ).capabilities,[]);
 assert.throws(()=>parseEvidence('tag',null));
});
test('running daemon does not require a detected binary; empty and failed inventory differ',async()=>{
 const runtime=new LocalModelsRuntime(undefined,async op=>op==='version'?version:tags,async()=>({installed:false}),()=>true);
 const snapshot=await runtime.snapshot();assert.equal(snapshot.state,'running');assert.equal(snapshot.installed,false);assert.equal(snapshot.models.length,1);
 const empty=new LocalModelsRuntime(undefined,async op=>op==='version'?version:{models:[]},async()=>({installed:true}),()=>true);
 assert.equal((await empty.snapshot()).inventoryError,false);
 const invalid=new LocalModelsRuntime(undefined,async op=>op==='version'?version:{},async()=>({installed:true}),()=>true);
 assert.equal((await invalid.snapshot()).inventoryError,true);
});
test('unreachable runtime preserves install detection and unknown detection',async()=>{
 for(const [installed,state] of [[true,'stopped'],[false,'not-found']] as const){
  const runtime=new LocalModelsRuntime(undefined,async()=>{throw Error('offline');},async()=>({installed}),()=>true);
  assert.equal((await runtime.snapshot()).state,state);
 }
 const unknown=new LocalModelsRuntime(undefined,async()=>{throw Error();},async()=>{throw Error();},()=>true);
 assert.equal((await unknown.snapshot()).state,'unreachable');
});
test('browser preview makes no network, IPC or install probe calls',async()=>{
 const nope=async():Promise<never>=>{throw Error('must not be called');};
 const snapshot=await new LocalModelsRuntime(undefined,nope,nope,()=>false).snapshot();assert.equal(snapshot.state,'unavailable');
});
test('native snapshot and evidence only use version/tags/show without inference',async()=>{
 const calls:string[]=[];const runtime=new LocalModelsRuntime(undefined,async(op,model)=>{calls.push(op+(model?':'+model:''));return op==='version'?version:op==='tags'?tags:{capabilities:['completion']};},async()=>({installed:true}),()=>true);
 await runtime.snapshot();await runtime.evidence('model:7b');assert.deepEqual(calls,['version','tags','show:model:7b']);
});
test('all shipped languages cover all local runtime strings',()=>{
 const keys=Object.keys(LOCAL_MODELS_CATALOGUES.en).sort();
 for(const locale of ['de','es','fr','pt-BR'])assert.deepEqual(Object.keys(LOCAL_MODELS_CATALOGUES[locale]).sort(),keys);
});
test('show metadata concurrency stays bounded even across multiple callers',async()=>{
 let active=0,peak=0;const runtime=new LocalModelsRuntime(undefined,async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return {capabilities:['completion']};},async()=>({installed:true}),()=>true);
 await Promise.all(Array.from({length:8},(_,i)=>runtime.evidence('model:'+i)));
 assert.equal(peak,2);assert.equal(active,0);
});
