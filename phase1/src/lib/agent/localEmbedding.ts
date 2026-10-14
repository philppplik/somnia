import {sha256Hex} from '../agentTask/hash';
import {INDEX_TEXT_PIPELINE} from './localIndexChunks';
import {localOrigin,parseInventory,parseEvidence} from './localModels';import {ProviderError} from './errors';import {agentPrivacy,type AgentPrivacyGate} from './privacy';import {captureLocalIndexDescriptor,type LocalIndexDescriptor} from './localIndexLifecycle';import {captureLocalVectors} from './localRetrieval';import {prepareLocalIndexChunks} from './localIndexChunks';
export const LOCAL_EMBED_MODEL='embeddinggemma:300m';
export class LocalEmbeddingAdapter {
 readonly endpoint:string;
 constructor(endpoint='http://127.0.0.1:11434',private transport:typeof fetch=fetch,private timeoutMs=30000,private gate:AgentPrivacyGate=agentPrivacy){this.endpoint=localOrigin(endpoint);if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw Error('Invalid embedding timeout');}
 async embed(texts:readonly string[],digest:string,dimensions:number,signal:AbortSignal):Promise<readonly (readonly number[])[]>{
  const descriptor=captureLocalIndexDescriptor({endpoint:this.endpoint,model:LOCAL_EMBED_MODEL,digest,dimensions,sources:[{id:'explicit',revision:'request'}]});
  if(!Array.isArray(texts)||!texts.length||texts.length>32||texts.some(t=>typeof t!=='string'||!t.trim()||new TextEncoder().encode(t).length>4096||/[\uD800-\uDFFF\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(t))||texts.reduce((n,t)=>n+new TextEncoder().encode(t).length,0)>131072)throw new ProviderError('protocol','Invalid explicit embedding texts');
  const input=[...texts];const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();const timer=setTimeout(abort,this.timeoutMs);
  const request=async(path:string,body?:object)=>{
   controller.signal.throwIfAborted();let rejectAbort=()=>{};const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new ProviderError('timeout','Embedding operation stopped'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});const response=this.transport(this.endpoint+path,{method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),redirect:'error',signal:controller.signal});let r:Response;try{r=await Promise.race([response,aborted]);}finally{controller.signal.removeEventListener('abort',rejectAbort);}controller.signal.throwIfAborted();
   if(!r.ok)throw new ProviderError(r.status===404?'model-not-found':'http','Local embedding request failed');if(!r.body)throw new ProviderError('protocol','Missing local embedding response');
   const reader=r.body.getReader();const cancel=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancel,{once:true});let size=0,text='';const decoder=new TextDecoder();try{for(;;){controller.signal.throwIfAborted();const part=await reader.read();controller.signal.throwIfAborted();if(part.done)break;size+=part.value.length;if(size>4_000_000)throw new ProviderError('protocol','Local embedding response too large');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();try{return JSON.parse(text);}catch{throw new ProviderError('protocol','Invalid local embedding JSON');}}finally{controller.signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  };
  const checkDigest=async()=>{const models=parseInventory(await request('/api/tags'));if(models.find(m=>m.id===LOCAL_EMBED_MODEL)?.digest!==descriptor.digest)throw new ProviderError('not-local','Exact embedding model digest changed or missing');};
  try{
   await checkDigest();const evidence=parseEvidence(LOCAL_EMBED_MODEL,await request('/api/show',{model:LOCAL_EMBED_MODEL}));if(evidence.locality!=='reported-local'||!evidence.capabilities?.includes('embedding'))throw new ProviderError('not-local','Verified local embedding capability required');
   const target={provider:'ollama',endpoint:this.endpoint,processing:'local' as const};this.gate.assert(target);
   const result=await this.gate.run(target,async()=>request('/api/embed',{model:LOCAL_EMBED_MODEL,input,truncate:false,keep_alive:0}),controller.signal);
   controller.signal.throwIfAborted();if(!result||result.model!==LOCAL_EMBED_MODEL||!Array.isArray(result.embeddings)||result.embeddings.length!==input.length||result.embeddings.some((v:unknown)=>!Array.isArray(v)||v.length!==dimensions||!v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6)||!v.some(n=>n!==0)))throw new ProviderError('protocol','Invalid local embedding vectors');
   await checkDigest();controller.signal.throwIfAborted();return Object.freeze(result.embeddings.map((v:number[])=>Object.freeze([...v])));
  }catch(error){if(controller.signal.aborted)throw new ProviderError('timeout',signal.aborted?'Embedding request cancelled':'Embedding request timed out');if(error instanceof ProviderError)throw error;throw new ProviderError('protocol','Local embedding verification or transport failed');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
 }
 /** AT source revisions bind before transport; AU frozen vector output only, no ready commit. */
 async embedPrepared(descriptor:LocalIndexDescriptor,prepared:Awaited<ReturnType<typeof prepareLocalIndexChunks>>,signal:AbortSignal){
  const captured=captureLocalIndexDescriptor(descriptor);if(captured.endpoint!==this.endpoint||captured.model!==LOCAL_EMBED_MODEL||JSON.stringify(captured.sources)!==JSON.stringify(prepared.sources.map(({id,revision})=>({id,revision}))))throw new ProviderError('protocol','Embedding preparation descriptor mismatch');
  // Validate full source/chunk shape/dimensions before transmitting any batch.
  if(prepared.pipeline!==INDEX_TEXT_PIPELINE||!Number.isSafeInteger(prepared.maxChunkBytes)||prepared.maxChunkBytes<64||prepared.maxChunkBytes>4096)throw new ProviderError('protocol','Invalid embedding pipeline');
  const copied=structuredClone(prepared);
  const dummy=copied.chunks.map(({contentHash,...chunk})=>({chunk,vector:Array.from({length:captured.dimensions},(_,i)=>i===0?1:0)}));captureLocalVectors(captured,dummy);
  for(const chunk of copied.chunks)if(await sha256Hex(chunk.text)!==chunk.contentHash||new TextEncoder().encode(chunk.text).length>copied.maxChunkBytes)throw new ProviderError('protocol','Embedding chunk hash mismatch');
  for(const source of copied.sources){const chunks=copied.chunks.filter(c=>c.sourceId===source.id);if(chunks.some((c,i)=>c.index!==i)||!/^[a-f0-9]{64}$/.test(source.contentHash)||await sha256Hex(chunks.map(c=>c.text).join(''))!==source.normalizedHash||await sha256Hex(JSON.stringify([INDEX_TEXT_PIPELINE,copied.maxChunkBytes,source.contentHash,source.normalizedHash]))!==source.revision)throw new ProviderError('protocol','Embedding source hash mismatch');}
  signal.throwIfAborted();
  const entries=[];for(let at=0;at<dummy.length;at+=32){signal.throwIfAborted();const batch=dummy.slice(at,at+32);const vectors=await this.embed(batch.map(e=>e.chunk.text),captured.digest,captured.dimensions,signal);for(let i=0;i<batch.length;i++)entries.push({chunk:batch[i].chunk,vector:vectors[i]});}
  signal.throwIfAborted();return captureLocalVectors(captured,entries);
 }
}
