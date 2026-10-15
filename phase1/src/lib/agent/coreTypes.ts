import type {ChangeSet, Decisions} from '../agentDiff';
export interface AgentContext {executionMode?:'local-native';localContext?:import('./localAssistant').LocalContextChoices;task?:import('./taskRouting').LocalTask;activeFile:string;selectedElementId:string|null;disclosureProvider?:string;activeMedia?:string;studio?:import('./studioContextAdapter').AgentStudioContext}
export interface AgentRequest {prompt:string;context:AgentContext}
export type DiffLine={kind:'add'|'del'|'ctx';text:string};
export interface AgentProposal {id:string;file:string;lines:DiffLine[];added:number;removed:number;changeSet?:ChangeSet;native?:import('./documentCore').NativeProposal;rangePreview?:{address:string;before:string[];values:string[][]};textEdit?:{label:string;before:string;after:string};sheets?:{address:string;before:string;after:string};photo?:import('./photoStudio').PhotoPreview}
export type ApprovalDecision='accept'|'accept_for_session'|'decline'|'cancel';
export interface AgentApproval {id:string;path:string;action:string;resolve:(decision:ApprovalDecision)=>void}
export type AgentEvent =
 | {type:'status';text:string;file?:string}
 | {type:'text-delta';text:string}
 | {type:'provenance';provider:string;model:string}
 | {type:'proposal';proposal:AgentProposal}
 | {type:'approval';approval:AgentApproval}
 | {type:'usage';inputTokens?:number;outputTokens?:number;costUsd?:number}
 | {type:'done'} | {type:'error';message:string;code?:string;detail?:import('./errors').AgentErrorDetail;retryable?:boolean};
export interface AgentRun {cancel():void}
export interface AgentCore {
 run(request:AgentRequest,onEvent:(event:AgentEvent)=>void):AgentRun;
 applyProposal(id:string,decisions?:Decisions):Promise<void>;
 rejectProposal(id:string):Promise<void>;
 revertProposal(id:string):Promise<void>;
 clear?():void;
}
