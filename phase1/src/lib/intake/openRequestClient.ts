/**
 * Typed client for the native open-request queue (12.0.1, work package D2-E).
 *
 * Every command goes through the typed boundary (S2 `invokeCmd`): rejections
 * arrive as CommandError {id, code, message, detail?, incident_id, expected,
 * cmd, corr?}; legacy untyped rejections become SOM-APP-099 there. A transport
 * failure is logged ONCE at that boundary; callers reuse error.incident_id
 * instead of logging again. Request-scoped calls pass the correlation id via
 * invokeCmd opts ({corr: requestId}), never inside the argument DTO.
 *
 * The event listener is injected so the client is unit-testable without the
 * Tauri event API; command transport in tests is swapped via
 * `invokeCmd.__testing.setTransport`.
 */
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {invokeCmd} from '../invokeCmd';
import type {ClaimReply,GrantRead,IntakePolicy,ItemOutcome,OpenRequestSummary} from '../commandContracts';
import type {GrantId,IntakeRetryToken,OpenRequestSummaryView,RequestId} from './intakeTypes';

export interface OpenRequestsListen{<T>(event:string,handler:(event:{payload:T})=>void):Promise<()=>void>}

export interface GrantReadResult{name:string;bytes:Uint8Array;identityToken:string;size:number}

export interface OpenRequestClient{
 /** Renderer-visible signal after enqueue/reset: `{count}` only, never paths. */
 onOpenRequestsChanged(cb:(e:{count:number})=>void):Promise<()=>void>;
 drainOpenRequests():Promise<OpenRequestSummaryView[]>;
 claimOpenRequest(id:RequestId):Promise<ClaimReply>;
 readByGrant(grant:GrantId,corr:RequestId):Promise<GrantReadResult>;
 ackOpenRequest(id:RequestId,outcomes:ItemOutcome[]):Promise<{retryTokens:IntakeRetryToken[]}>;
 releaseCandidate(id:RequestId):Promise<void>;
 retryOpenItem(id:RequestId,ordinal:number,token:string):Promise<ClaimReply>;
 getIntakePolicy():Promise<IntakePolicy>;
 setIntakePolicy(policy:IntakePolicy):Promise<void>;
}

export const OPEN_REQUESTS_EVENT='somnia://open-requests';

function decodeBase64(data:string):Uint8Array{
 if(typeof data!=='string')throw new Error('read_by_grant contract violation: dataBase64 missing');
 const bin=atob(data);const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}

export function createOpenRequestClient(lis:OpenRequestsListen):OpenRequestClient{
 return{
  onOpenRequestsChanged:cb=>lis<{count:number}>(OPEN_REQUESTS_EVENT,e=>cb({count:Number(e.payload?.count??0)})),
  drainOpenRequests:()=>invokeCmd('drain_open_requests') as Promise<OpenRequestSummaryView[]>,
  claimOpenRequest:id=>invokeCmd('claim_open_request',{requestId:id},{corr:id}),
  async readByGrant(grant,corr){
   const raw:GrantRead=await invokeCmd('read_by_grant',{grant},{corr});
   return{name:raw.name,bytes:decodeBase64(raw.dataBase64),identityToken:raw.identityToken,size:raw.size};
  },
  async ackOpenRequest(id,outcomes){
   const reply=await invokeCmd('ack_open_request',{requestId:id,outcomes},{corr:id});
   // The D3 retry TTL contract needs expiresAt; hosts without it yield tokens the UI must not offer.
   return{retryTokens:(reply.retryTokens??[]) as IntakeRetryToken[]};
  },
  releaseCandidate:async id=>{await invokeCmd('release_candidate',{requestId:id},{corr:id});},
  retryOpenItem:(id,ordinal,token)=>invokeCmd('retry_open_item',{requestId:id,ordinal,retryToken:token},{corr:id}),
  getIntakePolicy:()=>invokeCmd('get_intake_policy'),
  setIntakePolicy:async policy=>{await invokeCmd('set_intake_policy',{allowUnc:policy.allowUnc});},
 };
}

/** Desktop wiring. Returns null outside the Tauri shell (web build has no native queue). */
export function createTauriOpenRequestClient():OpenRequestClient|null{
 if(!isTauri())return null;
 return createOpenRequestClient((event,handler)=>listen(event,handler));
}

export type {OpenRequestSummary};
