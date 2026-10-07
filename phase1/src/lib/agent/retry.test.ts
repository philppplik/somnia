import test from 'node:test';
import assert from 'node:assert/strict';
import {abortableSleep, fetchProviderResponse, parseRetryAfter} from './retry';
import {AgentError, ProviderError, describeAgentError, toAgentError, readHttpError} from './errors';
const signal = () => new AbortController().signal;
const error = (status: number, message = '', retryAfter?: string) => new Response(JSON.stringify({error:{message}}), {status, headers: retryAfter ? {'retry-after':retryAfter} : {}});

test('Retry-After accepts seconds and HTTP dates without accepting negative delays', () => {
 const now = Date.parse('2026-10-07T08:00:00Z');
 assert.equal(parseRetryAfter('120', now),120000);
 assert.equal(parseRetryAfter('Wed, 07 Oct 2026 08:00:30 GMT',now),30000);
 for (const x of [null,'','-1','nonsense','Wed, 07 Oct 2026 07:00:00 GMT']) assert.equal(parseRetryAfter(x,now),undefined);
});
test('backoff grows with jitter and honors Retry-After minimum', async () => {
 let calls=0; const delays:number[]=[];
 const result = await fetchProviderResponse(async()=> ++calls <= 2 ? error(429,'too many requests','10') : new Response('ok'),signal(), {random:()=>1,sleep:async ms=>{delays.push(ms);}});
 assert.equal(await result.text(),'ok'); assert.deepEqual(delays,[10000,10000]); assert.equal(calls,3);
 calls=0;delays.length=0;
 await fetchProviderResponse(async()=> ++calls <= 3 ? error(503) : new Response('ok'),signal(),{random:()=>0,sleep:async ms=>{delays.push(ms);}});
 assert.deepEqual(delays,[1000,2000,4000]);
});
test('long cooldown is surfaced rather than truncated or retried early', async () => {
 let calls=0;
 await assert.rejects(fetchProviderResponse(async()=>{calls++;return error(429,'','120');},signal(),{sleep:async()=>assert.fail('must not wait')}), (e:AgentError)=>e.detail==='rate-limited' && e.retryAfterMs===120000 && /120 seconds/.test(describeAgentError(e)));
 assert.equal(calls,1);
});
test('quota and invalid keys are final, no raw body or key reaches UI', async () => {
 for (const [status,message,detail] of [[429,'insufficient_quota SECRET','quota'],[429,'Daily spending limit reached SECRET','quota'],[403,'quota exceeded SECRET','quota'],[401,'Bearer SECRET','auth'],[402,'balance low SECRET','credit']] as const) {
  let calls=0;
  await assert.rejects(fetchProviderResponse(async()=>{calls++;return error(status,message);},signal(),{sleep:async()=>assert.fail('no retry')}), (e:AgentError)=>e.detail===detail && !e.retryable && !/SECRET/.test(describeAgentError(e)+e.message));
  assert.equal(calls,1);
 }
});
test('network attempts are bounded; cancel during sleep prevents next request',async()=>{
 let calls=0;
 await assert.rejects(fetchProviderResponse(async()=>{calls++;throw TypeError('SECRET');},signal(),{maxRetries:2,sleep:async()=>{}}),(e:AgentError)=>e.detail==='network');
 assert.equal(calls,3);
 calls=0;const ac=new AbortController();
 await assert.rejects(fetchProviderResponse(async()=>{calls++;return error(503);},ac.signal,{sleep:async(ms,s)=>{ac.abort();await abortableSleep(ms,s);}}));
 assert.equal(calls,1);
 await assert.rejects(async()=>abortableSleep(10,AbortSignal.abort()));
});
test('Ollama taxonomy hides raw secrets and maps recoverable local failures',()=>{
 for (const [code,detail] of [['unreachable','network'],['model-not-found','model-not-found'],['protocol','protocol'],['timeout','timeout'],['not-local','consent']] as const) {
  const classified=toAgentError(new ProviderError(code,'SECRET'));
  assert.equal(classified.detail,detail);assert.doesNotMatch(describeAgentError(classified),/SECRET/);
 }
});
test('huge error body is read in a bounded prefix and reader is cancelled', async()=>{
 let cancelled=false;
 const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new TextEncoder().encode('x'.repeat(8192)));},cancel(){cancelled=true;}});
 await readHttpError(new Response(body,{status:500}));assert.equal(cancelled,true);
});
