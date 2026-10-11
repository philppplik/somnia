import test from 'node:test';
import assert from 'node:assert/strict';
import {isTrialModel,computeReadiness,probeLocal,parseLmStudioModels} from './modelReadiness';
import {CATALOGUES} from '../i18n';
import {VIBESPACE_CATALOGUES} from './i18n';
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json'}});
test('only Qwen3.5-9B is the trial model',()=>{
 for(const id of ['qwen3.5:9b','qwen3.5-9b','Qwen3.5-9B-Instruct-GGUF'])assert.ok(isTrialModel(id),id);
 for(const id of ['qwen3.5:90b','qwen3.5:2b','qwen3:9b','gemma3:9b','llama3:8b','qwen3.8:9b'])assert.ok(!isTrialModel(id),id);
});
test('readiness states',()=>{
 assert.equal(computeReadiness('ollama',null).state,'server-down');
 assert.equal(computeReadiness('lmstudio',[{id:'llama3:8b'}]).state,'model-missing');
 const r=computeReadiness('ollama',[{id:'qwen3.5:9b'}]);assert.equal(r.state==='ready'&&r.modelId,'qwen3.5:9b');
});
test('ollama probe uses recorded tags and never issues a pull/POST',async()=>{
 const calls:string[]=[];
 const f=async(u:string,i?:RequestInit)=>{calls.push((i?.method??'GET')+' '+u);return u.endsWith('/api/version')?json({version:'0.9.0'}):json({models:[{name:'qwen3.5:9b',size:6e9}]});};
 const r=await probeLocal('ollama',{fetch:f});
 assert.equal(r.state,'ready');
 assert.ok(calls.every(c=>c.startsWith('GET ')&&c.includes('127.0.0.1')&&!c.includes('/pull')),calls.join());
});
test('lm studio probe: down, missing, malformed',async()=>{
 assert.equal((await probeLocal('lmstudio',{fetch:async()=>{throw new TypeError('refused');}})).state,'server-down');
 assert.equal((await probeLocal('lmstudio',{fetch:async()=>json({data:[{id:'x'}]})})).state,'model-missing');
 await assert.rejects(probeLocal('lmstudio',{fetch:async()=>json({nope:1})}));
 assert.throws(()=>parseLmStudioModels({data:[{}]}));
});
test('probe refuses non-loopback endpoints',async()=>{
 await assert.rejects(probeLocal('ollama',{baseUrl:'http://192.168.1.4:11434',fetch:async()=>json({})}));
 await assert.rejects(probeLocal('lmstudio',{baseUrl:'https://example.com',fetch:async()=>json({})}));
});
test('vibespace catalogue: exact key parity across 5 locales, merged into app catalogue',()=>{
 const keys=Object.keys(VIBESPACE_CATALOGUES.en).sort();
 for(const l of ['de','es','fr','pt-BR']){assert.deepEqual(Object.keys(VIBESPACE_CATALOGUES[l]).sort(),keys,l);for(const k of keys)assert.ok(VIBESPACE_CATALOGUES[l][k].length>0);}
 for(const l of Object.keys(VIBESPACE_CATALOGUES))for(const k of keys)assert.equal(CATALOGUES[l][k],VIBESPACE_CATALOGUES[l][k]);
});
