import {AgentError} from './errors';
import type {AgentProviderRequest} from './types';
import {localContextBudgetReport} from './localContextReport';
/** Deliberately conservative byte budget, not a tokenizer or proof of model capacity.
 * Reserve requested output plus 256 framing tokens; one UTF-8 byte per remaining
 * token avoids pretending char/4 works for German, code, emoji or tool schemas.
 * Images use a separate validated path; encoded image bytes are not text tokens. */
export function checkLocalContext(request:AgentProviderRequest,numCtx?:number){
 if(numCtx===undefined)return;
 if(!Number.isSafeInteger(numCtx)||numCtx<1||numCtx>1048576)throw new AgentError('limit','context','Invalid requested local context limit.');
 const report=localContextBudgetReport(request,numCtx);
 if(report.state==='invalid'||report.state==='exceeded')throw new AgentError('limit','context','Local context byte safety budget exceeded. Shorten context, lower output budget or explicitly increase requested context.');
}
