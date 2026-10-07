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
