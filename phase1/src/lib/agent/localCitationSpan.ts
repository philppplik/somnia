import {chunkLocalSources,type SearchChunk} from './localSearch';import {normalizeLocalIndexText} from './localIndexChunks';
export interface LocalCitationSpan {from:number;to:number;raw:string}
/** Ordinal/whole-text reconstruction, never substring-find. NFC-changing text has
 * no proved offset mapping here: decline highlight rather than guess a cursor. */
export function localCitationSpan(raw:string,chunk:SearchChunk,maxChunkBytes=2048):LocalCitationSpan|null{
 try{const normalized=normalizeLocalIndexText(raw),lf=raw.replace(/\r\n?/g,'\n');if(lf!==normalized)return null;const chunks=chunkLocalSources([{id:chunk.sourceId,text:normalized}],maxChunkBytes);const exact=chunks[chunk.index];if(!exact||exact.text!==chunk.text)return null;const start=chunks.slice(0,chunk.index).reduce((n,c)=>n+c.text.length,0),end=start+exact.text.length;const offsets=[0];for(let i=0;i<raw.length;i++){if(raw[i]==='\r'&&raw[i+1]==='\n')i++;offsets.push(i+1);}const from=offsets[start],to=offsets[end];if(from===undefined||to===undefined)return null;return {from,to,raw};}catch{return null;}
}
