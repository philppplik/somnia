import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JobScheduler} from './scheduler';
const tick=()=>new Promise<void>(r=>setImmediate(r));
test('lease outlives views; abort retains reservation until acknowledged',async()=>{
 const s=new JobScheduler({backgroundConcurrency:1});const a=await s.acquire({kind:'export',priority:2,resources:['video.engine']});
 assert.equal(s.hasLease('video.engine'),true);assert.equal(s.cancel(a.id),true);assert.equal(a.signal.aborted,true);assert.equal(s.hasLease('video.engine'),true);
 a.release();a.release();assert.equal(s.hasLease('video.engine'),false);assert.equal(s.list()[0].state,'cancelled');
});
test('P0 proceeds while background slots occupied, P2 precedes maintenance',async()=>{
 const s=new JobScheduler({backgroundConcurrency:1});const first=await s.acquire({kind:'export',priority:2});
 const order:string[]=[];const maintenance=s.run({kind:'maintenance',priority:3},async()=>{order.push('maintenance');});
 const exp=s.run({kind:'export',priority:2},async()=>{order.push('export');});
 await s.run({kind:'playback',priority:0},async()=>{order.push('playback');});
 assert.deepEqual(order,['playback']);first.release();await Promise.all([maintenance,exp]);assert.deepEqual(order,['playback','export','maintenance']);
});
test('singleton dependencies serialize even across different lanes; queued resources stay needed',async()=>{
 const s=new JobScheduler();const a=await s.acquire({kind:'export',priority:2,exclusive:['engine']});let ready=false;
 const b=s.acquire({kind:'activation',priority:1,exclusive:['engine']}).then(l=>{ready=true;return l;});await tick();assert.equal(ready,false);assert.equal(s.needsResource('engine'),true);a.release();(await b).release();assert.equal(s.needsResource('engine'),false);
});
test('queue, bytes and history bounded; queued abort never runs',async()=>{
 const s=new JobScheduler({maxQueued:1,maxBytes:10,historyLimit:2});const a=await s.acquire({kind:'export',priority:2,estimatedBytes:10});
 const c=new AbortController();const queued=s.acquire({kind:'export',priority:2,estimatedBytes:1,signal:c.signal});const rejected=assert.rejects(queued);await assert.rejects(s.acquire({kind:'export',priority:2}));
 c.abort();await rejected;await assert.rejects(s.acquire({kind:'export',priority:2,estimatedBytes:11}));a.release();
 for(let i=0;i<5;i++)(await s.acquire({kind:'playback',priority:0})).release();assert.equal(s.list().length,2);
});
test('pressure pauses P3, critical stops new P2 but not real time',async()=>{
 const s=new JobScheduler();s.setPressure('critical');let started=false;
 const queued=s.run({kind:'export',priority:2},async()=>{started=true;});await tick();assert.equal(started,false);
 await s.run({kind:'playback',priority:0},async()=>{});s.setPressure('normal');await queued;
 s.setInteracting(true);const m=s.run({kind:'maintenance',priority:3},async()=>{});await tick();assert.equal(s.list().find(x=>x.kind==='maintenance')?.state,'queued');s.setInteracting(false);await m;
});
test('failures release dependencies and cancellation does not claim success',async()=>{
 const s=new JobScheduler();await assert.rejects(s.run({kind:'export',priority:2,resources:['r']},async()=>{throw Error('failed');}));assert.equal(s.hasLease('r'),false);assert.equal(s.list()[0].state,'failed');
 const abort=new AbortController();await assert.rejects(s.run({kind:'ai',priority:2,signal:abort.signal},async()=>{abort.abort();return 1;}));assert.equal(s.list().at(-1)?.state,'cancelled');
});
