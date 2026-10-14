import {localCitationSpan} from './localCitationSpan';import type {SearchChunk} from './localSearch';
/** Raw lines for the proved UTF-16 selection. CRLF/CR count as one newline. */
export function localCitationTarget(raw:string,chunk:SearchChunk){const span=localCitationSpan(raw,chunk);if(!span)return null;const lineAt=(at:number)=>{if(raw[at]==='\n'&&raw[at-1]==='\r')at--;return 1+(raw.slice(0,at).match(/\r\n?|\n/g)?.length??0);};return Object.freeze({span:Object.freeze(span),firstLine:lineAt(span.from),lastLine:lineAt(Math.max(span.from,span.to-1))});}
