import test from 'node:test';
import assert from 'node:assert/strict';
import {startIntakeOrchestrator,ERR_OPEN_REQUEST_ITEM_FAILED,ERR_PROJECT_LOCKED,type IntakeOrchestratorDeps} from './intakeOrchestrator';
import {CommandError} from '../invokeCmd';
import type {ClaimedItem,IntakeOperationNotice,OpenRequestSummaryView} from './intakeTypes';
import type {OpenOutcome,OpenReport} from '../studios/openCoordinator';
import type {ItemOutcome} from '../commandContracts';
import type {OpenRequestClient} from './openRequestClient';

const tick=()=>new Promise<void>(r=>setImmediate(r));
async function waitFor(cond:()=>boolean,tries=200){for(let i=0;i<tries;i++){if(cond())return;await tick();}throw new Error('condition not met');}

interface FakeState{
 summaries:OpenRequestSummaryView[];claims:ClaimedItem[][];
 order:string[];notices:IntakeOperationNotice[];logs:{id:string;context:unknown}[];
 acks:{id:string;outcomes:ItemOutcome[]}[];releases:string[];focuses:string[];
 contexts:{id:string;items:unknown}[];retries:{id:string;ordinal:number;token:string}[];
 readFailures:Record<string,unknown>;openOutcome:(ordinal:number)=>OpenOutcome;
 openThrows?:boolean;retryTokens:{ordinal:number;token:string;expiresAt:number}[];
}

function harness(over:Partial<FakeState>={}){
 const state:FakeState={
  summaries:[],claims:[],order:[],notices:[],logs:[],acks:[],releases:[],focuses:[],contexts:[],retries:[],
  readFailures:{},openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:'opened'}),retryTokens:[],...over};
 let listener:((e:{count:number})=>void)|null=null;
 let gate:(()=>void)|null=null;let gateOpen=true;
 const client:OpenRequestClient={
  async onOpenRequestsChanged(cb){state.order.push('listen');listener=cb;return()=>{listener=null;};},
  async drainOpenRequests(){state.order.push('drain');const out=state.summaries;state.summaries=[];return out;},
  async claimOpenRequest(){state.order.push('claim');return{items:state.claims.shift()??[]};},
  async readByGrant(grant){state.order.push('read');const f=state.readFailures[grant];if(f)throw f;
   return{name:'n',bytes:new Uint8Array([1]),identityToken:'t',size:1};},
  async ackOpenRequest(id,outcomes){state.order.push('ack');state.acks.push({id,outcomes});return{retryTokens:state.retryTokens};},
  async releaseCandidate(id){state.order.push('release');state.releases.push(id);},
  async retryOpenItem(id,ordinal,token){state.order.push('retry');state.retries.push({id,ordinal,token});return{items:state.claims.shift()??[]};},
  async getIntakePolicy(){return{allowUnc:false};},
  async setIntakePolicy(){},
 };
 let registeredRun:Function|null=null;
 const deps:IntakeOrchestratorDeps={
  client,
  whenIntakeAllowed:()=>gateOpen?Promise.resolve():new Promise<void>(r=>{gate=r;}),
  openFiles:async inputs=>{state.order.push('openFiles');
   if(state.openThrows)throw new Error('coordinator exploded');
   return{generation:1,superseded:false,cancelled:false,outcomes:inputs.map(i=>state.openOutcome(i.ordinal as number)),focused:null,summary:''};},
  presentIntakeOutcome:n=>{state.order.push('notice');state.notices.push(n);},
  focusExisting:id=>{state.focuses.push(id);},
  registerIntakeContext:(id,items)=>{state.order.push('registerContext');state.contexts.push({id,items:[...items]});},
  registerRetryExecutor:run=>{registeredRun=run;return()=>{registeredRun=null;};},
  logEvent:(id,context)=>{state.logs.push({id,context});return{incidentId:`inc-${state.logs.length}`};},
 };
 return{state,deps,
  fire:(count:number)=>listener?.({count}),
  closeGate:()=>{gateOpen=false;},openGate:()=>{gateOpen=true;gate?.();gate=null;},
  runRetry:(id:string,ordinal:number,token:string)=>registeredRun!(id,ordinal,token)};
}

const req=(id:string,items:{ordinal:number;name?:string}[]):OpenRequestSummaryView=>({id,source:'SecondInstance',generation:1,items:items.map(i=>({ordinal:i.ordinal,displayName:i.name??`f${i.ordinal}.html`,ext:'html',size:1}))});
const claimed=(ordinal:number,extra:Partial<ClaimedItem>={}):ClaimedItem=>({ordinal,displayName:`f${ordinal}.html`,ext:'html',size:1,grant:`g${ordinal}`,identityToken:`t${ordinal}`,status:'granted',...extra});

