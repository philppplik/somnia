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

test('byte envelope applies across lanes; cancellation holds bytes until release', async () => {
 const s=new JobScheduler({maxBytes:10});
 const a=await s.acquire({kind:'export',priority:2,estimatedBytes:8});
 const b=s.acquire({kind:'save',priority:0,estimatedBytes:3});
 assert.equal(s.reservedBytes(),8);
 assert.equal(s.list().find(r=>r.kind==='save')?.state,'queued');
 s.cancel(a.id);assert.equal(s.reservedBytes(),8);
 assert.equal(s.list().find(r=>r.id===a.id)?.cancellationRequested,true);
 a.release();const next=await b;assert.equal(s.reservedBytes(),3);next.release();assert.equal(s.reservedBytes(),0);
});

test('live profile shrink retains active and queued reservations; expansion resumes', async () => {
 const s=new JobScheduler({maxBytes:20});
 const a=await s.acquire({kind:'export',priority:2,estimatedBytes:12});
 const b=s.acquire({kind:'export',priority:2,estimatedBytes:11});
 s.setAdmission({maxBytes:10,backgroundConcurrency:1,pressure:'normal'});
 assert.equal(s.reservedBytes(),12);assert.equal(a.signal.aborted,false);
 a.release();assert.equal(s.list().find(r=>r.kind==='export'&&r.state==='queued')?.estimatedBytes,11);
 await assert.rejects(s.acquire({kind:'export',priority:2,estimatedBytes:11}),/budget/);
 s.setAdmission({maxBytes:20,backgroundConcurrency:2,pressure:'critical'});
 assert.equal(s.list().find(r=>r.state==='queued')?.estimatedBytes,11);
 s.setPressure('normal');(await b).release();
});

test('aging allows older maintenance ahead of fresh P2 when a slot opens', async () => {
 let now=0;const s=new JobScheduler({backgroundConcurrency:1,agingMs:10,now:()=>now});
 const a=await s.acquire({kind:'export',priority:2});const order:string[]=[];
 const old=s.run({kind:'maintenance',priority:3},async()=>{order.push('old');});
 now=11;const fresh=s.run({kind:'export',priority:2},async()=>{order.push('fresh');});
 a.release();await Promise.all([old,fresh]);assert.deepEqual(order,['old','fresh']);
});

test('non-cancellable integrity work ignores stop and signal abort after admission', async () => {
 const s=new JobScheduler();const signal=new AbortController();
 const a=await s.acquire({kind:'save',priority:0,cancellable:false,signal:signal.signal});
 signal.abort();assert.equal(s.cancel(a.id),false);assert.equal(a.signal.aborted,false);a.release();
 assert.equal(s.list()[0].state,'completed');
});

test('snapshots are stable and immutable; progress is clamped and ignored after release', async () => {
 const s=new JobScheduler();const a=await s.acquire({kind:'export',priority:2,resources:['r']});
 const before=s.list();assert.equal(s.list(),before);assert.equal(Object.isFrozen(before),true);
 assert.equal(Object.isFrozen(before[0].resources),true);
 a.progress(2);assert.equal(before[0].progress,null);assert.equal(s.list()[0].progress,1);
 const after=s.list();a.progress(NaN);assert.equal(s.list(),after);
 a.progress(-1);assert.equal(s.list()[0].progress,0);a.release();const done=s.list();a.progress(0.5);assert.equal(s.list(),done);
});

test('generated ids avoid explicit ids and caller mutation cannot remove resource ownership', async () => {
 const s=new JobScheduler();const a=await s.acquire({id:'job-2',kind:'export',priority:2});
 const resources=['engine'];const spec={kind:'activation' as const,priority:1 as const,resources};
 const b=await s.acquire(spec);assert.notEqual(a.id,b.id);resources.length=0;
 assert.equal(s.hasLease('engine'),true);a.release();b.release();
 await assert.rejects(s.acquire({kind:'export',priority:9 as 2}),/priority/);
 for(const n of [-1,NaN,Infinity,1.5]) await assert.rejects(s.acquire({kind:'export',priority:2,estimatedBytes:n}),/budget/);
 assert.throws(()=>s.setAdmission({maxBytes:0,backgroundConcurrency:1,pressure:'normal'}));
});

test('reentrant observers can enqueue without corrupting queue or reservations', async () => {
 const s=new JobScheduler({backgroundConcurrency:1});let next:Promise<import('./scheduler').JobLease>|undefined;
 let added=false;const off=s.subscribe(()=>{if(!added){added=true;next=s.acquire({kind:'maintenance',priority:3});}});
 const a=await s.acquire({kind:'export',priority:2});assert.equal(s.list().filter(r=>r.state==='queued').length,1);
 off();a.release();(await next!).release();assert.equal(s.list().filter(r=>r.state==='running').length,0);
});
