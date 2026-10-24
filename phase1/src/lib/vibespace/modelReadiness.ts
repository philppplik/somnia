/** Local model inventory + readiness for Vibe Space (mirrors vibespace-engine inventory.rs). Read-only: never pulls or downloads a model. */
import {OllamaProvider, isLoopbackHttp} from '../agent/providers/ollama';
export type LocalProviderId='ollama'|'lmstudio';
export interface LocalModel{id:string;sizeBytes?:number}
export type Readiness=
 |{state:'server-down';hintKey:'vs.model.hint.ollamaDown'|'vs.model.hint.lmsDown'}
 |{state:'model-missing';hintKey:'vs.model.hint.ollamaPull'|'vs.model.hint.lmsLoad';installed:LocalModel[]}
 |{state:'ready';modelId:string;installed:LocalModel[]};
/** The single local trial model (D11). */
export const TRIAL_MODEL_DISPLAY='Qwen3.5-9B';
export const TRIAL_PULL_COMMAND='ollama pull qwen3.5:9b';
export const LOCAL_BASE:Record<LocalProviderId,string>={ollama:'http://127.0.0.1:11434',lmstudio:'http://127.0.0.1:1234'};
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9.]/g,'');
/** qwen3.5:9b, qwen3.5-9b, Qwen3.5-9B-Instruct-GGUF match; qwen3.5:90b, qwen3.5:2b, qwen3:9b do not. */
export function isTrialModel(id:string):boolean{const n=norm(id);const i=n.indexOf('qwen3.5');if(i<0)return false;const rest=n.slice(i+7);return rest.startsWith('9b')&&!/^\d/.test(rest.slice(2));}
export function parseLmStudioModels(v:unknown):LocalModel[]{
 const d=(v as {data?:unknown})?.data;if(!Array.isArray(d))throw new Error('Unexpected LM Studio /v1/models response');
 return d.map(m=>{const id=(m as {id?:unknown})?.id;if(typeof id!=='string'||!id)throw new Error('Model entry without id');return {id};});
}
export function computeReadiness(provider:LocalProviderId,installed:LocalModel[]|null):Readiness{
 if(installed===null)return {state:'server-down',hintKey:provider==='ollama'?'vs.model.hint.ollamaDown':'vs.model.hint.lmsDown'};
 const hit=installed.find(m=>isTrialModel(m.id));
 if(hit)return {state:'ready',modelId:hit.id,installed};
 return {state:'model-missing',hintKey:provider==='ollama'?'vs.model.hint.ollamaPull':'vs.model.hint.lmsLoad',installed};
}
type FetchLike=(url:string,init?:RequestInit)=>Promise<Response>;
/** Loopback-only probe. Unreachable server -> server-down; malformed responses throw (shown as an error, never as "ready"). */
export async function probeLocal(provider:LocalProviderId,opts:{fetch?:FetchLike;baseUrl?:string;signal?:AbortSignal}={}):Promise<Readiness>{
 const base=opts.baseUrl??LOCAL_BASE[provider];
 if(!isLoopbackHttp(base))throw new Error('Local model endpoints must be http on loopback');
 const f:FetchLike=opts.fetch??((u,i)=>fetch(u,i));
 if(provider==='ollama'){
  const o=new OllamaProvider({baseUrl:base,fetch:f,retries:0} as never);
  const h=await o.health(opts.signal);
  if(!h.ok)return computeReadiness('ollama',null);
  const models=await o.listModels(opts.signal);
  return computeReadiness('ollama',models.map(m=>({id:m.id,sizeBytes:m.sizeBytes})));
 }
 let r:Response;
 try{r=await f(base.replace(/\/+$/,'')+'/v1/models',{signal:opts.signal,redirect:'error'});}catch{return computeReadiness('lmstudio',null);}
 if(!r.ok)throw new Error('LM Studio returned HTTP '+r.status);
 return computeReadiness('lmstudio',parseLmStudioModels(await r.json()));
}