test('listener is installed before the first drain so no enqueue is lost',async()=>{
 const h=harness();
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.order.includes('drain'));
 assert.ok(h.state.order.indexOf('listen')<h.state.order.indexOf('drain'));
 stop();
});

test('the gate blocks every claim; queued requests wait without timing out and process after release',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]]});
 h.closeGate();
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.order.includes('drain'));
 await tick();await tick();
 assert.ok(!h.state.order.includes('claim'),'no claim while the gate is paused');
 h.openGate();
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.notices[0].corr,'r1');
 stop();
});

test('requests are processed strictly serially: claim, context, work, ack, notice',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}]),req('r2',[{ordinal:0}])],claims:[[claimed(0)],[claimed(0)]]});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===2);
 const seq=h.state.order;
 assert.deepEqual(seq.filter(s=>s==='claim'||s==='ack'||s==='notice'),['claim','ack','notice','claim','ack','notice']);
 stop();
});

test('activated-existing items focus the open project and are never read',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0,{grant:undefined,status:'activated-existing',existingProjectId:'proj-9'})]]});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.deepEqual(h.state.focuses,['proj-9']);
 assert.ok(!h.state.order.includes('read'));
 assert.equal(h.state.acks[0].outcomes[0].status,'activated-existing');
 stop();
});

test('corr->ordinal UI map is populated right after the claim, before any read',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0,name:'index.html'},{ordinal:1,name:'index.html'}])],claims:[[claimed(0,{displayName:'index.html'}),claimed(1,{displayName:'index.html'})]]});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.ok(h.state.order.indexOf('registerContext')<h.state.order.indexOf('read'));
 assert.deepEqual(h.state.contexts[0].items,[{ordinal:0,displayName:'index.html'},{ordinal:1,displayName:'index.html'}]);
 stop();
});

test('outcomes map by ordinal, never by colliding basename',async()=>{
 const h=harness({
  summaries:[req('r1',[{ordinal:0,name:'index.html'},{ordinal:1,name:'index.html'}])],
  claims:[[claimed(0,{displayName:'index.html'}),claimed(1,{displayName:'index.html'})]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:o===1?'failed':'opened',cause:o===1?'parse':undefined})});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.deepEqual(h.state.acks[0].outcomes,[{ordinal:0,status:'opened'},{ordinal:1,status:'failed',cause:'parse'}]);
 stop();
});

test('transport read failure reuses the cmd() incident and is not logged again',async()=>{
 const h=harness({
  summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]],
  readFailures:{g0:new CommandError('read_by_grant',{id:'SOM-APP-002',code:'changed-or-deleted',message:'gone',incident_id:'inc-transport',expected:false},'r1')}});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.logs.length,0,'no second log for a transport failure');
 const item=h.state.notices[0].items[0];
 assert.equal(item.status,'failed');assert.equal(item.cause,'changed-or-deleted');assert.equal(item.incidentId,'inc-transport');
 stop();
});

test('renderer business failure logs SOM-APP-002 exactly once with corr, ordinal, ext and cause',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:3}])],claims:[[claimed(3)]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:'failed',cause:'parse'})});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.logs.length,1);
 assert.equal(h.state.logs[0].id,ERR_OPEN_REQUEST_ITEM_FAILED);
 assert.deepEqual(h.state.logs[0].context,{corr:'r1',ordinal:3,ext:'html',cause:'parse'});
 assert.equal(h.state.notices[0].items[0].incidentId,'inc-1');
 stop();
});

test('lock-conflict logs SOM-FS-006 once instead of APP-002',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:'failed',cause:'lock-conflict'})});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.deepEqual(h.state.logs.map(l=>l.id),[ERR_PROJECT_LOCKED]);
 stop();
});

test('user cancel produces no event, no log, no retry and still one quiet notice',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:'cancelled'})});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.logs.length,0);
 assert.equal(h.state.retries.length,0);
 assert.equal(h.state.notices[0].counts.cancelled,1);
 stop();
});

test('every abort edge releases the candidate: coordinator throw, no ack',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]],openThrows:true});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.releases.length===1);
 assert.deepEqual(h.state.releases,['r1']);
 assert.equal(h.state.acks.length,0);assert.equal(h.state.notices.length,0);
 stop();
});

