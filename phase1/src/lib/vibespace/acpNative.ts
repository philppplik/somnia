/** Native ACP bridge client (Welle-B A2). Typed wrappers over the vibespace_acp_* commands and
 * the private `somnia://vibespace-acp` change channel. Consent is decided through
 * `decideConsent` (the same broker as every other run); this file never invents availability
 * and has no fallback when the native bridge is missing. */
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {NativeVibeIO} from './native';
import {describeAcpTranscript,describeConsentOrigin,type AcpLine} from './acpPresentation';

export const ACP_CHANNEL='somnia://vibespace-acp';
export const acpCommands={launch:'vibespace_acp_launch',session:'vibespace_acp_session',prompt:'vibespace_acp_prompt',consent:'vibespace_acp_decide_consent',cancel:'vibespace_acp_cancel',state:'vibespace_acp_state'} as const;

export type AcpStatus='awaiting_approval'|'ready'|'failed'|'closed';
export type AcpChoice='allow_once'|'allow_for_run'|'deny';
export interface AcpPendingConsent{requestId:string;kind:string;target:string;reason:string;allowForRun:boolean;origin:AcpLine|null}
export interface AcpSessionState{status:AcpStatus;failure:string|null;runId:string;name:string;pending:AcpPendingConsent[];transcript:AcpLine[];lastSessionId:string|null}

const STATUSES:readonly string[]=['awaiting_approval','ready','failed','closed'];
const str=(v:unknown,max=300):string=>typeof v==='string'?v.slice(0,max):'';

/** Strict parse of the native state reply; anything unexpected is rejected, never guessed. */
export function parseAcpState(raw:unknown):AcpSessionState{
 const r=raw as Record<string,unknown>|null;
 if(!r||typeof r!=='object'||typeof r.status!=='string'||!STATUSES.includes(r.status))throw new Error('acp_state_invalid');
 const pending=(Array.isArray(r.pending)?r.pending:[]).map((p):AcpPendingConsent=>{
  const o=p as Record<string,unknown>;
  const offered=Array.isArray(o.offered)?o.offered:[];
  return{requestId:str(o.requestId,128),kind:str(o.kind,20),target:str(o.target,300),reason:str(o.reason,500),allowForRun:offered.includes('allow_for_run'),
   origin:describeConsentOrigin(o.origin as {type?:string;name?:string}|null)};
 });
 const events=Array.isArray(r.events)?r.events as {kind?:string;data?:Record<string,unknown>}[]:[];
 return{status:r.status as AcpStatus,failure:typeof r.failure==='string'?r.failure:null,runId:str(r.runId,128),name:str(r.name,80),pending,transcript:describeAcpTranscript(events),lastSessionId:typeof r.lastSessionId==='string'?r.lastSessionId:null};
}

export interface AcpClientBinding{
 launch(spec:{name:string;program:string;args?:string[]}):Promise<{sessionKey:string;runId:string}>;
 openSession(sessionKey:string,resume?:boolean):Promise<string>;
 prompt(sessionKey:string,text:string):Promise<string>;
 decideConsent(sessionKey:string,requestId:string,choice:AcpChoice):Promise<void>;
 cancel(sessionKey:string,opts?:{graceMs?:number;close?:boolean}):Promise<void>;
 state(sessionKey:string):Promise<AcpSessionState>;
 /** Calls back with the session key whenever status, events or pending consent changed. */
 onChanged(handler:(sessionKey:string,reason:string)=>void):Promise<()=>void>;
}

export function createAcpClient(io?:NativeVibeIO):AcpClientBinding{
 const i=io??{invoke,listen:(c:string,h:(e:{payload:unknown})=>void)=>listen<unknown>(c,h)};
 return{
  launch:async spec=>{const r=await i.invoke(acpCommands.launch,{request:{name:spec.name,program:spec.program,args:spec.args??[]}}) as {sessionKey?:unknown;runId?:unknown};
   if(typeof r?.sessionKey!=='string'||typeof r?.runId!=='string')throw new Error('acp_launch_invalid');return{sessionKey:r.sessionKey,runId:r.runId};},
  openSession:async(sessionKey,resume=false)=>String(await i.invoke(acpCommands.session,{request:{sessionKey,resume}})),
  prompt:async(sessionKey,text)=>String(await i.invoke(acpCommands.prompt,{request:{sessionKey,text}})),
  decideConsent:async(sessionKey,requestId,choice)=>{await i.invoke(acpCommands.consent,{request:{sessionKey,requestId,choice}});},
  cancel:async(sessionKey,opts={})=>{await i.invoke(acpCommands.cancel,{request:{sessionKey,graceMs:opts.graceMs??0,close:opts.close??false}});},
  state:async sessionKey=>parseAcpState(await i.invoke(acpCommands.state,{request:{sessionKey}})),
  onChanged:handler=>i.listen(ACP_CHANNEL,e=>{const p=e.payload as {sessionKey?:unknown;reason?:unknown}|null;if(p&&typeof p.sessionKey==='string')handler(p.sessionKey,typeof p.reason==='string'?p.reason:'');}),
 };
}
