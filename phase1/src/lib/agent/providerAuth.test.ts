import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_ENDPOINTS,ProviderAuthError,validateProviderKey,testProviderAuthentication,loadProviderKey,saveProviderKey,deleteProviderKey,type AuthProvider} from './providerAuth';
import {AgentPrivacyGate} from './privacy';
const gate=()=>{const data=new Map<string,string>();const g=new AgentPrivacyGate(()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}}));g.grantExplicitConsent();return g;};
const code=(value:string)=>(e:unknown)=>e instanceof ProviderAuthError&&e.code===value&&!e.message.includes('fixture-secret');
test('key validation trims edges, rejects control/whitespace/oversize without exposing input',()=>{
 assert.equal(validateProviderKey('  fixture-secret  '),'fixture-secret');
 for(const value of ['',' \n','fixture-secret\nforged','fixture secret','x'.repeat(8193)])assert.throws(()=>validateProviderKey(value),code('invalid-key'));
});
for(const provider of ['openrouter','openai','claude','ollama'] as AuthProvider[])test(`${provider}: fixed non-inference endpoint and correct authentication`,async()=>{
 let calls=0;
 await testProviderAuthentication(provider,'fixture-secret',{gate:gate(),fetch:async(url,init)=>{
  calls++;assert.equal(url,AUTH_ENDPOINTS[provider]);assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');
  const headers=new Headers(init?.headers);
  if(provider==='claude'){assert.equal(headers.get('x-api-key'),'fixture-secret');assert.equal(headers.get('anthropic-version'),'2023-06-01');}
  else if(provider!=='ollama')assert.equal(headers.get('Authorization'),'Bearer fixture-secret');else assert.equal(headers.get('Authorization'),null);
  return Response.json(provider==='ollama'?{models:[]}:provider==='openrouter'?{data:{label:'not-returned'}}:{data:[]});
 }});assert.equal(calls,1);
});
test('cloud consent denial precedes any fetch; local connection needs no cloud consent',async()=>{
 const g=new AgentPrivacyGate(()=>undefined);let calls=0;
 const f:typeof fetch=async()=>{calls++;return Response.json({models:[]});};
 await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:g,fetch:f}),code('consent'));assert.equal(calls,0);
 await testProviderAuthentication('ollama','',{gate:g,fetch:f});assert.equal(calls,1);
});
for(const [status,error] of [[401,'invalid-key'],[403,'invalid-key'],[429,'rate-limit'],[503,'provider-unavailable'],[400,'protocol']] as const)test(`HTTP ${status} has safe error and no retries`,async()=>{
 let calls=0;await assert.rejects(testProviderAuthentication('openrouter','fixture-secret',{gate:gate(),fetch:async()=>{calls++;return new Response('fixture-secret',{status});}}),code(error));assert.equal(calls,1);
});
test('network and protocol failures have distinct safe messages',async()=>{
 await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:gate(),fetch:async()=>{throw Error('fixture-secret');}}),code('network'));
 for(const data of [{data:{}},null,{not:'models'}])await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:gate(),fetch:async()=>Response.json(data)}),code('protocol'));
});
test('timeout and cancellation abort the request',async()=>{
 const f:typeof fetch=async(_u,init)=>new Promise((_r,reject)=>init!.signal!.addEventListener('abort',()=>reject(Error('fixture-secret')),{once:true}));
 await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:gate(),fetch:f,timeoutMs:5}),code('timeout'));
 const abort=new AbortController();abort.abort();
 await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:gate(),fetch:f,signal:abort.signal}),code('cancelled'));
});
test('revocation during verification cannot accept a result',async()=>{
 const g=gate();await assert.rejects(testProviderAuthentication('openai','fixture-secret',{gate:g,fetch:async()=>{g.revoke();return Response.json({data:[]});}}),code('consent'));
});
test('browser key rotation/deletion is isolated by provider and session-only',async()=>{
 await saveProviderKey('openrouter','fixture-old');await saveProviderKey('openai','fixture-new');
 assert.equal(await loadProviderKey('openrouter'),'fixture-old');assert.equal(await loadProviderKey('openai'),'fixture-new');
 await saveProviderKey('openrouter','fixture-rotated');await deleteProviderKey('openai');
 assert.equal(await loadProviderKey('openai'),'');assert.equal(await loadProviderKey('openrouter'),'fixture-rotated');
 await deleteProviderKey('openrouter');assert.equal(await loadProviderKey('openrouter'),'');
});
test('desktop store uses per-provider commands; locked errors never leak; presence is secret-free',async()=>{
 const previousTauri=Object.getOwnPropertyDescriptor(globalThis,'isTauri');Object.defineProperty(globalThis,'isTauri',{configurable:true,value:true});const previous=Object.getOwnPropertyDescriptor(globalThis,'window');const calls:{command:string;args:any}[]=[];let locked=false;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{isTauri:true,__TAURI_INTERNALS__:{invoke:async(command:string,args:any)=>{calls.push({command,args});if(locked)throw 'fixture-secret-backend-error';return command==='agent_key_status'?true:command==='agent_key_load'?'fixture-secret':'';}}}});
 try{
  const {hasProviderKey}=await import('./providerAuth');
  assert.equal(await hasProviderKey('claude'),true);assert.equal(calls[0].command,'agent_key_status');assert.deepEqual(calls[0].args,{provider:'claude'});
  await saveProviderKey('openai','fixture-secret');assert.deepEqual(calls.at(-1),{command:'agent_key_save',args:{provider:'openai',apiKey:'fixture-secret'}});
  assert.equal(await loadProviderKey('openai'),'fixture-secret');await deleteProviderKey('openai');assert.equal(calls.at(-1)?.command,'agent_key_delete');
  locked=true;for(const task of [()=>hasProviderKey('claude'),()=>loadProviderKey('openai'),()=>saveProviderKey('claude','fixture-secret'),()=>deleteProviderKey('claude')])await assert.rejects(task(),code('keystore-locked'));
 }finally{if(previousTauri)Object.defineProperty(globalThis,'isTauri',previousTauri);else Reflect.deleteProperty(globalThis,'isTauri');if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
