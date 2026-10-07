import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ClaudeProvider} from './claude';
import {AgentPrivacyGate, AgentConsentRequiredError} from '../privacy';
import {AgentError} from '../errors';
import type {AgentProviderRequest, AgentProviderEvent} from '../types';
function gate(consent = true) {
 const store = new Map<string,string>();
 const gate = new AgentPrivacyGate(()=>({getItem:k=>store.get(k)??null,setItem:(k,v)=>{store.set(k,v);},removeItem:k=>{store.delete(k);}}));
 if(consent)gate.grantExplicitConsent();return gate;
}
const request = ():AgentProviderRequest=>({model:'test-model',messages:[{role:'system',content:'Rules'},{role:'user',content:'Hi'}],tools:[],maxOutputTokens:128,signal:new AbortController().signal});
const start = {type:'message_start',message:{usage:{input_tokens:12,output_tokens:1}}};
const end = [{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:7}},{type:'message_stop'}];
function sse(events:unknown[],stride=3) {
 const data = new TextEncoder().encode(': comment\r\n\r\n'+events.map(e=>'event: '+(e as {type:string}).type+'\r\ndata: '+JSON.stringify(e)+'\r\n\r\n').join(''));
 return new Response(new ReadableStream({start(c){for(let i=0;i<data.length;i+=stride)c.enqueue(data.slice(i,i+stride));c.close();}}),{headers:{'content-type':'text/event-stream'}});
}
async function collect(provider:ClaudeProvider, req=request()):Promise<AgentProviderEvent[]>{const events:AgentProviderEvent[]=[];for await(const e of provider.stream(req))events.push(e);return events;}
function adapter(fetch:typeof globalThis.fetch, extras:Partial<ConstructorParameters<typeof ClaudeProvider>[0]>={}) {return new ClaudeProvider({getApiKey:()=> 'fixture-key',privacyGate:gate(),fetch,maxRetries:0,...extras});}
const textEvents = [start,{type:'ping'},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Hallo 🌍'}},{type:'content_block_stop',index:0},...end];
test('Claude serializes official Messages schema, auth headers and UTF-8 SSE',async()=>{
 let payload:any,headers:any;
 const events=await collect(adapter(async(url,init)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init?.redirect,'error');payload=JSON.parse(init?.body as string);headers=init?.headers;return sse(textEvents);}));
 assert.equal(payload.system[0].text,'Rules');assert.equal(payload.messages[0].role,'user');assert.equal(payload.max_tokens,128);assert.equal(payload.stream,true);
 assert.equal(headers['x-api-key'],'fixture-key');assert.equal(headers['anthropic-version'],'2023-06-01');assert.equal(headers['anthropic-dangerous-direct-browser-access'],undefined);
 assert.ok(events.some(e=>e.type==='text'&&e.text==='Hallo 🌍'));assert.deepEqual(events.at(-1),{type:'finish',reason:'stop'});
 assert.deepEqual(events.filter(e=>e.type==='usage').map(e=>e.usage),[{inputTokens:12,outputTokens:1},{inputTokens:undefined,outputTokens:7}]);
});
test('Claude groups parallel tool results and translates tool definitions and arguments',async()=>{
 const req=request();req.tools=[{name:'read_file',description:'read',parameters:{type:'object'}}];req.messages=[...req.messages,{role:'assistant',content:'',toolCalls:[{id:'t1',name:'read_file',arguments:'{"path":"a"}'},{id:'t2',name:'read_file',arguments:'{}'}]},{role:'tool',toolCallId:'t1',content:'a text'},{role:'tool',toolCallId:'t2',content:'b text'}];
 const p=adapter(async(_,init)=>{const b=JSON.parse(init?.body as string);assert.deepEqual(b.tools,[{name:'read_file',description:'read',input_schema:{type:'object'}}]);assert.deepEqual(b.messages[1].content[0],{type:'tool_use',id:'t1',name:'read_file',input:{path:'a'}});assert.equal(b.messages[2].content.length,2);return sse([start,{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t3',name:'read_file',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"path":'}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'"c"}'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'}]);});
 const events=await collect(p,req);assert.deepEqual(events.at(-1),{type:'finish',reason:'tool_calls'});assert.equal(events.filter(e=>e.type==='tool-call').map(e=>e.arguments??'').join(''),'{"path":"c"}');
});
test('empty tool input emits valid {} instead of no arguments',async()=>{
 const events=await collect(adapter(async()=>sse([start,{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'t',name:'noop',input:{}}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'}},{type:'message_stop'}])));
 assert.ok(events.some(e=>e.type==='tool-call'&&e.arguments==='{}'));
});
test('catalog pagination is guarded, non-inference, with live names and no frozen models',async()=>{
 const urls:string[]=[];
 const p=adapter(async(url,init)=>{urls.push(String(url));assert.equal(init?.method,'GET');return Response.json(urls.length===1?{data:[{id:'m1',display_name:'One',created_at:'date'}],has_more:true,last_id:'m1'}:{data:[{id:'m2',display_name:'Two'}],has_more:false});});
 assert.deepEqual(await p.listModels(request().signal),[{id:'m1',name:'One',createdAt:'date'},{id:'m2',name:'Two'}]);assert.match(urls[1],/after_id=m1/);
});
test('consent missing blocks key resolution and every network call including discovery',async()=>{
 let keys=0,calls=0;const p=adapter(async()=>{calls++;return sse(textEvents);},{privacyGate:gate(false),getApiKey:()=>{keys++;return 'secret';}});
 await assert.rejects(collect(p),AgentConsentRequiredError);await assert.rejects(p.listModels(request().signal),AgentConsentRequiredError);assert.equal(keys,0);assert.equal(calls,0);
});
test('credential failures are sanitized',async()=>{
 const p=adapter(async()=>{throw Error('should not fetch');},{getApiKey:()=>{throw Error('secret-store-private-text');}});
 await assert.rejects(collect(p),(e:AgentError)=>e.detail==='auth'&&!e.message.includes('secret-store-private-text'));
});
for(const [status,detail] of [[401,'auth'],[403,'auth'],[404,'model-not-found'],[413,'context'],[429,'rate-limited'],[529,'server']] as const)test(`HTTP ${status} maps safely to ${detail}`,async()=>{
 await assert.rejects(collect(adapter(async()=>new Response('private secret',{status}))),(e:AgentError)=>e.detail===detail&&!e.message.includes('secret'));
});
test('rate limit retries only before stream, respects retry-after and resolves key once',async()=>{
 let calls=0,keys=0;const delays:number[]=[];
 const p=adapter(async()=>++calls===1?new Response('private',{status:429,headers:{'retry-after':'2'}}):sse(textEvents),{maxRetries:3,getApiKey:()=>{keys++;return 'key';},sleep:async(ms)=>{delays.push(ms);}});
 await collect(p);assert.equal(calls,2);assert.equal(keys,1);assert.deepEqual(delays,[2000]);
});
test('stream overload after text rejects without replaying billable generation',async()=>{
 let calls=0;await assert.rejects(collect(adapter(async()=>{calls++;return sse([...textEvents.slice(0,-2),{type:'error',error:{type:'overloaded_error',message:'secret'}}]);},{maxRetries:3})),(e:AgentError)=>e.detail==='server'&&!e.message.includes('secret'));assert.equal(calls,1);
});
test('truncation, malformed JSON and unsupported thinking fail closed',async()=>{
 await assert.rejects(collect(adapter(async()=>sse(textEvents.slice(0,-1)))),(e:AgentError)=>e.detail==='protocol');
 await assert.rejects(collect(adapter(async()=>new Response('data: nope\n\n',{headers:{'content-type':'text/event-stream'}}))),(e:AgentError)=>e.detail==='protocol');
 await assert.rejects(collect(adapter(async()=>sse([start,{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'hidden',signature:'sig'}}]))),(e:AgentError)=>e.detail==='protocol');
});
test('stop reasons normalize to session contract',async()=>{
 for(const [reason,expected] of [['max_tokens','length'],['refusal','content_filter'],['stop_sequence','stop'],['model_context_window_exceeded','length']]){
 const events=await collect(adapter(async()=>sse([start,{type:'message_delta',delta:{stop_reason:reason}},{type:'message_stop'}])));assert.deepEqual(events.at(-1),{type:'finish',reason:expected});
 }
});
test('revocation after one output suppresses buffered events and cancels stream',async()=>{
 const privacyGate=gate();const p=adapter(async()=>sse(textEvents),{privacyGate});const it=p.stream(request());await it.next();privacyGate.revoke();await assert.rejects(it.next(),AgentConsentRequiredError);
});
test('caller abort while waiting for stream data cancels the reader promptly',async()=>{
 let cancelled=false;const controller=new AbortController();const req={...request(),signal:controller.signal};
 const p=adapter(async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}}));
 const pending=collect(p,req);setTimeout(()=>controller.abort(),10);await assert.rejects(pending);assert.equal(cancelled,true);
});
test('malformed tool arguments are rejected before network disclosure',async()=>{
 let calls=0;const req=request();req.messages=[...req.messages,{role:'assistant',content:'',toolCalls:[{id:'t',name:'f',arguments:'[]'}]}];
 await assert.rejects(collect(adapter(async()=>{calls++;return sse(textEvents);}),req),AgentError);assert.equal(calls,0);
});
test('catalog loops fail rather than fetching forever',async()=>{
 let calls=0;const p=adapter(async()=>{calls++;return Response.json({data:[{id:'m',display_name:'M'}],has_more:true,last_id:'m'});});await assert.rejects(p.listModels(request().signal),AgentError);assert.equal(calls,2);
});
test('explicit browser prototype option sets the official direct browser header',async()=>{
 await collect(adapter(async(_,init)=>{assert.equal((init?.headers as Record<string,string>)['anthropic-dangerous-direct-browser-access'],'true');return sse(textEvents);},{allowBrowserAccess:true}));
});
test('unknown future event types are ignored, unsupported stop reasons reject',async()=>{
 const events=await collect(adapter(async()=>sse([start,{type:'future_event',data:'x'},...end])));assert.deepEqual(events.at(-1),{type:'finish',reason:'stop'});
 await assert.rejects(collect(adapter(async()=>sse([start,{type:'message_delta',delta:{stop_reason:'pause_turn'}},{type:'message_stop'}]))),AgentError);
});
test('reader transport errors never leak private exception text',async()=>{
 await assert.rejects(collect(adapter(async()=>new Response(new ReadableStream({start(c){c.error(Error('secret-prompt-transport'));}}),{headers:{'content-type':'text/event-stream'}}))),(e:AgentError)=>e.detail==='network'&&!e.message.includes('secret-prompt'));
});
test('consumer return cancels in-flight provider stream',async()=>{
 let cancelled=false;const data=new TextEncoder().encode('data: '+JSON.stringify(start)+'\n\n');
 const p=adapter(async()=>new Response(new ReadableStream({start(c){c.enqueue(data);},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}}));const iterator=p.stream(request());await iterator.next();await iterator.return(undefined);assert.equal(cancelled,true);
});
