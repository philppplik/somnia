import test from 'node:test';import assert from 'node:assert/strict';
import {fixtureRun} from './fixture';import {reviewedHunksAllowed} from './state';import {validateCommand,parseReviewDetails} from './validation';
const studio=fixtureRun();studio.review!.conflicts=[];studio.review!.files=studio.review!.files.filter(f=>!f.conflict);
const details={revision:'review-1',timeline:[],files:[{path:'index.html',hunks:[{id:'h1',oldStart:0,oldCount:1,newStart:0,newCount:1,diff:'@@ diff'}]}]};
test('review selection is revision-bound, exact, non-overlapping and rejects invented hunks',()=>{
 assert.ok(reviewedHunksAllowed(studio,details,[],[{path:'index.html',hunkIds:['h1']}])) ;
 assert.ok(!reviewedHunksAllowed(studio,{...details,revision:'stale'},[],[{path:'index.html',hunkIds:['h1']}])) ;
 assert.ok(!reviewedHunksAllowed(studio,details,['index.html'],[{path:'index.html',hunkIds:['h1']}])) ;
 assert.ok(!reviewedHunksAllowed(studio,details,[],[{path:'index.html',hunkIds:['fake']}])) ;
});
test('DTO rejects replacement text and empty selection; history requires unique durable sequences',()=>{
 const c={type:'apply-hunks' as const,runId:studio.runId,reviewRevision:'review-1',commandId:'x',expectedRevision:1,paths:[],hunks:[{path:'index.html',hunkIds:['h1']}]};
 validateCommand(c);assert.throws(()=>validateCommand({...c,hunks:[],paths:[]}));
 assert.throws(()=>validateCommand({...c,hunks:[{...c.hunks[0],replacement:'attack'}]} as unknown as typeof c));
 assert.deepEqual(parseReviewDetails({revision:details.revision,files:details.files},[]),details);
 const log={sequence:1,timestampUtc:'2026-10-11T10:00:00Z',kind:'consent.decision_requested',detail:'deny'};assert.throws(()=>parseReviewDetails(null,[log,log]));
});

import {VibeSpaceController} from './controller';import {createFixtureVibeSpaceTransport,fixtureSnapshot} from './fixture';
test('controller keeps native capability gating and request-changes starts a new reviewed identity',async()=>{
 const data=fixtureSnapshot();data.studios[0].review!.conflicts=[];data.studios[0].review!.files=data.studios[0].review!.files.filter(f=>!f.conflict);
 const transport=createFixtureVibeSpaceTransport('test',data);const c=new VibeSpaceController(transport);await c.connect();
 assert.equal(await c.execute({type:'request-changes',runId:'run-copy',reviewRevision:'stale',message:'Shorter'}),false);await c.refresh();
 assert.equal(await c.execute({type:'request-changes',runId:'run-copy',reviewRevision:'review-1',message:'Shorter'}),true);
 assert.equal(c.getSnapshot().snapshot!.studios[0].reviewState,'ready');assert.notEqual(c.getSnapshot().snapshot!.studios.at(-1)!.runId,'run-copy');
 c.disconnect();
 const blocked=createFixtureVibeSpaceTransport('test',data);Object.defineProperty(blocked,'capabilities',{value:['review']});const b=new VibeSpaceController(blocked);await b.connect();
 assert.equal(await b.execute({type:'apply-hunks',runId:'run-copy',reviewRevision:'review-1',paths:[],hunks:[{path:'index.html',hunkIds:['h1']}]}),false);assert.equal(blocked.calls.length,0);b.disconnect();
});
