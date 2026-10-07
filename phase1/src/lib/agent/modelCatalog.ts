import {isTauri} from '@tauri-apps/api/core';
import {OpenAIProvider} from './openAI';import {ClaudeProvider} from './providers/claude';import {OllamaProvider} from './providers/ollama';
import {loadProviderKey,type AuthProvider} from './providerAuth';import {nativeProviderFetch} from './nativeProviderFetch';import {agentPrivacy} from './privacy';
export async function listProviderModels(provider:AuthProvider,signal:AbortSignal):Promise<{id:string;name:string}[]>{
 const options={getApiKey:()=>loadProviderKey(provider),...(isTauri()?{fetch:nativeProviderFetch(provider)}:{})};
 if(provider==='openai')return (await new OpenAIProvider(options).listModels(signal)).map(x=>({id:x.id,name:x.id}));
 if(provider==='claude')return new ClaudeProvider(options).listModels(signal);
 if(provider==='ollama')return (await new OllamaProvider().listModels(signal)).map(x=>({id:x.id,name:x.label}));
 return agentPrivacy.run({provider:'openrouter',endpoint:'https://openrouter.ai/api/v1/models',processing:'cloud'},async guarded=>{
  const key=await loadProviderKey('openrouter');if(!key)throw Error('Save an OpenRouter API key first.');
  const r=await (isTauri()?nativeProviderFetch('openrouter'):fetch)('https://openrouter.ai/api/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:guarded,redirect:'error',credentials:'omit'});
  if(!r.ok){await r.body?.cancel();throw Error('Could not load models.');}
  const data=await r.json();if(!Array.isArray(data.data)||data.data.length>10000)throw Error('Invalid model catalog.');
  return data.data.filter((x:any)=>typeof x.id==='string'&&x.id.length<256).map((x:any)=>({id:x.id,name:typeof x.name==='string'?x.name:x.id}));
 },signal);
}
