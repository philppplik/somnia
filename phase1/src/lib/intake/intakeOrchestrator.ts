/**
 * Intake orchestrator (12.0.1, work package D2-E).
 *
 * Serially drains the native open-request queue and drives every request
 * through the Smart Open pipeline (#166, S9 coordinator): gate -> claim ->
 * read by one-shot grant -> prepare/approve/revalidate/commit -> ack ->
 * exactly one final IntakeOperationNotice (corr = request id, ordinal per
 * item).
 *
 * Hard rules implemented here (D2 sections 6/10/11, D3 final):
 * - `whenIntakeAllowed()` (D3 intakeGate) is awaited BEFORE every claim;
 *   queued requests have no timeout, so a paused gate never loses a request.
 * - The UI-only corr->ordinal->name map is populated right after each claim,
 *   before any item work, via the injected D3 `registerIntakeContext`.
 * - Outcomes are mapped by ORDINAL, never by basename (collisions are real).
 * - Logging ownership: transport failures arrive as CommandError carrying the
 *   incident logged once at the cmd() boundary and are reused; a renderer
 *   business failure without an incident is logged ONCE here at the ack
 *   boundary (SOM-APP-002, or SOM-FS-006 for cause `lock-conflict`). Cancel
 *   produces no event, no log, no replay. Approval-level UI-006 is logged by
 *   the S9 approvalFailed sink, not here.
 * - `release_candidate` runs on every abort edge (throw, stop, reload); it is
 *   idempotent host-side. After a successful ack no release is sent so host
 *   retry tokens stay valid.
 * - Retry: ack retry tokens feed the registered D3 executor; one automatic
 *   retry per run only for lock-class causes, and only when the token carries
 *   a host-supplied `expiresAt` (no expiry -> no retry offer, D3 rule). A
 *   retry is a fresh grant and re-stat through the NORMAL #166 pipeline:
 *   dirty-document protection stays intact, unrelated batch items are never
 *   re-prompted.
 *
 * `cause` hygiene: only slug-shaped class tokens (host failure classes) are
 * acked/logged as causes. Coordinator reason strings are human text that may
 * embed basenames and are NEVER forwarded into acks, logs or notices.
 */
import {isCommandError} from '../invokeCmd';
import type {ClaimedItem,ItemOutcome,ItemOutcomeStatus} from '../commandContracts';
import type {BatchOptions,OpenInput,OpenReport} from '../studios/openCoordinator';
import type {IncidentId,IntakeContextItem,IntakeOperationNotice,IntakeOperationNoticeItem,IntakeRetryRun,IntakeRetryStatus,IntakeRetryToken,OpenRequestSummaryView,OpenSource,RequestId} from './intakeTypes';
import type {OpenRequestClient} from './openRequestClient';

export const ERR_OPEN_REQUEST_ITEM_FAILED='SOM-APP-002';
export const ERR_PROJECT_LOCKED='SOM-FS-006';

/** Minimal D1 logging surface used at the ack boundary. Context keys are allowlist-only. */
export type IntakeLogEvent=(id:string,context:{corr:RequestId;ordinal?:number;ext?:string;cause?:string})=>{incidentId:IncidentId}|null;

export type IntakeOpenFn=(inputs:OpenInput[],opts?:BatchOptions)=>Promise<OpenReport>;

export interface IntakeOrchestratorDeps{
 client:OpenRequestClient;
 /** D3 intakeGate: resolves when no pause is active and the initial review decision completed. */
 whenIntakeAllowed():Promise<void>;
 /** S9 coordinator. Single-doc rule, approval, revision revalidation and commit live there. */
 openFiles:IntakeOpenFn;
 /** D3 presenter. Called exactly once per request with the complete final report. */
 presentIntakeOutcome(notice:IntakeOperationNotice):void;
 /** Focus an already-open project (same-file rule, ActivatedExisting). */
 focusExisting(projectId:string):void;
 /** D3 noticeStore UI-only correlation map (corr -> ordinal -> basename). */
 registerIntakeContext(requestId:RequestId,items:readonly IntakeContextItem[]):void;
 /** D3 retryActions registry; returns the unregister closure. */
 registerRetryExecutor(run:IntakeRetryRun):()=>void;
 logEvent:IntakeLogEvent;
}

/** Coordinator outcomes that mean "waiting on a user choice", not an error. */
function ackStatus(status:OpenReport['outcomes'][number]['status']):ItemOutcomeStatus{
 switch(status){
  case 'opened':return 'opened';
  case 'failed':return 'failed';
  case 'cancelled':return 'cancelled';
  case 'activated-existing':return 'activated-existing';
  case 'deferred':case 'choose-handler':case 'safe-text-offer':return 'deferred';
  case 'unsupported':case 'invalid':return 'rejected';
 }
}
/** FS-006 is the single lock-conflict event (APP-002 is NOT emitted additionally). */
const isLockConflict=(cause:string|undefined)=>cause==='lock-conflict';
/** Lock-class causes eligible for the one automatic retry (host only mints tokens for transient classes). */
const isRetryableLock=(cause:string|undefined)=>cause==='locked'||cause==='lock-conflict';
const isExpired=(error:unknown)=>isCommandError(error)&&/expired/i.test(error.code);
/** Only slug class tokens may cross into acks/logs; human reason text can carry basenames. */
const asCauseToken=(x:unknown):string|undefined=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,40}$/.test(x)?x:undefined;

