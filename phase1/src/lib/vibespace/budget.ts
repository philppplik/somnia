import {invoke} from '@tauri-apps/api/core';import type {Studio} from './types';
export interface BoardBudget{enabled:boolean;reportedTokenStop:number}
export interface BudgetState{budget:BoardBudget;reportedTokens:number|null}
export interface BudgetIO{read:(spaceId:string)=>Promise<BudgetState>;save:(spaceId:string,budget:BoardBudget)=>Promise<void>}
export function parseBudget(value:unknown):BudgetState{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['budget','reportedTokens'].includes(k)))throw Error('Invalid budget');const v=value as BudgetState;const b=v.budget;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['enabled','reportedTokenStop'].includes(k))||typeof b.enabled!=='boolean'||!Number.isSafeInteger(b.reportedTokenStop)||b.reportedTokenStop<1||b.reportedTokenStop>1e9||(v.reportedTokens!==null&&(!Number.isSafeInteger(v.reportedTokens)||v.reportedTokens<0)))throw Error('Invalid budget');return v;}
export const nativeBudgetIO:BudgetIO={read:async spaceId=>parseBudget(await invoke('vibespace_board_budget',{request:{spaceId}})),save:async(spaceId,budget)=>{parseBudget({budget,reportedTokens:0});await invoke('vibespace_board_budget_save',{request:{spaceId,budget}});}};
export function reportedRunUsage(run:Studio){return {input:run.usage?.inputTokens??null,output:run.usage?.outputTokens??null,cost:run.model.locality==='local'?null:run.usage?.costUsd??null,source:run.usage?.costSource??null};}
/** Suggestion only, never an execution decision or a promise of local-model eligibility. */
export function localFallbackSuggestion(run:Studio):'inspect-local'|'smaller-local'|null{return run.failure||run.executionState==='stopped'?run.model.locality==='cloud'?'inspect-local':'smaller-local':null;}
