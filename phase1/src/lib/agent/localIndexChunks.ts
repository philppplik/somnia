import {sha256Hex} from '../agentTask/hash';
import {chunkLocalSources,type SearchSource} from './localSearch';
export const INDEX_TEXT_PIPELINE='nfc-lf-codepoint-v1' as const;
/** Explicit text only. Preserve whitespace except newline/NFC canonicalization. */
export function normalizeLocalIndexText(text:string):string{
 if(typeof text!=='string'||new TextEncoder().encode(text).length>262144||/[\uD800-\uDFFF]/u.test(text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw Error('Invalid index text');
 return text.replace(/\r\n?/g,'\n').normalize('NFC');
}
/** Async local SHA-256 uses existing util. No network/filesystem/index persistence.
 * Revision binds original text AND pipeline/chunk size, not normalized equality. */
export async function prepareLocalIndexChunks(sources:readonly SearchSource[],maxChunkBytes=2048){
 // Validate original scope before normalization or any hashing; snapshot before await.
 chunkLocalSources(sources,maxChunkBytes);
 const raw=sources.map(s=>({id:s.id,text:s.text}));
 const normalized=raw.map(s=>({id:s.id,text:normalizeLocalIndexText(s.text)}));
 const chunks=chunkLocalSources(normalized,maxChunkBytes);
 const sourceRows=[];
 for(let i=0;i<raw.length;i++){
  const contentHash=await sha256Hex(raw[i].text);
  const normalizedHash=await sha256Hex(normalized[i].text);
  const revision=await sha256Hex(JSON.stringify([INDEX_TEXT_PIPELINE,maxChunkBytes,contentHash,normalizedHash]));
  sourceRows.push(Object.freeze({id:raw[i].id,contentHash,normalizedHash,revision}));
 }
 const hashed=[];
 for(const chunk of chunks){const contentHash=await sha256Hex(chunk.text);hashed.push(Object.freeze({...chunk,contentHash}));}
 return Object.freeze({pipeline:INDEX_TEXT_PIPELINE,maxChunkBytes,sources:Object.freeze(sourceRows),chunks:Object.freeze(hashed)});
}
