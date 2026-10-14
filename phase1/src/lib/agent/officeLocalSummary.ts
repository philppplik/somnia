import {prepareOfficeSummary,type OfficeSummaryLength} from './officeSummaryLength';import type {AgentProvider} from './types';
/** Text-only execution; host owns exact source lease and guarded local provider. */
export async function officeLocalSummary(kind:'documents'|'slides',textInput:string,assertCurrent:()=>void,provider:AgentProvider,model:string,signal:AbortSignal,length:OfficeSummaryLength='standard'){
 signal.throwIfAborted();assertCurrent();if(provider.id!=='ollama'||provider.locality!=='local'||!model.trim())throw Error('Local summary model required');
 const {prompt,outputLimit,maxBytes}=prepareOfficeSummary(kind,textInput,length);let text='',complete=false;
 for await(const event of provider.stream({model,messages:[{role:'user',content:prompt}],tools:[],maxOutputTokens:outputLimit,signal})){signal.throwIfAborted();assertCurrent();if(complete&&event.type!=='usage')throw Error('Output after completion');if(event.type==='tool-call')throw Error('Summary tool call refused');if(event.type==='text'){text+=event.text;if(new TextEncoder().encode(text).length>maxBytes||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text))throw Error('Invalid summary output');}if(event.type==='finish'){if(event.reason!=='stop')throw Error('Incomplete summary');complete=true;}}
 signal.throwIfAborted();assertCurrent();if(/[\uD800-\uDFFF]/u.test(text)||!complete||!text.trim())throw Error('Incomplete summary');return Object.freeze({text,model,provider:'ollama' as const,applied:false as const});
}
