import type {CommandSpec} from '../commandSpec';import {commandToolName} from './commandTools';
/** Readiness is descriptive, never a permission or execute-level upgrade. */
export function agentCommandReadiness(spec:CommandSpec,host='shared'){
 const named=commandToolName(spec.id);const parameterState=spec.params?'declared':'missing';const resultState=spec.result?'declared':'missing';
 return {id:spec.id,title:spec.title,host,level:spec.level,parameterState,resultState,toolName:named??null,eligibility:!named?'invalid-tool-name':spec.level==='ui'?'interactive-only':!spec.params?'untyped-not-ready':spec.level==='read'?'read-schema-candidate':'reviewed-proposal-candidate',enginePort:'unverified' as const,undo:'unverified' as const,enabledNow:null,reason:spec.level==='ui'?'Agent origin remains forbidden. Native target/effect/transaction contract required.':'Existing bridge may expose read/propose only; schema validation, target scope and result/engine evidence still required.'};
}
