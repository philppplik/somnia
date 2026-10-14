import {AgentError,toAgentError} from './errors';
import type {AgentProvider,AgentProviderRequest} from './types';
export const ROUTE_PROVIDERS=['ollama','openai','openrouter','claude'] as const;
export type RouteProvider=typeof ROUTE_PROVIDERS[number];
export interface ProviderRouting {localOnly:boolean;order:RouteProvider[];models:Partial<Record<RouteProvider,string>>;limits:Partial<Record<RouteProvider,{timeoutMs:number;retries:number}>>}
export function normalizeRouting(value:unknown):ProviderRouting|undefined{
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid provider routing');const p=value as ProviderRouting;
 if(Object.keys(p).some(k=>!['localOnly','order','models','limits'].includes(k))||typeof p.localOnly!=='boolean'||!Array.isArray(p.order)||p.order.length<1||p.order.length>4||new Set(p.order).size!==p.order.length||p.order[0]!=='ollama'||p.order.some(k=>!ROUTE_PROVIDERS.includes(k))||!p.models||typeof p.models!=='object'||Array.isArray(p.models)||!p.limits||typeof p.limits!=='object'||Array.isArray(p.limits))throw Error('Invalid provider routing');
 for(const [id,model] of Object.entries(p.models)){if(!ROUTE_PROVIDERS.includes(id as RouteProvider)||typeof model!=='string'||!model.trim()||model.length>512||/[\r\n\0]/.test(model))throw Error('Invalid route model');}
 for(const [id,limit] of Object.entries(p.limits)){if(!ROUTE_PROVIDERS.includes(id as RouteProvider)||!limit||typeof limit!=='object'||Array.isArray(limit)||Object.keys(limit).some(k=>!['timeoutMs','retries'].includes(k))||!Number.isInteger(limit.timeoutMs)||limit.timeoutMs<1000||limit.timeoutMs>300000||!Number.isInteger(limit.retries)||limit.retries<0||limit.retries>5)throw Error('Invalid provider limit');}
 if(p.order.some(id=>!p.models[id]))throw Error('Route requires exact models');return structuredClone(p);
}
/** Explicit saved routing for general chat only. No replay/fallback after any event.
 * Consent/auth/context errors never become a reason to send elsewhere. */
export function routedProvider(policy:ProviderRouting,make:(id:RouteProvider,model:string)=>AgentProvider,onIdentity?:(identity:{provider:string;model:string})=>void):AgentProvider{
 let actual={provider:policy.order[0],model:policy.models[policy.order[0]]!};
 return {id:'configured-route',locality:policy.localOnly?'local':'cloud',identity:()=>actual,async *stream(request){
  if(request.tools.length||request.messages.some(m=>m.images?.length||m.role==='tool'||m.toolCalls?.length))throw new AgentError('provider-error','context','Automatic routing is only available for plain chat.');
  const order=policy.localOnly?policy.order.filter(id=>id==='ollama'):policy.order;
  if(!order.length)throw new AgentError('provider-error','consent','Local-only route has no local provider.');
  let last:unknown;
  for(const id of order){request.signal.throwIfAborted();const model=policy.models[id]!;actual={provider:id,model};let emitted=false;
   try{for await(const event of make(id,model).stream({...request,model})){request.signal.throwIfAborted();if(!emitted)onIdentity?.(actual);emitted=true;yield event;}return;}
   catch(error){request.signal.throwIfAborted();const failure=toAgentError(error);last=error;if(emitted||!['network','timeout','server','model-not-found'].includes(failure.detail))throw error;}
  }throw last??new AgentError('provider-error','network','No configured provider available.');
 }};
}
export function timedProvider(provider:AgentProvider,timeoutMs=180000):AgentProvider{
 return {id:provider.id,locality:provider.locality,supportsImages:provider.supportsImages,identity:provider.identity,async *stream(request){const controller=new AbortController();let timedOut=false;const abort=()=>controller.abort(request.signal.reason);request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);try{for await(const event of provider.stream({...request,signal:controller.signal})){controller.signal.throwIfAborted();yield event;}}catch(error){if(timedOut)throw new AgentError('provider-error','timeout','Provider request timed out.',true);throw error;}finally{clearTimeout(timer);controller.abort();request.signal.removeEventListener('abort',abort);}}};
}
