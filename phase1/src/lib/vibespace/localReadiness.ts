import {invoke,isTauri} from '@tauri-apps/api/core';import {parseInventory} from '../agent/localModels';import {parseDiscoveredModels} from '../agent/localRuntimeDiscovery';import {classifyModelLocality} from './modelHealth';
export type ReadinessProvider='ollama'|'lmstudio';
export interface LocalReadiness{provider:ReadinessProvider;state:'unavailable'|'down'|'invalid'|'empty'|'unverified'|'local';models:number|null;model?:string}
export type ReadinessIO=(provider:ReadinessProvider,operation:'version'|'tags'|'show'|'models',model?:string)=>Promise<unknown>;
const nativeRead:ReadinessIO=(provider,operation,model)=>provider==='lmstudio'?invoke('local_models_discover',{baseUrl:'http://127.0.0.1:1234',runtime:'lmstudio'}):invoke('local_models_read',{baseUrl:'http://127.0.0.1:11434',operation,model:model??null});
/** Native LM Link can route localhost to another machine. No list field grants local processing. */
export function lmStudioLocality(_inventory:unknown):'unknown'{return 'unknown';}
/** Detection means a responding loopback daemon, not proof that an app is installed. No inference/load/download. */
export async function inspectLocalReadiness(provider:ReadinessProvider,io:ReadinessIO=nativeRead,available=isTauri()):Promise<LocalReadiness>{
 const base={provider,models:null};if(!available)return {...base,state:'unavailable'};
 if(provider==='lmstudio'){
  let raw:unknown;try{raw=await io(provider,'models');}catch{return {...base,state:'down'};}
  try{const rows=parseDiscoveredModels('lmstudio',raw);return {provider,models:rows.length,state:rows.length?'unverified':'empty'};}catch{return {...base,state:'invalid'};}
 }
 try{const raw=await io(provider,'version');if(!raw||typeof raw!=='object'||typeof (raw as {version?:unknown}).version!=='string'||!(raw as {version:string}).version)throw Error();}catch{return {...base,state:'down'};}
 let rows:ReturnType<typeof parseInventory>;try{rows=parseInventory(await io(provider,'tags'));}catch{return {...base,state:'invalid'};}
 if(!rows.length)return {provider,models:0,state:'empty'};
 // Bounded onboarding work, not exhaustive inventory certification. Exact selected model is rechecked natively.
 for(const row of rows.slice(0,3)){try{if(classifyModelLocality(row.id,await io(provider,'show',row.id))==='reported-local')return {provider,models:rows.length,state:'local',model:row.id};}catch{/* unknown stays unverified */}}
 return {provider,models:rows.length,state:'unverified'};
}
