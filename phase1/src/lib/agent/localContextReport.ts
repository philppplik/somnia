import type {AgentProviderRequest} from './types';
export interface LocalContextBudgetReport {
 state:'unknown'|'invalid'|'fits'|'exceeded';requestedContext:number|null;outputReserve:number;
 framingReserve:256;payloadBytes:number;availableBytes:number|null;overflowBytes:number|null;
 imageBudget:'not-present'|'unknown';tokenization:'not-measured';daemonCapacity:'unverified';
}
/** Same conservative accounting as the existing guard: serialized messages (excluding
 * image binary) + tools, one byte per remaining token. No reads, truncation or I/O. */
export function localContextBudgetReport(request:AgentProviderRequest,numCtx?:number):LocalContextBudgetReport{
 const payload={messages:request.messages.map(({images,...message})=>message),tools:request.tools};
 const payloadBytes=new TextEncoder().encode(JSON.stringify(payload)).length;
 const base={requestedContext:numCtx??null,outputReserve:request.maxOutputTokens,framingReserve:256 as const,payloadBytes,imageBudget:request.messages.some(m=>m.images?.length)?'unknown' as const:'not-present' as const,tokenization:'not-measured' as const,daemonCapacity:'unverified' as const};
 if(numCtx===undefined)return Object.freeze({...base,state:'unknown',availableBytes:null,overflowBytes:null});
 if(!Number.isSafeInteger(numCtx)||numCtx<1||numCtx>1048576||!Number.isSafeInteger(request.maxOutputTokens)||request.maxOutputTokens<1)return Object.freeze({...base,state:'invalid',availableBytes:null,overflowBytes:null});
 const availableBytes=numCtx-request.maxOutputTokens-256;
 const overflowBytes=Math.max(0,payloadBytes-availableBytes);
 return Object.freeze({...base,state:availableBytes<1||payloadBytes>availableBytes?'exceeded':'fits',availableBytes,overflowBytes});
}
