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
