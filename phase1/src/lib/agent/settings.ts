import {invoke,isTauri} from '@tauri-apps/api/core';
import type {AgentConfiguration} from './panelBridge';
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
 if(!['ollama','openrouter'].includes(value.provider)||value.model.length>512||/[\r\n\0]/.test(value.model))throw Error('Invalid agent preferences.');
 return {provider:value.provider,model:value.model,customPrompts:normalizePrompts(value.customPrompts)};
}
export async function loadAgentSettings():Promise<AgentConfiguration>{
 const p=isTauri()?await invoke<Record<string,unknown>>('agent_settings_load'):JSON.parse(localStorage.getItem(PREFS)||'{}');
 return {...nonSecretSettings({provider:p.provider??'ollama',model:p.model??'',customPrompts:p.customPrompts??[]} as AgentConfiguration),apiKey:isTauri()&&typeof p.apiKey==='string'?p.apiKey:'',allowActiveFile:false};
}
export async function saveAgentSettings(value:AgentConfiguration):Promise<void>{
 const p=nonSecretSettings(value);
 if(isTauri())await invoke('agent_settings_save',{settings:{...p,apiKey:value.apiKey}});
 else localStorage.setItem(PREFS,JSON.stringify(p)); // Browser preview never persists API keys.
}