test('exactly one final notice per request, with complete counts',async()=>{
 const h=harness({
  summaries:[req('r1',[{ordinal:0},{ordinal:1},{ordinal:2},{ordinal:3}])],
  claims:[[claimed(0),claimed(1),claimed(2),claimed(3,{grant:undefined,status:'activated-existing',existingProjectId:'p'})]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:o===0?'opened':o===1?'failed':'deferred',cause:o===1?'io':undefined})});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.deepEqual(h.state.notices[0].counts,{opened:1,failed:1,cancelled:0,deferred:1,activatedExisting:1,rejected:0});
 stop();
});

test('a locked failure with a fresh token auto-retries once; a second failure is not retried again',async()=>{
 const outcomes=[{name:'f0.html',ordinal:0,status:'failed',cause:'locked'} as OpenOutcome,{name:'f0.html',ordinal:0,status:'failed',cause:'locked'} as OpenOutcome];
 const h=harness({
  summaries:[req('r1',[{ordinal:0}])],
  claims:[[claimed(0)],[claimed(0)]],
  retryTokens:[{ordinal:0,token:'tok-1',expiresAt:Date.now()+60_000}],
  openOutcome:()=>outcomes.shift()??{name:'f0.html',ordinal:0,status:'opened'}});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.retries.length,1,'exactly one automatic retry in the same run');
 assert.equal(h.state.notices[0].items[0].status,'failed','second locked failure stays final');
 assert.equal(h.state.logs.length,2,'the retry failure is a new occurrence with its own event');
 stop();
});

test('auto retry turns the item opened and the single notice reflects it',async()=>{
 const h=harness({
  summaries:[req('r1',[{ordinal:0}])],
  claims:[[claimed(0)],[claimed(0)]],
  retryTokens:[{ordinal:0,token:'tok-1',expiresAt:Date.now()+60_000}],
  openOutcome:(()=>{let n=0;return o=>({name:`f${o}.html`,ordinal:o,status:n++===0?'failed':'opened',cause:n===1?'locked':undefined});})()});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 assert.equal(h.state.notices[0].items[0].status,'opened');
 assert.deepEqual(h.state.notices[0].counts,{opened:1,failed:0,cancelled:0,deferred:0,activatedExisting:0,rejected:0});
 stop();
});

test('the registered retry executor maps outcomes onto the D3 status union',async()=>{
 const h=harness({claims:[[claimed(5)]]});
 const stop=await startIntakeOrchestrator(h.deps);
 assert.equal(await h.runRetry('r1',5,'tok'),'opened');
 assert.deepEqual(h.state.retries,[{id:'r1',ordinal:5,token:'tok'}]);
 stop();
});

test('retry reports expired for token errors and never swallows a user cancel as an error',async()=>{
 const h=harness({
  claims:[[claimed(5)]],
  openOutcome:o=>({name:`f${o}.html`,ordinal:o,status:'cancelled'})});
 const stop=await startIntakeOrchestrator(h.deps);
 assert.equal(await h.runRetry('r1',5,'tok'),'cancelled');
 assert.equal(h.state.logs.length,0);
 h.state.claims=[];
 h.deps.client.retryOpenItem=async()=>{throw new CommandError('retry_open_item',{id:'SOM-APP-002',code:'retry-expired',message:'expired',incident_id:'',expected:true});};
 assert.equal(await h.runRetry('r1',5,'tok'),'expired');
 stop();
});

test('an event arriving mid-processing triggers another drain pass',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)],[claimed(0)]]});
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.notices.length===1);
 h.state.summaries.push(req('r2',[{ordinal:0}]));
 h.fire(1);
 await waitFor(()=>h.state.notices.length===2);
 assert.equal(h.state.notices[1].corr,'r2');
 stop();
});

test('stopping mid-request releases the claimed request instead of acking',async()=>{
 const h=harness({summaries:[req('r1',[{ordinal:0}])],claims:[[claimed(0)]]});
 let resolveOpen:(r:OpenReport)=>void=()=>{};
 h.deps.openFiles=async()=>{h.state.order.push('openFiles');return new Promise(r=>{resolveOpen=r;});};
 const stop=await startIntakeOrchestrator(h.deps);
 await waitFor(()=>h.state.order.includes('openFiles'));
 stop();
 resolveOpen({generation:1,superseded:false,cancelled:false,outcomes:[{name:'f0.html',ordinal:0,status:'opened'}],focused:null,summary:''});
 await waitFor(()=>h.state.releases.includes('r1'));
 assert.equal(h.state.acks.length,0);
});
