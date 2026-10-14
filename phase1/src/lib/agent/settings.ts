import {normalizeRouting,type ProviderRouting} from './providerRouting';
import {invoke,isTauri} from '@tauri-apps/api/core';
import type {AgentConfiguration} from './panelBridge';
export interface LocalRuntimePreferences {version:1;numCtx?:number;keepAliveSeconds?:number;studioModels?:Record<string,string>;modelContexts?:Record<string,number>;routing?:ProviderRouting}
export function normalizeLocalRuntime(value:unknown):LocalRuntimePreferences|undefined {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid local runtime preferences');
 const p=value as Record<string,unknown>;
 if(Object.keys(p).some(k=>!['version','numCtx','keepAliveSeconds','studioModels','modelContexts','routing'].includes(k))||p.version!==1)throw Error('Invalid local runtime preferences');
 for(const [key,min,max] of [['numCtx',1,1048576],['keepAliveSeconds',0,86400]] as const){const n=p[key];if(n!==undefined&&(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max))throw Error('Invalid local runtime option: '+key);}
 let studioModels:Record<string,string>|undefined;
 if(p.studioModels!==undefined){
  if(!p.studioModels||typeof p.studioModels!=='object'||Array.isArray(p.studioModels)||Object.keys(p.studioModels).length>100)throw Error('Invalid studio model choices');
  studioModels=Object.fromEntries(Object.entries(p.studioModels).map(([id,model])=>{if(!/^[a-zA-Z0-9._-]{1,80}$/.test(id)||typeof model!=='string'||!model.trim()||model.length>512||/[\r\n\0]/.test(model))throw Error('Invalid studio model choice');return [id,model];}));
 }
 let modelContexts:Record<string,number>|undefined;
 if(p.modelContexts!==undefined){if(!p.modelContexts||typeof p.modelContexts!=='object'||Array.isArray(p.modelContexts)||Object.keys(p.modelContexts).length>100)throw Error('Invalid model contexts');modelContexts=Object.fromEntries(Object.entries(p.modelContexts).map(([model,n])=>{if(!model||model.length>512||/[\r\n\0]/.test(model)||typeof n!=='number'||!Number.isInteger(n)||n<1||n>1048576)throw Error('Invalid model context');return [model,n];}));}
 const routing=normalizeRouting(p.routing);
 return {version:1,...(routing?{routing}:{}),...(modelContexts?{modelContexts}:{}),...(studioModels?{studioModels}:{}),...(p.numCtx!==undefined?{numCtx:p.numCtx as number}:{}),...(p.keepAliveSeconds!==undefined?{keepAliveSeconds:p.keepAliveSeconds as number}:{})};
}
export interface CustomPrompt {id:string;name:string;text:string;enabled:boolean}
const PREFS='somnia.agent.preferences.v1';
export function normalizePrompts(value:unknown):CustomPrompt[]{
 if(!Array.isArray(value))return [];
 if(value.length>20)throw Error('Maximum 20 custom prompts.');
 const ids=new Set<string>();let size=0;
 return value.map(p=>{
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>80||ids.has(p.id)||typeof p.name!=='string'||p.name.length>120||typeof p.text!=='string'||new TextEncoder().encode(p.text).length>8000||p.text.includes('\0')||typeof p.enabled!=='boolean')throw Error('Invalid custom prompt.');
  ids.add(p.id);size+=new TextEncoder().encode(p.text).length;if(size>16000)throw Error('Custom prompts exceed 16000 bytes.');
  return {id:p.id,name:p.name,text:p.text,enabled:p.enabled};
 });
}
export function nonSecretSettings(value:AgentConfiguration){
 if(!['ollama','openrouter','openai','claude'].includes(value.provider)||value.model.length>512||/[\r\n\0]/.test(value.model))throw Error('Invalid agent preferences.');
 const localRuntime=normalizeLocalRuntime(value.localRuntime);
 return {provider:value.provider,model:value.model,customPrompts:normalizePrompts(value.customPrompts),...(localRuntime?{localRuntime}:{})};
}
export async function loadAgentSettings():Promise<AgentConfiguration>{
 const p=isTauri()?await invoke<Record<string,unknown>>('agent_settings_load'):JSON.parse(localStorage.getItem(PREFS)||'{}');
 return {...nonSecretSettings({provider:p.provider??'ollama',model:p.model??'',customPrompts:p.customPrompts??[],localRuntime:p.localRuntime} as AgentConfiguration),apiKey:'',allowActiveFile:false};
}
export async function saveAgentSettings(value:AgentConfiguration):Promise<void>{
 const p=nonSecretSettings(value);
 if(isTauri())await invoke('agent_settings_save',{settings:{...p,apiKey:''}});
 else localStorage.setItem(PREFS,JSON.stringify(p)); // Browser preview never persists API keys.
}

export function localContextFor(p:LocalRuntimePreferences|undefined,model:string){return p?.modelContexts?.[model]??p?.numCtx;}
