import test from 'node:test';import assert from 'node:assert/strict';
import {estimateFit,parseResidency,LOCAL_MODEL_CATALOG,type Hardware} from './localModelAdvice';
const gib=1024**3;
const base:Hardware={os:'test',arch:'test',ramTotalBytes:32*gib,ramAvailableBytes:24*gib,gpus:[],errors:[],checkedAt:1};
test('fit is always an estimate with explicit reserve, not just raw model bytes',()=>{
 const fit=estimateFit(4*gib,base);assert.equal(fit.requiredBytes,6*gib);assert.equal(fit.label,'estimated-ram');
 assert.equal(estimateFit(undefined,base).label,'unknown');assert.equal(estimateFit(4*gib,null).label,'unknown');
});
test('discrete GPUs never aggregate and lower-bound CIM does not prove fit',()=>{
 const gpu={name:'gpu',totalBytes:4*gib,freeBytes:4*gib,unified:false,lowerBound:false};
 assert.equal(estimateFit(4*gib,{...base,ramAvailableBytes:0,gpus:[gpu,gpu]}).label,'too-large');
 assert.equal(estimateFit(4*gib,{...base,gpus:[{...gpu,freeBytes:8*gib}]}).label,'estimated-gpu');
 assert.equal(estimateFit(4*gib,{...base,ramAvailableBytes:0,gpus:[{...gpu,lowerBound:true}]}).label,'unknown');
 assert.equal(estimateFit(4*gib,{...base,ramAvailableBytes:0,gpus:[{...gpu,freeBytes:null}]}).label,'unknown');
});
test('unified RAM is one pool and never added to GPU memory',()=>{
 const hw={...base,ramAvailableBytes:4*gib,gpus:[{name:'Apple',unified:true,lowerBound:false,totalBytes:32*gib,freeBytes:32*gib}]};
 assert.equal(estimateFit(4*gib,hw).label,'too-large');assert.equal(estimateFit(4*gib,{...hw,ramAvailableBytes:8*gib}).label,'may-offload');
});
test('ps reported bytes and absence are distinct from malformed and unknown',()=>{
 assert.deepEqual(parseResidency({models:[{model:'qwen3:4b',size_vram:123,context_length:4096}]}),[{model:'qwen3:4b',sizeVramBytes:123,contextLength:4096}]);
 assert.deepEqual(parseResidency({models:[]}),[]);assert.equal(parseResidency({}),null);assert.equal(parseResidency({models:[null]}),null);
 assert.equal(parseResidency({models:[{name:'m',size_vram:-1}]})?.[0].sizeVramBytes,undefined);
});
test('bundled catalog is small, exact, source-bound and not task-certified',()=>{
 assert.equal(LOCAL_MODEL_CATALOG.length,5);
 assert.equal(new Set(LOCAL_MODEL_CATALOG.map(m=>m.id)).size,5);
 for(const entry of LOCAL_MODEL_CATALOG){assert.ok(entry.tag.includes(':'));assert.ok(!entry.tag.endsWith(':latest'));assert.equal(new URL(entry.sourceUrl).hostname,'ollama.com');assert.equal(entry.benchmark,'not-tested');assert.equal(entry.confidence,'candidate');assert.equal(entry.catalogVersion,1);assert.ok(entry.license);}
 assert.equal(LOCAL_MODEL_CATALOG.find(m=>m.tag==='gemma3:4b')?.adapterSupport,'text-only-image-pending');
});
