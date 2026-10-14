import {rankLocalChunks,type EmbeddedChunk} from './localSearch';
import {captureLocalIndexDescriptor,assertLocalIndexReady,type LocalIndexDescriptor,type LocalIndexLifecycle} from './localIndexLifecycle';
export interface FrozenLocalVectors {descriptor:LocalIndexDescriptor;entries:readonly EmbeddedChunk[]}
/** Vector/text snapshot from explicit host sources; pure, no storage or inferred files. */
export function captureLocalVectors(descriptor:LocalIndexDescriptor,entries:readonly EmbeddedChunk[]):FrozenLocalVectors{
 const captured=captureLocalIndexDescriptor(descriptor);
 if(!Array.isArray(entries)||!entries.length||entries.length>256)throw Error('Invalid retrieval entries');
 const sources=new Set(captured.sources.map(s=>s.id)),keys=new Set<string>();let total=0;
 const copied=entries.map(entry=>{
  if(!entry||typeof entry!=='object'||Object.keys(entry).some(k=>!['chunk','vector'].includes(k))||!entry.chunk||typeof entry.chunk!=='object'||Array.isArray(entry.chunk)||Object.keys(entry.chunk).some(k=>!['sourceId','index','text'].includes(k)))throw Error('Invalid retrieval fields');
  const c=entry.chunk;const key=JSON.stringify([c.sourceId,c.index]);
  if(!sources.has(c.sourceId)||keys.has(key)||!Number.isSafeInteger(c.index)||c.index<0||c.index>255||typeof c.text!=='string'||!c.text||/[\uD800-\uDFFF]/u.test(c.text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(c.text))throw Error('Invalid retrieval chunk');
  keys.add(key);total+=new TextEncoder().encode(c.text).length;if(total>262144)throw Error('Retrieval text exceeds limit');
  if(!Array.isArray(entry.vector)||entry.vector.length!==captured.dimensions)throw Error('Retrieval dimension mismatch');
  return Object.freeze({chunk:Object.freeze({sourceId:c.sourceId,index:c.index,text:c.text}),vector:Object.freeze([...entry.vector])});
 });
 // Reuse AL's finite/nonzero/bounded value and per-chunk UTF-8 guards.
 rankLocalChunks(copied[0].vector,copied,1);
 for(const source of sources)if(!copied.some(e=>e.chunk.sourceId===source))throw Error('Missing declared retrieval source');
 return Object.freeze({descriptor:captured,entries:Object.freeze(copied)});
}
/** Revalidates detached input even if caller forged a snapshot. Fresh host capture is
 * required; this isn't a lease or proof that vectors derive from those source hashes. */
export function retrieveLocalTopK(lifecycle:LocalIndexLifecycle,current:LocalIndexDescriptor,snapshot:FrozenLocalVectors,query:readonly number[],limit=10){
 assertLocalIndexReady(lifecycle,current);
 const captured=captureLocalVectors(snapshot.descriptor,snapshot.entries);
 if(JSON.stringify(captured.descriptor)!==JSON.stringify(captureLocalIndexDescriptor(current)))throw Error('Retrieval descriptor drift');
 if(!Array.isArray(query)||query.length!==captured.descriptor.dimensions)throw Error('Query dimension mismatch');
 const results=rankLocalChunks(query,captured.entries,limit).map(result=>Object.freeze({chunk:Object.freeze(result.chunk),score:result.score,trust:'untrusted' as const,confidence:'not-measured' as const,permission:false as const}));
 return Object.freeze(results);
}
