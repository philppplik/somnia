import {invoke,isTauri} from '@tauri-apps/api/core';
import {agentPrivacy,AgentConsentRequiredError,type AgentPrivacyGate} from './privacy';
export type AuthProvider='ollama'|'openrouter'|'openai'|'claude';
export type AuthFailure='invalid-key'|'network'|'timeout'|'rate-limit'|'provider-unavailable'|'protocol'|'keystore-locked'|'cancelled'|'consent';
const MESSAGES:Record<AuthFailure,string>={
 'invalid-key':'The provider rejected this API key. Check it or create a new key.',
 network:'Could not reach the provider. Check your connection, firewall and browser CORS settings.',
 timeout:'The connection test timed out. Check the provider and try again.',
 'rate-limit':'The provider is rate limiting requests. Wait before testing again.',
 'provider-unavailable':'The provider is unavailable. Try again later.',
 protocol:'The provider returned an unexpected response. The key was not saved.',
 'keystore-locked':'Could not access the OS credential store. Unlock it, then retry. No key was written to a plaintext file.',
 cancelled:'Connection test cancelled.',consent:'Allow cloud AI in Cloud data consent before testing this key.'
};
export class ProviderAuthError extends Error {constructor(readonly code:AuthFailure){super(MESSAGES[code]);this.name='ProviderAuthError';}}
export function validateProviderKey(key:string):string{
 const value=key.trim();
 if(!value||new TextEncoder().encode(value).length>8192||/[\x00-\x20\x7f]/.test(value))throw new ProviderAuthError('invalid-key');
 return value;
}
// This map is process memory only, never Storage, logs, URLs or exported preferences.
const sessionKeys=new Map<AuthProvider,string>();
function cloudProvider(provider:AuthProvider){if(!['openrouter','openai','claude'].includes(provider))throw new ProviderAuthError('invalid-key');return provider;}
export async function loadProviderKey(provider:AuthProvider):Promise<string>{
 if(provider==='ollama')return '';
 cloudProvider(provider);
 try{return isTauri()?await invoke<string>('agent_key_load',{provider}):sessionKeys.get(provider)??'';}catch{throw new ProviderAuthError('keystore-locked');}
}
/** Configuration UI receives presence only, not an existing secret. */
export async function hasProviderKey(provider:AuthProvider):Promise<boolean>{
 if(provider==='ollama')return false;
 cloudProvider(provider);
 try{return isTauri()?await invoke<boolean>('agent_key_status',{provider}):sessionKeys.has(provider);}catch{throw new ProviderAuthError('keystore-locked');}
}
export async function saveProviderKey(provider:AuthProvider,key:string):Promise<void>{
 cloudProvider(provider);const apiKey=validateProviderKey(key);
 try{if(isTauri())await invoke('agent_key_save',{provider,apiKey});else sessionKeys.set(provider,apiKey);}catch{throw new ProviderAuthError('keystore-locked');}
}
export async function deleteProviderKey(provider:AuthProvider):Promise<void>{
 cloudProvider(provider);
 try{if(isTauri())await invoke('agent_key_delete',{provider});sessionKeys.delete(provider);}catch{throw new ProviderAuthError('keystore-locked');}
}
export const AUTH_ENDPOINTS={ollama:'http://127.0.0.1:11434/api/tags',openrouter:'https://openrouter.ai/api/v1/key',openai:'https://api.openai.com/v1/models',claude:'https://api.anthropic.com/v1/models?limit=1'} as const;
/** Auth/account metadata only. No generation, prompt, project content, billing operation or retries. */
export async function testProviderAuthentication(provider:AuthProvider,key:string,options:{signal?:AbortSignal;fetch?:typeof fetch;gate?:AgentPrivacyGate;timeoutMs?:number}={}):Promise<void>{
 if(!Object.hasOwn(AUTH_ENDPOINTS,provider))throw new ProviderAuthError('invalid-key');
 const headers:Record<string,string>={Accept:'application/json'};
 if(provider!=='ollama'){
  const value=validateProviderKey(key);
  if(provider==='claude'){headers['x-api-key']=value;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';}
  else headers.Authorization=`Bearer ${value}`;
 }
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();
 if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},options.timeoutMs??12000);
 try{
  await (options.gate??agentPrivacy).run({provider,endpoint:AUTH_ENDPOINTS[provider],processing:provider==='ollama'?'local':'cloud'},async signal=>{
   const response=await (options.fetch??fetch)(AUTH_ENDPOINTS[provider],{method:'GET',headers,signal,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
   if(!response.ok){
    // Never read provider error text: it may echo keys or other private data.
    void response.body?.cancel();
    throw new ProviderAuthError(response.status===401||response.status===403?'invalid-key':response.status===429?'rate-limit':response.status>=500?'provider-unavailable':'protocol');
   }
   let data:unknown;try{data=await response.json();}catch{throw new ProviderAuthError('protocol');}
   if(!data||typeof data!=='object')throw new ProviderAuthError('protocol');
   const body=data as Record<string,unknown>;
   if(provider==='ollama'?!Array.isArray(body.models):provider==='openrouter'?(!body.data||typeof body.data!=='object'||Array.isArray(body.data)):!Array.isArray(body.data))throw new ProviderAuthError('protocol');
   // Deliberately do not return key labels, account balance or model/account metadata.
  },controller.signal);
 }catch(error){
  if(error instanceof AgentConsentRequiredError)throw new ProviderAuthError('consent');
  if(timedOut)throw new ProviderAuthError('timeout');
  if(options.signal?.aborted)throw new ProviderAuthError('cancelled');
  if(error instanceof ProviderAuthError)throw error;
  throw new ProviderAuthError('network');
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
