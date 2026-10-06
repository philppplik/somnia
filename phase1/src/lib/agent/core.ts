import type {ChangeSet, Decisions} from '../agentDiff';
export interface AgentContext {activeFile:string;selectedElementId:string|null}
export interface AgentRequest {prompt:string;context:AgentContext}
export type DiffLine={kind:'add'|'del'|'ctx';text:string};
export interface AgentProposal {id:string;file:string;lines:DiffLine[];added:number;removed:number;changeSet?:ChangeSet}
export type ApprovalDecision='accept'|'accept_for_session'|'decline'|'cancel';
export interface AgentApproval {id:string;path:string;action:string;resolve:(decision:ApprovalDecision)=>void}
export type AgentEvent =
 | {type:'status';text:string;file?:string}
 | {type:'text-delta';text:string}
 | {type:'proposal';proposal:AgentProposal}
 | {type:'approval';approval:AgentApproval}
 | {type:'usage';inputTokens?:number;outputTokens?:number;costUsd?:number}
 | {type:'done'} | {type:'error';message:string};
export interface AgentRun {cancel():void}
export interface AgentCore {
 run(request:AgentRequest,onEvent:(event:AgentEvent)=>void):AgentRun;
 applyProposal(id:string,decisions?:Decisions):Promise<void>;
 rejectProposal(id:string):Promise<void>;
 revertProposal(id:string):Promise<void>;
 clear?():void;
}
let active:AgentCore|null=null;
export function setAgentCore(core:AgentCore|null){active=core;}
export async function getAgentCore():Promise<AgentCore>{
 if(active)return active;
 const {realCore}=await import('./panelBridge');return realCore;
}
