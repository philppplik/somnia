import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JobScheduler} from './scheduler';
import {wireJobLeases} from './lifecycleBridge';
test('lifecycle checks both running and queued job-owned engine dependencies and deregisters',async()=>{
 const scheduler=new JobScheduler({backgroundConcurrency:1});let lookup:(id:string)=>boolean=()=>false;let disposed=false;
 const off=wireJobLeases({registerJobLeaseProvider(provider){lookup=provider;return()=>{disposed=true;};}},scheduler);
 const first=await scheduler.acquire({kind:'export',priority:2,resources:['video.engine']});
 const queued=scheduler.acquire({kind:'export',priority:2,resources:['photos.engine']});
 assert.equal(lookup('studio:video'),true);assert.equal(lookup('studio:photos'),true);assert.equal(lookup('studio:documents'),false);
 first.release();const second=await queued;assert.equal(lookup('studio:video'),false);second.release();assert.equal(lookup('studio:photos'),false);off();assert.equal(disposed,true);
});

test('studio mapping is delimiter-aware and terminal history never pins resources', async () => {
 const {jobNeedsStudio}=await import('./lifecycleBridge');
 const s=new JobScheduler();const a=await s.acquire({kind:'playback',priority:0,resources:['video2.engine','studio:sound','slides:session:x']});
 assert.equal(jobNeedsStudio(s.list(),'video'),false);assert.equal(jobNeedsStudio(s.list(),'sound'),true);
 assert.equal(jobNeedsStudio(s.list(),'slides'),true);a.release();assert.equal(jobNeedsStudio(s.list(),'sound'),false);
});

test('profile job buckets and heavy concurrency drive admission atomically', async () => {
 const {applyJobBudget}=await import('./lifecycleBridge');const {LOW_PROFILE,NORMAL_PROFILE}=await import('../lifecycle/budgets');
 const s=new JobScheduler();applyJobBudget(LOW_PROFILE,'normal',s);
 const a=await s.acquire({kind:'export',priority:2});const b=s.acquire({kind:'export',priority:2});
 assert.equal(s.list().filter(r=>r.state==='queued').length,1);
 await assert.rejects(s.acquire({kind:'export',priority:2,estimatedBytes:LOW_PROFILE.buckets.jobs+1}),/budget/);
 applyJobBudget(NORMAL_PROFILE,'critical',s);assert.equal(s.list().filter(r=>r.state==='queued').length,1);
 applyJobBudget(NORMAL_PROFILE,'normal',s);const second=await b;a.release();second.release();
});

test('real manager refuses suspension for queued and running dependencies until release', async () => {
 const {StudioLifecycleManager}=await import('../lifecycle/manager');
 const {NORMAL_PROFILE}=await import('../lifecycle/budgets');
 const scheduler=new JobScheduler({backgroundConcurrency:1});let suspended=0;
 const manager=new StudioLifecycleManager({
  isEnabled:()=>true,profile:()=>NORMAL_PROFILE,
  clock:{now:()=>0,setTimeout:()=>0,clearTimeout:()=>{}},
  resolveAdapter:id=>({resourceIds:()=>[`studio:${id}`],snapshot:async()=>({studioId:id,schemaVersion:1,revision:0,capturedAt:0,bytesEstimate:1,checksum:'ok',payload:{}}),suspend:async()=>{suspended++;}}),
 });
 const off=wireJobLeases(manager,scheduler);
 const a=await scheduler.acquire({kind:'export',priority:2});
 const queued=scheduler.acquire({kind:'export',priority:2,exclusive:['photos.engine']});
 await manager.activate('photos');await manager.activate('documents');
 assert.equal(await manager.suspend('photos','test'),false);assert.equal(suspended,0);
 a.release();const second=await queued;
 assert.equal(await manager.suspend('photos','test'),false);scheduler.cancel(second.id);
 assert.equal(await manager.suspend('photos','test'),false);
 second.release();assert.equal(await manager.suspend('photos','test'),true);assert.equal(suspended,1);
 off();await manager.disable();
});

test('a lease acquired during async checkpoint capture prevents engine release', async () => {
 const {StudioLifecycleManager}=await import('../lifecycle/manager');
 const {NORMAL_PROFILE}=await import('../lifecycle/budgets');
 let finish:()=>void=()=>{};let suspended=false;
 const manager=new StudioLifecycleManager({
  isEnabled:()=>true,profile:()=>NORMAL_PROFILE,
  clock:{now:()=>0,setTimeout:()=>0,clearTimeout:()=>{}},
  resolveAdapter:id=>({resourceIds:()=>[`studio:${id}`],
   snapshot:async()=>{await new Promise<void>(r=>{finish=r;});return {studioId:id,schemaVersion:1,revision:0,capturedAt:0,bytesEstimate:1,checksum:'ok',payload:{}};},
   suspend:async()=>{suspended=true;}}),
 });
 const scheduler=new JobScheduler();const off=wireJobLeases(manager,scheduler);
 await manager.activate('photos');await manager.activate('documents');
 const pending=manager.suspend('photos','test');
 const lease=await scheduler.acquire({kind:'export',priority:2,resources:['photos.engine']});
 finish();assert.equal(await pending,false);assert.equal(suspended,false);
 lease.release();off();await manager.disable();
});

test('a queued resource also blocks eviction of an already suspended studio', async () => {
 const {StudioLifecycleManager}=await import('../lifecycle/manager');
 const {NORMAL_PROFILE}=await import('../lifecycle/budgets');let disposed=false;
 const manager=new StudioLifecycleManager({
  isEnabled:()=>true,profile:()=>NORMAL_PROFILE,
  clock:{now:()=>0,setTimeout:()=>0,clearTimeout:()=>{}},
  resolveAdapter:id=>({resourceIds:()=>[`studio:${id}`],snapshot:async()=>({studioId:id,schemaVersion:1,revision:0,capturedAt:0,bytesEstimate:1,checksum:'ok',payload:{}}),suspend:async()=>{},dispose:async()=>{disposed=true;}}),
 });
 const scheduler=new JobScheduler();const off=wireJobLeases(manager,scheduler);
 await manager.activate('photos');await manager.activate('documents');assert.equal(await manager.suspend('photos','test'),true);
 scheduler.setPressure('critical');const queued=scheduler.acquire({id:'pending',kind:'export',priority:2,resources:['photos.engine']});
 const rejected=assert.rejects(queued);assert.equal(await manager.evict('photos','test'),false);assert.equal(disposed,false);
 scheduler.cancel('pending');await rejected;assert.equal(await manager.evict('photos','test'),true);off();await manager.disable();
});