function failureCause(error:unknown):{cause:string;incidentId?:IncidentId}{
 if(isCommandError(error))return{cause:error.code,incidentId:error.incident_id||undefined};
 return{cause:'internal'};
}

export function startIntakeOrchestrator(deps:IntakeOrchestratorDeps):Promise<()=>void>{
 const {client}=deps;
 let stopped=false,draining=false,wakePending=false;

 /** Log one event per genuinely failed item that has no incident yet; reuse transport incidents. */
 function logFailures(requestId:RequestId,extByOrdinal:ReadonlyMap<number,string>,items:readonly IntakeOperationNoticeItem[]):void{
  for(const item of items){
   if(item.status!=='failed'||item.incidentId)continue;
   const cause=item.cause??'internal';
   const id=isLockConflict(cause)?ERR_PROJECT_LOCKED:ERR_OPEN_REQUEST_ITEM_FAILED;
   const reported=deps.logEvent(id,{corr:requestId,ordinal:item.ordinal,ext:extByOrdinal.get(item.ordinal),cause});
   if(reported)item.incidentId=reported.incidentId;
  }
 }

 /** Read granted items and run them through the coordinator. Keyed by ordinal end to end. */
 async function processGrantedItems(requestId:RequestId,items:readonly ClaimedItem[],results:Map<number,IntakeOperationNoticeItem>):Promise<void>{
  const granted:{item:ClaimedItem;bytes:Uint8Array}[]=[];
  for(const item of items){
   if(item.status==='rejected'){results.set(item.ordinal,{ordinal:item.ordinal,status:'rejected',cause:'rejected-input'});continue;}
   if(!item.grant){results.set(item.ordinal,{ordinal:item.ordinal,status:'failed',cause:'no-grant'});continue;}
   try{const read=await client.readByGrant(item.grant,requestId);granted.push({item,bytes:read.bytes});}
   catch(error){
    // Transport failure: cmd() logged once; reuse the incident, never re-log as business failure.
    const f=failureCause(error);
    results.set(item.ordinal,{ordinal:item.ordinal,status:'failed',cause:f.cause,incidentId:f.incidentId});
   }
  }
  if(!granted.length||stopped)return;
  const inputs:OpenInput[]=granted.map(({item,bytes})=>({name:item.displayName,bytes,
   key:item.identityToken,requestId,ordinal:item.ordinal,identityToken:item.identityToken}));
  const report=await deps.openFiles(inputs,{intent:'open'});
  const byOrdinal=new Map(report.outcomes.filter(o=>typeof o.ordinal==='number').map(o=>[o.ordinal as number,o]));
  const positional=report.outcomes.length===inputs.length;
  inputs.forEach((input,index)=>{
   const outcome=byOrdinal.get(input.ordinal as number)??(positional?report.outcomes[index]:undefined);
   const ordinal=input.ordinal as number;
   if(!outcome){results.set(ordinal,{ordinal,status:'failed',cause:'no-outcome'});return;}
   const status=ackStatus(outcome.status);
   const row:IntakeOperationNoticeItem={ordinal,status};
   if(status==='failed')row.cause=asCauseToken((outcome as {cause?:unknown}).cause)??'internal';
   else if(status==='rejected')row.cause=asCauseToken((outcome as {cause?:unknown}).cause);
   results.set(ordinal,row);
  });
 }

 async function safeAck(requestId:RequestId,outcomes:ItemOutcome[]):Promise<IntakeRetryToken[]>{
  try{return (await client.ackOpenRequest(requestId,outcomes)).retryTokens??[];}
  catch{return[];/* ack transport failure is logged at the cmd() boundary; host reset_stale recovers */}
 }

 /**
  * Shared retry pipeline: fresh grant + re-stat via retry_open_item, then the
  * normal #166 path for exactly this item. Never re-prompts unrelated batch
  * items; the coordinator's dirty-document approval still applies. User cancel
  * reports 'cancelled' with no error log; token problems report 'expired'.
  */
 const runRetry:IntakeRetryRun=async(requestId,ordinal,token):Promise<IntakeRetryStatus>=>{
  await deps.whenIntakeAllowed();
  if(stopped)return 'cancelled';
  let item:ClaimedItem|undefined;
  try{item=(await client.retryOpenItem(requestId,ordinal,token)).items.find(i=>i.ordinal===ordinal);}
  catch(error){return isExpired(error)?'expired':'failed';}
  if(!item)return 'failed';
  if(item.status==='activated-existing'){
   if(item.existingProjectId)deps.focusExisting(item.existingProjectId);
   await safeAck(requestId,[{ordinal,status:'activated-existing'}]);return 'opened';
  }
  const results=new Map<number,IntakeOperationNoticeItem>();
  try{await processGrantedItems(requestId,[item],results);}
  catch(error){try{await client.releaseCandidate(requestId);}catch{/* idempotent */}return isExpired(error)?'expired':'failed';}
  const result=results.get(ordinal)??{ordinal,status:'failed' as const,cause:'no-outcome'};
  if(result.status==='failed')logFailures(requestId,new Map([[ordinal,item.ext]]),[result]);
  await safeAck(requestId,[result.cause===undefined?{ordinal,status:result.status}:{ordinal,status:result.status,cause:result.cause}]);
  switch(result.status){
   case 'opened':case 'activated-existing':return 'opened';
   case 'cancelled':return 'cancelled';
   case 'deferred':case 'rejected':return 'rejected';
   default:return 'failed';
  }
 };

 async function processRequest(summary:OpenRequestSummaryView):Promise<void>{
  const requestId=summary.id;
  // Gate BEFORE the claim. Queued requests have no claim timeout, so waiting loses nothing.
  await deps.whenIntakeAllowed();
  if(stopped)return;
  let claimed=false,acked=false;
  const results=new Map<number,IntakeOperationNoticeItem>();
  const extByOrdinal=new Map<number,string>();
  try{
   const {items}=await client.claimOpenRequest(requestId);
   claimed=true;
   // UI-only correlation map: after the claim, before any item work.
   deps.registerIntakeContext(requestId,items.map(i=>({ordinal:i.ordinal,displayName:i.displayName})));
   const granted:ClaimedItem[]=[];
   for(const item of items){
    extByOrdinal.set(item.ordinal,item.ext);
    if(item.status==='activated-existing'){
     if(item.existingProjectId)deps.focusExisting(item.existingProjectId);
     results.set(item.ordinal,{ordinal:item.ordinal,status:'activated-existing'});
    }else granted.push(item);
   }
   await processGrantedItems(requestId,granted,results);
   if(stopped)return; // abort edge: finally releases the claim instead of acking stale work
   const finalItems=[...results.values()];
   logFailures(requestId,extByOrdinal,finalItems);
   const ackOutcomes:ItemOutcome[]=finalItems.map(i=>i.cause===undefined?{ordinal:i.ordinal,status:i.status}:{ordinal:i.ordinal,status:i.status,cause:i.cause});
   const ackTokens=await safeAck(requestId,ackOutcomes);
   acked=true;
   // One automatic retry per run, lock-class causes only, and only with a token carrying
   // host-authoritative expiry (no expiresAt -> no retry offer at all, per D3).
   if(!stopped){
    // Only unexpired host-minted tokens (epoch ms); the host stays authoritative on TTL/single-use.
    const now=Date.now();
    const tokenByOrdinal=new Map(ackTokens.filter(t=>typeof t.expiresAt==='number'&&t.expiresAt>now).map(t=>[t.ordinal,t.token]));
    for(const item of finalItems){
     if(item.status!=='failed'||!isRetryableLock(item.cause))continue;
     const token=tokenByOrdinal.get(item.ordinal);if(!token)continue;
     const status=await runRetry(requestId,item.ordinal,token);
     if(status==='opened'){item.status='opened';delete item.cause;}
     else if(status==='cancelled'){item.status='cancelled';delete item.cause;}
     else if(status==='expired')item.cause='retry-expired';
     else if(status==='rejected')item.status='rejected';
    }
   }
   const counts={opened:0,failed:0,cancelled:0,deferred:0,activatedExisting:0,rejected:0};
   for(const item of finalItems){
    if(item.status==='opened')counts.opened++;else if(item.status==='failed')counts.failed++;
    else if(item.status==='cancelled')counts.cancelled++;else if(item.status==='deferred')counts.deferred++;
    else if(item.status==='activated-existing')counts.activatedExisting++;else counts.rejected++;
   }
   // Exactly ONE final notice per request; the presenter applies the quiet rule for pure success.
   deps.presentIntakeOutcome({corr:requestId,source:summary.source as OpenSource,resetCount:summary.resetCount??0,items:finalItems,counts});
  }finally{
   if(claimed&&!acked){try{await client.releaseCandidate(requestId);}catch{/* idempotent host-side */}}
  }
 }

 async function drainOnce():Promise<void>{
  const summaries=await client.drainOpenRequests();
  for(const summary of summaries){
   if(stopped)return;
   try{await processRequest(summary);}catch{/* abort edge already released; continue with the next request */}
  }
 }

 async function pump():Promise<void>{
  if(draining){wakePending=true;return;}
  draining=true;
  try{do{wakePending=false;await drainOnce();}while(wakePending&&!stopped);}
  catch{/* drain itself failed at the boundary; the next event retries */}
  finally{draining=false;}
 }

 // Listener BEFORE the first drain: an enqueue between listener install and drain is never lost
 // (mutex-race fallback: the host also emits the count event on cold enqueue).
 return (async()=>{
  const unlisten=await client.onOpenRequestsChanged(()=>{void pump();});
  const unregisterRetry=deps.registerRetryExecutor(runRetry);
  void pump();
  return()=>{stopped=true;unlisten();unregisterRetry();};
 })();
}
