import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenAIProvider,OPENAI_RESPONSES_ENDPOINT,OPENAI_MODELS_ENDPOINT} from './openAI';
import {OPENAI_ACCOUNT_OAUTH_CONFIG,openAIAccountConfigStatus,requireOpenAIAccountConfig,assertUsableAccountToken,toAccountAuthError} from './openAIAccount';
import type {OpenAIAccountAuth} from './openAIAccount';
import {AgentPrivacyGate} from './privacy';
import {AgentError,describeAgentError} from './errors';
import type {AgentProviderRequest,AgentProviderEvent} from './types';

const gate=()=>{const values=new Map<string,string>();const g=new AgentPrivacyGate(()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}}));g.grantExplicitConsent();return g;};
const request=():AgentProviderRequest=>({model:'gpt-5',messages:[{role:'system',content:'instructions'},{role:'user',content:'hello'}],tools:[],maxOutputTokens:100,signal:new AbortController().signal});
const sse=(events:unknown[])=>{const bytes=new TextEncoder().encode(events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`).join(''));let i=0;return new Response(new ReadableStream({pull(c){if(i===bytes.length)c.close();else c.enqueue(bytes.slice(i,++i));}}),{headers:{'Content-Type':'text/event-stream'}});};
const account=(token='account-token',hooks:{onGet?:()=>void;onRefresh?:()=>void;refreshError?:unknown;getError?:unknown;refreshToken?:string}={}):OpenAIAccountAuth=>({
 async getAccessToken(){hooks.onGet?.();if(hooks.getError)throw hooks.getError;return token;},
 async refresh(){hooks.onRefresh?.();if(hooks.refreshError)throw hooks.refreshError;return hooks.refreshToken??'refreshed-token';},
});
async function collect(p:OpenAIProvider,r=request()){const events:AgentProviderEvent[]=[];for await(const e of p.stream(r))events.push(e);return events;}
const completed=(extra:Record<string,unknown>={})=>({type:'response.completed',response:{status:'completed',usage:{input_tokens:3,output_tokens:5},...extra}});
const textDelta=(t:string)=>({type:'response.output_text.delta',output_index:0,delta:t});

test('account mode: Responses wire format, instructions not system, restricted fields absent, events mapped',async()=>{
 let body:any;let auth='';const r=request();
 r.tools=[{name:'read_file',description:'Read file',parameters:{type:'object'}}];
 r.messages=[...r.messages,{role:'assistant',content:'',toolCalls:[{id:'call_1',name:'read_file',arguments:'{"a":1}'}]},{role:'tool',content:'result',toolCallId:'call_1'}];
 const p=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async(url,init)=>{assert.equal(url,OPENAI_RESPONSES_ENDPOINT);auth=String((init?.headers as any).Authorization);body=JSON.parse(String(init?.body));return sse([
  textDelta('Hallo'),
  {type:'response.output_item.added',output_index:1,item:{type:'function_call',call_id:'call_9',name:'read_file',arguments:''}},
  {type:'response.function_call_arguments.delta',output_index:1,delta:'{"x"'},
  {type:'response.function_call_arguments.delta',output_index:1,delta:'":2}'},
  completed(),
 ]);}});
 const events=await collect(p,r);
 assert.equal(auth,'Bearer account-token');
 assert.equal(body.model,'gpt-5');assert.equal(body.store,false);assert.equal(body.stream,true);
 assert.equal(body.instructions,'instructions');
 assert.equal(body.max_output_tokens,undefined);assert.equal(body.temperature,undefined);assert.equal(body.top_p,undefined);assert.equal(body.previous_response_id,undefined);assert.equal(body.metadata,undefined);assert.equal(body.messages,undefined);
 assert.deepEqual(body.input[0],{role:'user',content:[{type:'input_text',text:'hello'}]});
 assert.deepEqual(body.input[1],{type:'function_call',call_id:'call_1',name:'read_file',arguments:'{"a":1}'});
 assert.deepEqual(body.input[2],{type:'function_call_output',call_id:'call_1',output:'result'});
 assert.deepEqual(body.tools,[{type:'function',name:'read_file',description:'Read file',parameters:{type:'object'}}]);
 assert.deepEqual(events[0],{type:'text',text:'Hallo'});
 assert.deepEqual(events[1],{type:'tool-call',index:1,id:'call_9',name:'read_file'});
 assert.deepEqual(events[2],{type:'tool-call',index:1,arguments:'{"x"'});
 assert.deepEqual(events[3],{type:'tool-call',index:1,arguments:'":2}'});
 assert.deepEqual(events.at(-2),{type:'usage',usage:{inputTokens:3,outputTokens:5}});
 assert.deepEqual(events.at(-1),{type:'finish',reason:'tool_calls'});
});

test('401 triggers exactly one refresh and one retry with the new token; a second 401 is an account-auth failure',async()=>{
 const auths:string[]=[];let refreshes=0;
 const p=new OpenAIProvider({privacyGate:gate(),account:account('old-token',{onRefresh:()=>{refreshes++;},refreshToken:'new-token'}),fetch:async(_u,init)=>{auths.push(String((init?.headers as any).Authorization));return auths.length===1?Response.json({error:{code:'invalid_token'}},{status:401}):sse([textDelta('ok'),completed()]);}});
 const events=await collect(p);
 assert.equal(refreshes,1);assert.deepEqual(auths,['Bearer old-token','Bearer new-token']);
 assert.deepEqual(events.at(-1),{type:'finish',reason:'stop'});

 let calls=0;refreshes=0;
 const stuck=new OpenAIProvider({privacyGate:gate(),account:account('old-token',{onRefresh:()=>{refreshes++;}}),fetch:async()=>{calls++;return Response.json({error:{code:'subscription_sharing_invalid_user'}},{status:401});}});
 await assert.rejects(collect(stuck),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth'&&!e.retryable);
 assert.equal(calls,2);assert.equal(refreshes,1);
 assert.match(describeAgentError(new AgentError('provider-error','account-auth','x')),/Reconnect the account/);
});

test('failed or unusable refresh is an honest redacted account error, never a silent API-key fallback',async()=>{
 let calls=0;
 const p=new OpenAIProvider({privacyGate:gate(),account:account('old-token',{refreshError:Error('PRIVATE_STORE_DETAIL')}),fetch:async()=>{calls++;return Response.json({},{status:401});}});
 await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth'&&!e.message.includes('PRIVATE'));
 assert.equal(calls,1);
 const bad=new OpenAIProvider({privacyGate:gate(),account:account('old-token',{refreshToken:'bad\ntoken'}),fetch:async()=>{calls++;return Response.json({},{status:401});}});
 await assert.rejects(collect(bad),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth');
 assert.equal(calls,2);
 const gone=new OpenAIProvider({privacyGate:gate(),account:account('x',{getError:Error('PRIVATE')}),fetch:async()=>{calls++;return sse([]);}});
 await assert.rejects(collect(gone),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth'&&!e.message.includes('PRIVATE'));
 assert.equal(calls,2);
});

test('API-key mode never refreshes and keeps its existing auth error shape',async()=>{
 let calls=0;
 const p=new OpenAIProvider({privacyGate:gate(),getApiKey:()=>'key',maxRetries:0,fetch:async()=>{calls++;return Response.json({error:{code:'invalid_api_key'}},{status:401});}});
 await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&e.detail==='auth');
 assert.equal(calls,1);
});

test('SIWC error codes map honestly: eligibility, usage limit (no retry), capability, route',async()=>{
 const cases:[string,number,string][]=[
  ['subscription_sharing_user_not_eligible',403,'not-eligible'],
  ['subscription_sharing_usage_limit_exceeded',429,'usage-limit'],
  ['subscription_sharing_unsupported_capability',400,'no-tool-support'],
  ['subscription_sharing_route_not_supported',403,'model-not-found'],
 ];
 for(const[code,status,detail]of cases){let calls=0;
  const p=new OpenAIProvider({privacyGate:gate(),account:account(),sleep:async()=>{},fetch:async()=>{calls++;return Response.json({error:{code,message:'PRIVATE'}},{status});}});
  await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&e.detail===detail&&!e.retryable&&!e.message.includes('PRIVATE'));
  assert.equal(calls,1,`${code} must not be retried`);}
 for(const code of ['subscription_sharing_usage_unavailable','subscription_sharing_user_unavailable']){let calls=0;
  const p=new OpenAIProvider({privacyGate:gate(),account:account(),sleep:async()=>{},fetch:async()=>{calls++;return Response.json({error:{code}},{status:503});}});
  await assert.rejects(collect(p),(e:unknown)=>e instanceof AgentError&&e.detail==='server'&&e.retryable);
  assert.equal(calls,4,`${code} is retryable with bounded backoff`);}
 assert.match(describeAgentError(new AgentError('provider-error','not-eligible','x')),/Plus or Pro/);
 assert.match(describeAgentError(new AgentError('provider-error','usage-limit','x')),/usage settings/);
});

test('stream-embedded errors and terminal semantics: failed event, missing terminal, incomplete, refusal',async()=>{
 const failed=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([{type:'response.failed',response:{error:{code:'subscription_sharing_invalid_user',message:'PRIVATE'}}}])});
 await assert.rejects(collect(failed),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth'&&!e.message.includes('PRIVATE'));
 const noTerminal=new OpenAIProvider({privacyGate:gate(),account:account(),maxRetries:0,fetch:async()=>sse([textDelta('partial')])});
 await assert.rejects(collect(noTerminal),(e:unknown)=>e instanceof AgentError&&e.detail==='protocol'&&e.retryable);
 const incomplete=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([textDelta('x'),{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}}])});
 await assert.rejects(collect(incomplete),(e:unknown)=>e instanceof AgentError&&e.code==='limit'&&e.detail==='output-tokens');
 const filtered=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'content_filter'}}}])});
 await assert.rejects(collect(filtered),(e:unknown)=>e instanceof AgentError&&e.detail==='moderation');
 const refusal=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([{type:'response.refusal.delta',output_index:0,delta:'no'},completed()])});
 await assert.rejects(collect(refusal),(e:unknown)=>e instanceof AgentError&&e.detail==='moderation');
 const errorEvent=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([{type:'error',code:'subscription_sharing_usage_limit_exceeded'}])});
 await assert.rejects(collect(errorEvent),(e:unknown)=>e instanceof AgentError&&e.detail==='usage-limit');
});

test('arguments.done without deltas still delivers tool arguments; duplicate terminal is rejected',async()=>{
 const p=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([
  {type:'response.output_item.added',output_index:0,item:{type:'function_call',call_id:'c',name:'f',arguments:''}},
  {type:'response.function_call_arguments.done',output_index:0,arguments:'{"full":true}'},
  completed(),
 ])});
 const events=await collect(p);
 assert.deepEqual(events[1],{type:'tool-call',index:0,arguments:'{"full":true}'});
 const dup=new OpenAIProvider({privacyGate:gate(),account:account(),fetch:async()=>sse([completed(),completed()])});
 await assert.rejects(collect(dup),(e:unknown)=>e instanceof AgentError&&e.detail==='protocol');
});

test('concurrent 401s share a single refresh (single-flight)',async()=>{
 let refreshes=0;let release!:()=>void;const gate2=new Promise<void>(r=>{release=r;});
 const src:OpenAIAccountAuth={async getAccessToken(){return 'old';},async refresh(){refreshes++;await gate2;return 'new';}};
 let first401s=0;
 const fetchImpl:typeof fetch=async(_u,init)=>{const auth=String((init?.headers as any).Authorization);if(auth==='Bearer old'){first401s++;await gate2;return Response.json({},{status:401});}return sse([textDelta('ok'),completed()]);};
 const a=new OpenAIProvider({privacyGate:gate(),account:src,fetch:fetchImpl});
 const b=new OpenAIProvider({privacyGate:gate(),account:src,fetch:fetchImpl});
 void a; // provider-level dedupe is per instance; share one instance for the race
 const shared=new OpenAIProvider({privacyGate:gate(),account:src,fetch:fetchImpl});
 const p1=collect(shared);const p2=collect(shared);
 while(first401s<2)await new Promise(r=>setTimeout(r,1));
 release();
 await p1;await p2;
 assert.equal(refreshes,1);
 void b;
});

test('model discovery reuses refresh-on-401 and account bearer',async()=>{
 const auths:string[]=[];
 const p=new OpenAIProvider({privacyGate:gate(),account:account('old',{refreshToken:'new'}),fetch:async(url,init)=>{assert.equal(url,OPENAI_MODELS_ENDPOINT);auths.push(String((init?.headers as any).Authorization));return auths.length===1?Response.json({},{status:401}):Response.json({object:'list',data:[{id:'m',owned_by:'openai',created:1}]});}});
 assert.deepEqual(await p.listModels(request().signal),[{id:'m',ownedBy:'openai',created:1}]);
 assert.deepEqual(auths,['Bearer old','Bearer new']);
});

test('consent denial touches neither token source nor transport',async()=>{
 let touched=false;
 const p=new OpenAIProvider({privacyGate:new AgentPrivacyGate(()=>undefined),account:{async getAccessToken(){touched=true;return 't';},async refresh(){touched=true;return 't';}},fetch:async()=>{touched=true;return sse([]);}});
 await assert.rejects(collect(p),/consent/);await assert.rejects(p.listModels(request().signal),/consent/);
 assert.equal(touched,false);
});

test('constructor enforces exactly one auth method and HTTPS endpoint overrides',async()=>{
 assert.throws(()=>new OpenAIProvider({getApiKey:()=>'k',account:account()}),/exactly one/);
 assert.throws(()=>new OpenAIProvider({}),/exactly one/);
 assert.throws(()=>new OpenAIProvider({account:account(),endpoints:{chat:'http://insecure.example/v1/responses'}}),/HTTPS/);
 assert.equal(new OpenAIProvider({account:account()}).id,'openai');
});

test('account config: shipped SIWC values validate; tampered issuer fails closed',()=>{
 const status=openAIAccountConfigStatus();
 assert.equal(status.configured,true,status.missing.join(','));
 assert.equal(OPENAI_ACCOUNT_OAUTH_CONFIG.authorizeEndpoint,'https://auth.openai.com/api/accounts/authorize');
 assert.equal(OPENAI_ACCOUNT_OAUTH_CONFIG.issuer,'https://auth.openai.com');
 const tampered={...OPENAI_ACCOUNT_OAUTH_CONFIG,issuer:'https://auth0.openai.com'};
 assert.deepEqual(openAIAccountConfigStatus(tampered).missing,['issuer']);
 assert.throws(()=>requireOpenAIAccountConfig(tampered),/issuer/);
 const broken={...OPENAI_ACCOUNT_OAUTH_CONFIG,clientId:'x',authorizeEndpoint:'http://x',scopes:[]}as any;
 const s=openAIAccountConfigStatus(broken);assert.ok(s.missing.includes('authorizeEndpoint')&&s.missing.includes('scopes'));
});

test('token hygiene and error mapping helpers',()=>{
 assert.equal(assertUsableAccountToken(' abc '),'abc');
 for(const bad of ['','   ','a\nb','x'.repeat(9000),123])assert.throws(()=>assertUsableAccountToken(bad),(e:unknown)=>e instanceof AgentError&&e.detail==='account-auth');
 const mapped=toAccountAuthError(Error('PRIVATE'));assert.equal(mapped.detail,'account-auth');assert.ok(!mapped.message.includes('PRIVATE'));
 const passthrough=new AgentError('limit','timeout','kept');assert.equal(toAccountAuthError(passthrough),passthrough);
});
