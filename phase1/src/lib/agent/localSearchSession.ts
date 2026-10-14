import {captureBuiltLocalIndex} from './localBuiltIndex';import {retrieveLocalPhraseReport} from './localPhraseSearch';import {validBatchProgress,type LocalBuildProgress} from './localSearchProgress';import {localSearchQueryReview} from './localSearchQuery';import {prepareLocalIndexChunks} from './localIndexChunks';import {LOCAL_EMBED_MODEL,type LocalEmbeddingAdapter} from './localEmbedding';import {captureLocalIndexDescriptor,emptyLocalIndex,beginLocalIndex,finishLocalIndex,invalidateLocalIndex,type LocalIndexDescriptor,type LocalIndexLifecycle} from './localIndexLifecycle';import {retrieveLocalTopK,type FrozenLocalVectors} from './localRetrieval';import {chunkLocalSources,type SearchSource} from './localSearch';
export interface LocalSearchCapture {endpoint:string;model:typeof LOCAL_EMBED_MODEL;digest:string;dimensions:number;sources:readonly SearchSource[]}
export interface LocalSearchAdapter {endpoint:string;embed:LocalEmbeddingAdapter['embed'];embedPrepared:LocalEmbeddingAdapter['embedPrepared']}
function capture(input:LocalSearchCapture):LocalSearchCapture{
 if(!input||Object.keys(input).some(k=>!['endpoint','model','digest','dimensions','sources'].includes(k))||input.model!==LOCAL_EMBED_MODEL||!input.sources.length)throw Error('Invalid selected search capture');
 chunkLocalSources(input.sources);const d=captureLocalIndexDescriptor({...input,sources:input.sources.map(s=>({id:s.id,revision:'capture'}))});
 return Object.freeze({endpoint:d.endpoint,model:LOCAL_EMBED_MODEL,digest:d.digest,dimensions:d.dimensions,sources:Object.freeze(input.sources.map(s=>Object.freeze({id:s.id,text:s.text})))});
}
/** One owner/panel session. No persistence or automatic source discovery/rebuild. */
export class LocalSearchSession {
 private lifecycle:LocalIndexLifecycle=emptyLocalIndex();private vectors:FrozenLocalVectors|null=null;private source:LocalSearchCapture|null=null;
 private buildAbort:AbortController|null=null;private queryAbort:AbortController|null=null;private queryGeneration=0;private closed=false;
 constructor(private adapter:LocalSearchAdapter,private recapture:()=>LocalSearchCapture){}
 status(){return this.closed?'closed':this.lifecycle.phase;}
 private available(){if(this.closed)throw Error('Search session closed');}
 private current(){this.available();return capture(this.recapture());}
 private assertSame(expected:LocalSearchCapture){const current=this.current();if(JSON.stringify(current)!==JSON.stringify(expected)){this.discard();throw Error('Selected search sources/model changed; rebuild required');}}
 private discard(){this.buildAbort?.abort();this.queryAbort?.abort();this.queryGeneration++;this.lifecycle=invalidateLocalIndex(this.lifecycle);this.vectors=null;this.source=null;}
 cancel(){this.discard();}
 close(){this.discard();this.closed=true;}
 async build(signal:AbortSignal,maxChunkBytes=2048,onProgress?:(value:LocalBuildProgress)=>void,batchSize=32):Promise<void>{
  this.available();if(![8,32].includes(batchSize))throw Error('Invalid embedding batch size');this.discard();signal.throwIfAborted();const initial=this.current();if(initial.endpoint!==this.adapter.endpoint)throw Error('Embedding adapter endpoint mismatch');
  const controller=new AbortController();this.buildAbort=controller;const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  let generation:number|undefined;
  try{
   onProgress?.({stage:'preparing',completed:0,total:0,sources:initial.sources.length});const prepared=await prepareLocalIndexChunks(initial.sources,maxChunkBytes);controller.signal.throwIfAborted();if(this.buildAbort!==controller)throw Error('Build replaced');this.assertSame(initial);
   const descriptor:LocalIndexDescriptor={endpoint:initial.endpoint,model:initial.model,digest:initial.digest,dimensions:initial.dimensions,sources:prepared.sources.map(({id,revision})=>({id,revision}))};
   this.lifecycle=beginLocalIndex(this.lifecycle,descriptor);generation=this.lifecycle.generation;
   let completed=0;onProgress?.({stage:'embedding',completed:0,total:prepared.chunks.length,sources:initial.sources.length});const vectors=await this.adapter.embedPrepared(descriptor,prepared,controller.signal,value=>{if(controller.signal.aborted||this.buildAbort!==controller||generation!==this.lifecycle.generation)return;this.assertSame(initial);completed=validBatchProgress(value,prepared.chunks.length,completed);onProgress?.({stage:'embedding',completed,total:prepared.chunks.length,sources:initial.sources.length});},batchSize);controller.signal.throwIfAborted();if(this.buildAbort!==controller||generation!==this.lifecycle.generation)throw Error('Build replaced');
   const validated=captureBuiltLocalIndex(descriptor,prepared,vectors);this.assertSame(initial);onProgress?.({stage:'validating',completed:prepared.chunks.length,total:prepared.chunks.length,sources:initial.sources.length});controller.signal.throwIfAborted();if(this.buildAbort!==controller)throw Error('Build replaced');this.lifecycle=finishLocalIndex(this.lifecycle,generation,descriptor);this.vectors=validated;this.source=initial;
  }catch(error){if(this.buildAbort===controller)this.discard();throw error;}
  finally{signal.removeEventListener('abort',abort);if(this.buildAbort===controller)this.buildAbort=null;controller.abort();}
 }
 phrase(text:string,limit=10,sourceId?:string){return this.phraseReport(text,limit,sourceId).results;}
 phraseReport(text:string,limit=10,sourceId?:string){this.available();this.queryAbort?.abort();this.queryGeneration++;const source=this.source,vectors=this.vectors;if(!source||!vectors||this.lifecycle.phase!=='ready')throw Error('Search index not ready');this.assertSame(source);return retrieveLocalPhraseReport(this.lifecycle,vectors.descriptor,vectors,text,limit,sourceId);}
 async query(text:string,signal:AbortSignal,limit=10,sourceId?:string){
  this.available();signal.throwIfAborted();this.queryAbort?.abort();const token=++this.queryGeneration;
  if(!localSearchQueryReview(text).valid||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Invalid explicit search query');
  const source=this.source,vectors=this.vectors;if(!source||!vectors||this.lifecycle.phase!=='ready')throw Error('Search index not ready');this.assertSame(source);if(sourceId!==undefined&&!source.sources.some(s=>s.id===sourceId))throw Error('Source focus outside indexed scope');
  const controller=new AbortController();this.queryAbort=controller;const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  try{
   const result=await this.adapter.embed([text],source.digest,source.dimensions,controller.signal);controller.signal.throwIfAborted();if(token!==this.queryGeneration||this.queryAbort!==controller)throw Error('Query replaced');this.assertSame(source);
   if(result.length!==1)throw Error('Invalid query vector count');return retrieveLocalTopK(this.lifecycle,vectors.descriptor,vectors,result[0],limit,sourceId);
  }finally{signal.removeEventListener('abort',abort);if(this.queryAbort===controller)this.queryAbort=null;controller.abort();}
 }
}
