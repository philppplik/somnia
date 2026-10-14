import {test} from 'node:test';import assert from 'node:assert/strict';
import {nonSecretSettings,normalizePrompts} from './settings';
import {withCustomPrompts} from './panelBridge';
import type {AgentProvider,AgentProviderRequest} from './types';
test('non-secret preferences exclude keys and session permissions',()=>{
 const p=nonSecretSettings({provider:'openrouter',model:'fixture/model',apiKey:'fixture-not-real',allowActiveFile:true,customPrompts:[]});
 assert.deepEqual(p,{provider:'openrouter',model:'fixture/model',customPrompts:[]});assert.ok(!JSON.stringify(p).includes('fixture-not-real'));
});
test('prompt bounds, duplicate IDs and invalid values fail closed',()=>{
 const p={id:'1',name:'Style',text:'Be concise',enabled:true};assert.deepEqual(normalizePrompts([p]),[p]);
 for(const v of [[p,p],[{...p,text:'x'.repeat(8001)}],[{...p,enabled:'yes'}],[{...p,text:'\0'}]])assert.throws(()=>normalizePrompts(v));
});
test('enabled prompts appear on every provider round without replacing base rules',async()=>{
 const calls:AgentProviderRequest[]=[];const provider:AgentProvider={id:'fixture',locality:'local',async *stream(r){calls.push(r);yield {type:'finish',reason:'stop'};}};
 const wrapped=withCustomPrompts(provider,[{id:'1',name:'Style',text:'Be concise',enabled:true},{id:'2',name:'Off',text:'Not sent',enabled:false}]);
 const request:AgentProviderRequest={model:'fixture',messages:[{role:'system',content:'Base safety rules'},{role:'user',content:'Question'}],tools:[],maxOutputTokens:10,signal:new AbortController().signal};
 for(let i=0;i<2;i++)for await(const _ of wrapped.stream(request)){}
 assert.equal(calls.length,2);for(const r of calls){assert.equal(r.messages[0].content,'Base safety rules');assert.match(r.messages[1].content,/Be concise/);assert.ok(!r.messages.some(m=>m.content.includes('Not sent')));}
 assert.equal(request.messages.length,2);
});
test('advanced local preferences are versioned, bounded, non-secret and survive cloud provider selection',()=>{
 const base={provider:'openrouter' as const,model:'cloud/model',apiKey:'secret',allowActiveFile:true,customPrompts:[]};
 assert.deepEqual(nonSecretSettings({...base,localRuntime:{version:1,numCtx:16384,keepAliveSeconds:0}}),{provider:'openrouter',model:'cloud/model',customPrompts:[],localRuntime:{version:1,numCtx:16384,keepAliveSeconds:0}});
 for(const localRuntime of [{version:2},{version:1,numCtx:0},{version:1,numCtx:1.2},{version:1,numCtx:1048577},{version:1,keepAliveSeconds:-1},{version:1,keepAliveSeconds:86401},{version:1,apiKey:'secret'}])assert.throws(()=>nonSecretSettings({...base,localRuntime:localRuntime as never}));
});
test('studio model overrides are explicit local preferences with bounded identifiers',()=>{
 const base={provider:'ollama' as const,model:'base',apiKey:'',allowActiveFile:false};
 assert.deepEqual(nonSecretSettings({...base,localRuntime:{version:1,studioModels:{photos:'gemma:4b',code:'qwen:4b'}}}).localRuntime?.studioModels,{photos:'gemma:4b',code:'qwen:4b'});
 for(const studioModels of ([{'bad/id':'model'},{code:''},{code:'model\n'}] as Record<string,string>[]))assert.throws(()=>nonSecretSettings({...base,localRuntime:{version:1,studioModels}}));
});
test('per-model context defaults round-trip and reject invalid values without changing global preference',()=>{
 const config={provider:'ollama' as const,model:'qwen3:4b',apiKey:'',allowActiveFile:false,localRuntime:{version:1 as const,numCtx:8192,modelContexts:{'qwen3:4b':16384}}};assert.deepEqual(nonSecretSettings(config).localRuntime,config.localRuntime);for(const n of [0,-1,1.5,NaN,1048577])assert.throws(()=>nonSecretSettings({...config,localRuntime:{...config.localRuntime,modelContexts:{m:n}}}));
});
test('per-model context uses exact tag and inherits global without altering it',async()=>{
 const {localContextFor}=await import('./settings');const p={version:1 as const,numCtx:8192,modelContexts:{'qwen3:4b':16384}};assert.equal(localContextFor(p,'qwen3:4b'),16384);assert.equal(localContextFor(p,'qwen3:8b'),8192);assert.equal(localContextFor(undefined,'qwen3:4b'),undefined);assert.equal(p.numCtx,8192);
});
