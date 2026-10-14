import {buildOfficeLocalPrompt} from './officeLocalPrompt';
export type OfficeSummaryLength='brief'|'standard';
/** Fixed request style, not a promise of measured model quality or exact length. */
export function prepareOfficeSummary(kind:'documents'|'slides',text:string,length:OfficeSummaryLength='standard'){
 if(!['brief','standard'].includes(length))throw Error('Unsupported summary length');
 const base=buildOfficeLocalPrompt({kind,task:'summarize-selection',texts:[text]});
 return {prompt:(length==='brief'?'Aim for one or two short sentences. Preserve key qualifications; do not add unsupported facts.\n':'Aim for a short paragraph. Preserve key qualifications; do not add unsupported facts.\n')+base.prompt,outputLimit:length==='brief'?192:base.outputLimit,maxBytes:length==='brief'?2048:4096};
}
