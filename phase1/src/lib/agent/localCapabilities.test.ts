import test from 'node:test';import assert from 'node:assert/strict';
import {requireLocalCapabilities,validateImages} from './localCapabilities';
import {OllamaProvider,toOllamaMessages} from './providers/ollama';
import type {AgentProviderRequest} from './types';
const request=(tools=false,image=false):AgentProviderRequest=>({model:'m',messages:[{role:'user',content:'describe',...(image?{images:[{mime:'image/png' as const,base64:'aGVsbG8=',width:1,height:1,label:'fixture'}]}:{})}],tools:tools?[{name:'read',description:'Read',parameters:{type:'object'}}]:[],maxOutputTokens:5,signal:new AbortController().signal});
function fixture(capabilities:unknown,remote=false){const calls:string[]=[];const p=new OllamaProvider({maxRetries:0,fetch:async(url)=>{calls.push(url);return url.endsWith('/api/show')?Response.json({model_info:{architecture:'test'},capabilities,...(remote?{remote_host:'cloud'}:{})}):new Response('{"done":true}\n');}});return {p,calls};}
async function collect(p:ReturnType<typeof requireLocalCapabilities>,r:AgentProviderRequest){for await(const _ of p.stream(r)){}}
test('each tool request checks fresh local weights and explicit tool capability',async()=>{
 const {p,calls}=fixture(['completion','tools']);const checked=requireLocalCapabilities(p);await collect(checked,request(true));await collect(checked,request(true));assert.equal(calls.filter(v=>v.endsWith('/api/show')).length,4);assert.equal(calls.filter(v=>v.endsWith('/api/chat')).length,2);
});
test('missing tools, missing vision and remote aliases fail before chat',async()=>{
 for(const [caps,r,remote] of [[['completion'],request(true),false],[undefined,request(true),false],[['tools'],request(false,true),false],[['vision'],request(false,true),true]] as const){const {p,calls}=fixture(caps,remote);await assert.rejects(collect(requireLocalCapabilities(p,8192),r));assert.equal(calls.some(v=>v.endsWith('/api/chat')),false);}
});
test('vision requires explicit context and maps user images without silent omission',async()=>{
 const {p}=fixture(['vision']);await assert.rejects(collect(requireLocalCapabilities(p),request(false,true)),/context/);
 await collect(requireLocalCapabilities(p,8192),request(false,true));
 assert.deepEqual((toOllamaMessages(request(false,true).messages)[0] as {images:string[]}).images,['aGVsbG8=']);
 assert.throws(()=>validateImages([{role:'tool',content:'',images:request(false,true).messages[0].images}]));
 assert.throws(()=>validateImages([{role:'user',content:'',images:Array(5).fill(request(false,true).messages[0].images![0])}]));
});
test('capability show with no local metadata refuses tools',async()=>{
 let chat=false;const provider=new OllamaProvider({maxRetries:0,fetch:async url=>{if(url.endsWith('/api/chat'))chat=true;return Response.json({capabilities:['tools']});}});
 await assert.rejects(collect(requireLocalCapabilities(provider),request(true)));assert.equal(chat,false);
});
test('direct capability wrapper pins model, validated image, tool and output limit across async show',async()=>{let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let first=true,payload:any;const p=new OllamaProvider({maxRetries:0,fetch:async(url,init)=>{if(url.endsWith('/api/show')){if(first){first=false;enter();await gate;}return Response.json({model_info:{arch:'test'},capabilities:['tools','vision']});}payload=JSON.parse(String(init?.body));return new Response('{"done":true}\n');}});const r=request(true,true),pending=collect(requireLocalCapabilities(p,8192),r);await entered;r.model='unverified';r.messages[0].content='private replacement';r.messages[0].images![0].base64='not valid after original validation';r.tools[0].name='other';r.maxOutputTokens=999;release();await pending;assert.equal(payload.model,'m');assert.equal(payload.messages[0].content,'describe');assert.deepEqual(payload.messages[0].images,['aGVsbG8=']);assert.equal(payload.tools[0].function.name,'read');assert.equal(payload.options.num_predict,5);});
test('direct capability wrapper keeps original cancellation despite caller signal replacement',async()=>{let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);let chat=0;const p=new OllamaProvider({maxRetries:0,fetch:async(url)=>{if(url.endsWith('/api/show')){enter();await gate;return Response.json({model_info:{arch:'test'}});}chat++;return new Response('{"done":true}\n');}});const r=request(),c=new AbortController();r.signal=c.signal;const pending=collect(requireLocalCapabilities(p),r);await entered;c.abort();r.signal=new AbortController().signal;release();await assert.rejects(pending);assert.equal(chat,0);});
