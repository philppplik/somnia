import {prepareLocalIndexChunks} from '../../src/lib/agent/localIndexChunks';
import {captureLocalVectors,retrieveLocalSemanticReport} from '../../src/lib/agent/localRetrieval';
import {retrieveLocalPhraseReport} from '../../src/lib/agent/localPhraseSearch';
import {beginLocalIndex,emptyLocalIndex,finishLocalIndex} from '../../src/lib/agent/localIndexLifecycle';
import {sources as originalSources,queries as originalQueries,expandedSources,expandedQueries,type EvalSource,type EvalQuery} from './corpus';
/** Chunk precision: each returned chunk is relevant iff its source is labelled relevant.
 * Denominator is fixed k, missing slots are misses. Duplicates count as returned chunks.
 * This metric does not measure factuality, recall or source diversity. */
export function precisionAtK(ids:readonly string[],relevant:readonly string[],k:number){if(!Number.isSafeInteger(k)||k<1||k>50||!Array.isArray(ids)||!Array.isArray(relevant)||ids.some(id=>typeof id!=='string')||relevant.some(id=>typeof id!=='string'))throw Error('Invalid metric inputs');return ids.slice(0,k).filter(id=>relevant.includes(id)).length/k;}
const topicVector=(topic:number,dimensions:number)=>Array.from({length:dimensions},(_,i)=>i===topic?1:0);
export async function evaluateFixture(expanded=false){
 const sources:readonly EvalSource[]=expanded?expandedSources:originalSources.map(s=>({...s,tags:['short']}));const queries:readonly EvalQuery[]=expanded?expandedQueries:originalQueries.map(q=>({...q,tags:['baseline']}));const dimensions=Math.max(...sources.map(s=>s.topic))+1;
 const prepared=await prepareLocalIndexChunks(sources.map(({id,text})=>({id,text})));
 const descriptor={endpoint:'http://127.0.0.1:11434',model:'embeddinggemma:300m',digest:'hand-authored-topic-vectors-not-a-model',dimensions,sources:prepared.sources.map(({id,revision})=>({id,revision}))};
 const vectors=captureLocalVectors(descriptor,prepared.chunks.map(({contentHash,...chunk})=>({chunk,vector:topicVector(sources.find(source=>source.id===chunk.sourceId)!.topic,dimensions)})));
 const building=beginLocalIndex(emptyLocalIndex(),descriptor),ready=finishLocalIndex(building,building.generation,descriptor);
 const rows=queries.flatMap(query=>[1,3].flatMap(k=>{
  const semantic=retrieveLocalSemanticReport(ready,descriptor,vectors,topicVector(query.topic,dimensions),k).results.map(r=>r.chunk.sourceId);
  const literal=retrieveLocalPhraseReport(ready,descriptor,vectors,query.text,k).results.map(r=>r.chunk.sourceId);
  return [{id:query.id,locale:query.locale,tags:query.tags,k,mode:'synthetic-topic-vector' as const,precision:precisionAtK(semantic,query.relevant,k),returned:semantic},{id:query.id,locale:query.locale,tags:query.tags,k,mode:'literal-baseline' as const,precision:precisionAtK(literal,query.relevant,k),returned:literal}];
 }));
 return {evidence:`hand-labelled corpus and hand-authored${dimensions}D topic vectors; NO real embeddings or model quality measured`,corpus:expanded?'expanded-v2':'original-v1',queryInventory:queries.map(({id,locale,text,relevant,tags})=>({id,locale,text,relevant,tags})),chunkInventory:prepared.chunks.map(({sourceId,index,contentHash,text})=>({sourceId,index,contentHash,utf8Bytes:new TextEncoder().encode(text).length})),sourceInventory:prepared.sources.map(source=>({id:source.id,rawHash:source.contentHash,normalizedHash:source.normalizedHash,revision:source.revision,chunks:prepared.chunks.filter(c=>c.sourceId===source.id).length,tags:sources.find(s=>s.id===source.id)!.tags})),sources:sources.length,chunks:prepared.chunks.length,queries:queries.length,rows,summary:['en','de'].flatMap(locale=>[1,3].flatMap(k=>['synthetic-topic-vector','literal-baseline'].map(mode=>{const selected=rows.filter(r=>r.locale===locale&&r.k===k&&r.mode===mode);return {locale,k,mode,macroPrecision:selected.reduce((n,r)=>n+r.precision,0)/selected.length};})))};
}
