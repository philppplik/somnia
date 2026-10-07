import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenAIProvider,OPENAI_CHAT_ENDPOINT,OPENAI_MODELS_ENDPOINT} from './openAI';
import {AgentPrivacyGate} from './privacy';
import {AgentError} from './errors';
import type {AgentProviderRequest,AgentProviderEvent} from './types';
const gate=()=>{const values=new Map<string,string>();const g=new AgentPrivacyGate(()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}}));g.grantExplicitConsent();return g;};
const request=():AgentProviderRequest=>({model:'gpt-5',messages:[{role:'system',content:'instructions'},{role:'user',content:'hello'}],tools:[],maxOutputTokens:100,signal:new AbortController().signal});
const sse=(events:unknown[],done=true)=>{const bytes=new TextEncoder().encode(': heartbeat\r\n\r\n'+events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`).join('')+(done?'data: [DONE]\r\n\r\n':''));let i=0;return new Response(new ReadableStream({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,++i));}}),{headers:{'Content-Type':'text/event-stream'}});};
async function collect(p:OpenAIProvider,r=request()){const events:AgentProviderEvent[]=[];for await(const e of p.stream(r))events.push(e);return events;}
test('OpenAI schema: streaming, developer instructions, tool wire messages, usage without made-up cost',async()=>{
 let body:any;const r=request();r.tools=[{name:'read_file',description:'Read file',parameters:{type:'object'}}];r.messages=[...r.messages,{role:'assistant',content:'',toolCalls:[{id:'c',name:'read_file',arguments:'{}'}]},{role:'tool',content:'result',toolCallId:'c'}];
 const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'fixture-key',fetch:async(url,init)=>{assert.equal(url,OPENAI_CHAT_ENDPOINT);assert.equal(init?.redirect,'error');assert.equal((init?.headers as any).Authorization,'Bearer fixture-key');body=JSON.parse(String(init?.body));return sse([
  {choices:[{index:0,delta:{content:'Grüße 🦞'}}]},
  {choices:[{index:0,delta:{tool_calls:[{index:0,id:'c',function:{name:'read_file',arguments:'{'}}]}}]},
  {choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'}'}}]},finish_reason:'tool_calls'}]},
  {choices:[],usage:{prompt_tokens:4,completion_tokens:7,cost:123}}
 ]);}});
 const events=await collect(p,r);assert.equal(body.max_completion_tokens,100);assert.equal(body.max_tokens,undefined);assert.equal(body.provider,undefined);assert.equal(body.store,false);assert.deepEqual(body.stream_options,{include_usage:true});assert.equal(body.messages[0].role,'developer');assert.equal(body.messages[2].tool_calls[0].type,'function');assert.equal(body.messages[3].tool_call_id,'c');assert.equal(body.tools[0].type,'function');assert.deepEqual(events[0],{type:'text',text:'Grüße 🦞'});assert.deepEqual(events.at(-1),{type:'usage',usage:{inputTokens:4,outputTokens:7}});
});
test('denied cloud consent touches neither credential nor transport, including model discovery',async()=>{
 let touched=false;const p=new OpenAIProvider({privacyGate:new AgentPrivacyGate(()=>undefined),getApiKey:()=>{touched=true;return 'key';},fetch:async()=>{touched=true;return sse([]);}});
 await assert.rejects(collect(p),/consent/);await assert.rejects(p.listModels(request().signal),/consent/);assert.equal(touched,false);
});
test('OpenAI /models lists sorted distinct IDs and rejects invalid catalogs',async()=>{
 const p=new OpenAIProvider({privacyGate:gate(),getApiKey:async()=> 'key',fetch:async(url,init)=>{assert.equal(url,OPENAI_MODELS_ENDPOINT);assert.equal(init?.method,'GET');assert.equal(init.body,undefined);return Response.json({object:'list',data:[{id:'z',owned_by:'openai',created:1},{id:'a',owned_by:'openai',created:2},{id:'z',owned_by:'openai',created:1}]});}});
 assert.deepEqual(await p.listModels(request().signal),[{id:'a',ownedBy:'openai',created:2},{id:'z',ownedBy:'openai',created:1}]);
 const invalid=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',fetch:async()=>Response.json({object:'list',data:[{id:'secret\n',created:0,owned_by:'x'}]})});await assert.rejects(invalid.listModels(request().signal),/Invalid OpenAI model catalog/);
});
test('quota/billing never retries, redacts body; rate limit retries honor retry-after',async()=>{
 for(const code of ['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded']){let calls=0;const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',fetch:async()=>{calls++;return Response.json({error:{code,message:'PRIVATE_PROMPT'}},{status:429});}});await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&e.detail==='credit'&&!e.retryable&&!e.message.includes('PRIVATE'));assert.equal(calls,1);}
 let calls=0;let slept=0;const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',sleep:async ms=>{slept=ms;},fetch:async()=> ++calls===1?Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'Retry-After':'2'}}):sse([{choices:[{index:0,delta:{},finish_reason:'stop'}]}])});await collect(p);assert.equal(calls,2);assert.equal(slept,2000);
});
test('errors redact auth, network, malformed stream, truncated completion, credential-store details',async()=>{
 for(const fetch of [async()=>new Response('PRIVATE',{status:401}),async()=>{throw Error('PRIVATE');},async()=>sse([{choices:{secret:'PRIVATE'}}]),async()=>sse([{choices:[{delta:{content:'partial'}}]}],false)]){const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',maxRetries:0,fetch});await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&!e.message.includes('PRIVATE'));}
 await assert.rejects(collect(new OpenAIProvider({privacyGate:gate(),getApiKey:()=>{throw Error('PRIVATE_STORE');}})),(e:unknown)=>e instanceof AgentError&&e.detail==='auth'&&!e.message.includes('PRIVATE'));
});
test('revocation aborts transport and suppresses buffered deltas; early return closes stream',async()=>{
 const g=gate();let signal:AbortSignal|undefined;const p=new OpenAIProvider({privacyGate:g,getApiKey:()=> 'key',fetch:async(_url,init)=>{signal=init?.signal as AbortSignal;return sse([{choices:[{delta:{content:'first'}}]},{choices:[{delta:{content:'second'}}]}]);}});
 const iterator=p.stream(request());assert.equal((await iterator.next()).value?.type,'text');g.revoke();await assert.rejects(iterator.next());assert.equal(signal?.aborted,true);
 const p2=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',fetch:async(_url,init)=>{signal=init?.signal as AbortSignal;return sse([{choices:[{delta:{content:'first'}}]},{choices:[{delta:{content:'second'}}]}]);}});for await(const e of p2.stream(request())){assert.equal(e.type,'text');break;}assert.equal(signal?.aborted,true);
});
test('revocation interrupts an unfinished model catalog body',async()=>{
 const g=gate();let signal:AbortSignal|undefined;let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
 const p=new OpenAIProvider({privacyGate:g,getApiKey:()=> 'key',fetch:async(_url,init)=>{signal=init?.signal as AbortSignal;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"object":"list","data":['));started();}}),{headers:{'Content-Type':'application/json'}});}});
 const pending=p.listModels(request().signal);await ready;g.revoke();await assert.rejects(pending);assert.equal(signal?.aborted,true);
});
test('gpt-4 family keeps system messages and long retry-after fails without early retry',async()=>{
 let body:any;const r=request();r.model='gpt-4.1';const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',fetch:async(_url,init)=>{body=JSON.parse(String(init?.body));return sse([{choices:[{index:0,delta:{},finish_reason:'stop'}]}]);}});await collect(p,r);assert.equal(body.messages[0].role,'system');
 let calls=0;const p2=new OpenAIProvider({privacyGate:gate(),getApiKey:()=> 'key',sleep:async()=>{throw Error('must not sleep');},fetch:async()=>{calls++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'Retry-After':'60'}});}});await assert.rejects(collect(p2));assert.equal(calls,1);
});
