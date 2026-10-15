import type {DocumentRef,EffectClass} from './documentCore';
import type {AgentContext} from './coreTypes';

/** Host-owned execution boundary. Provider messages, manifests and UI metadata cannot grant it. */
export interface NativeActionContract {
 id:string;
 target:DocumentRef;
 effect:EffectClass;
 /** Immutable host preview identity, required for mutations. */
 reviewId?:string;
 /** Builder ports must report actual native history, not inferred success. */
 history:'one-native-entry'|'none';
}
export interface NativeActionReceipt {
 actionId:string;
 /** Pinned pre-action target, not the post-commit revision. */
 target:DocumentRef;
 outcome:'applied'|'noop'|'failed'|'unknown';
 undoEntries:0|1|null;
 readback:'verified'|'unverified';
}
export function assertNativeAction(action:NativeActionContract,current:DocumentRef,reviewId?:string):void {
 if(!['inspect','edit','disclose','external-effect'].includes(action.effect)||!['none','one-native-entry'].includes(action.history))throw Error('Invalid native effect or history contract.');
 if(!action.id.trim()||!action.target.documentId||!Number.isSafeInteger(action.target.revision)||action.target.revision<0)throw Error('Invalid native action target.');
 if(action.target.documentId!==current.documentId||action.target.path!==current.path||action.target.revision!==current.revision||action.target.adapter!==current.adapter||action.target.studioKind!==current.studioKind)throw Error('Native target changed. Refresh the preview.');
 if(action.effect==='external-effect'||action.effect==='disclose')throw Error('This action port does not authorize external effects or disclosure.');
 if(action.effect==='edit'&&(!action.reviewId||action.reviewId!==reviewId||action.history!=='one-native-entry'))throw Error('Native edit requires exact review and one native undo entry.');
 if(action.effect==='inspect'&&action.history!=='none')throw Error('Inspection cannot create history.');
}
export function assertNativeReceipt(action:NativeActionContract,receipt:NativeActionReceipt):void {
 if(!['applied','noop','failed','unknown'].includes(receipt.outcome)||![0,1,null].includes(receipt.undoEntries)||!['verified','unverified'].includes(receipt.readback))throw Error('Invalid native receipt.');
 assertNativeAction(action,receipt.target,action.reviewId);
 if(receipt.actionId!==action.id)throw Error('Wrong action receipt.');
 if(receipt.outcome==='applied'&&(action.effect!=='edit'||receipt.undoEntries!==1||receipt.readback!=='verified'))throw Error('Applied receipt requires verified readback and exactly one native undo entry.');
 if((receipt.outcome==='noop'||receipt.outcome==='failed')&&receipt.undoEntries!==0)throw Error('No-op and failed actions must create zero history entries.');
 if(receipt.outcome==='unknown'&&receipt.undoEntries!==null)throw Error('Unreconciled history stays unknown.');
}
/** Run-scoped choice, independent from saved provider settings. No fallback in this mode. */
export function assertLocalNativeRun(context:Pick<AgentContext,'executionMode'>,provider:string):void {
 if(context.executionMode==='local-native'&&provider!=='ollama')throw Error('Local-native mode requires Ollama. Choose a local model in Settings. No cloud fallback.');
}

export type NativeRunPhase='prepared'|'tool-running'|'tool-completed'|'tool-failed'|'review'|'applied'|'undone'|'done'|'failed'|'stopped';
export interface NativeRunEntry {phase:NativeRunPhase;target?:DocumentRef;tool?:string;proposalId?:string;contextBytes?:number;history:0|1|'unverified';readback:'verified'|'unverified';}
export interface NativeRunSnapshot {runId:string|null;provider:string;model:string;entries:readonly NativeRunEntry[];}
const empty=():NativeRunSnapshot=>({runId:null,provider:'',model:'',entries:[]});
/** Metadata only. Never retain prompt, arguments, tool results, document text, URLs or keys. */
export class NativeRunLedger {
 private value:NativeRunSnapshot=empty();private listeners=new Set<()=>void>();
 snapshot=()=>this.value;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(value:NativeRunSnapshot){this.value=Object.freeze({...value,entries:Object.freeze(value.entries.map(e=>Object.freeze({...e,...(e.target?{target:Object.freeze({...e.target})}:{} )})))});this.listeners.forEach(f=>{try{f();}catch{/* A view cannot affect execution. */}});}
 begin(runId:string,provider:string,model:string){this.publish({runId,provider,model,entries:[]});}
 record(runId:string,entry:NativeRunEntry){if(this.value.runId!==runId)return;this.publish({...this.value,entries:[...this.value.entries.slice(-63),{phase:entry.phase,history:entry.history,readback:entry.readback,...(entry.target?{target:{documentId:entry.target.documentId,path:entry.target.path,revision:entry.target.revision,adapter:entry.target.adapter,studioKind:entry.target.studioKind}}:{}),...(entry.tool?{tool:entry.tool}:{}),...(entry.proposalId?{proposalId:entry.proposalId}:{}),...(entry.contextBytes!==undefined?{contextBytes:entry.contextBytes}:{})}]});}
 clear(){this.publish(empty());}
}
export const nativeRunLedger=new NativeRunLedger();
