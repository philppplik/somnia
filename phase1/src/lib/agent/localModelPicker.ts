import {LOCAL_MODEL_CATALOG,estimateFit,type Hardware} from './localModelAdvice';
export type ModelTask='text'|'vision'|'tools';
/** Candidate ordering is smallest exact tag first, not a claim of best measured quality. */
export function recommendedModelCandidates(task:ModelTask,hardware:Hardware|null){
 return LOCAL_MODEL_CATALOG.filter(entry=>entry.candidateTasks.includes(task)).slice().sort((a,b)=>(a.estimatedBytes??Infinity)-(b.estimatedBytes??Infinity)).map(entry=>({entry,fit:estimateFit(entry.estimatedBytes,hardware)}));
}

/** Text suggestion only. No allocation, download, selection or quality promise. */
export function deviceModelSuggestion(hardware:Hardware|null):string|null{
 if(!hardware||!Number.isFinite(hardware.checkedAt)||Date.now()-hardware.checkedAt>60000||hardware.checkedAt>Date.now())return null;
 return recommendedModelCandidates('text',hardware).find(({fit})=>['estimated-gpu','estimated-ram','may-offload'].includes(fit.label))?.entry.tag??null;
}
