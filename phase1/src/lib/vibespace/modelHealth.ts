import {invoke,isTauri} from '@tauri-apps/api/core';import {parseInventory} from '../agent/localModels';import type {ModelRef} from './types';
export type LocalityState='reported-local'|'remote'|'unknown';
export interface ModelHealth{reachable:boolean|null;modelsPresent:number|null;locality:LocalityState;lastError:'unavailable'|'daemon'|'inventory'|'missing'|'metadata'|'remote'|'unknown'|null;checkedAt:number}
const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Same conservative decision as the native request gate. Metadata is daemon-reported, not an audit of the daemon. */
export function classifyModelLocality(model:string,show:unknown):LocalityState{
 if(!model.trim()||model.length>512||/[\x00-\x1f\x7f]/.test(model))return 'unknown';
 if(model.trim().toLowerCase().split(/[:\-_/]/).includes('cloud'))return 'remote';const data=record(show);if(!data)return 'unknown';
 if(['remote_host','remote_model'].some(k=>data[k]!==undefined&&data[k]!==null))return 'remote';
 const info=record(data.model_info);return info&&Object.keys(info).length?'reported-local':'unknown';
}
export type HealthRead=(op:'version'|'tags'|'show',model?:string)=>Promise<unknown>;
export async function inspectModelHealth(model:ModelRef,read:HealthRead=(operation,name)=>invoke('local_models_read',{baseUrl:'http://127.0.0.1:11434',operation,model:name??null}),available=isTauri()):Promise<ModelHealth>{
 const result:ModelHealth={reachable:null,modelsPresent:null,locality:'unknown',lastError:null,checkedAt:Date.now()};
 if(!available||model.provider!=='ollama'||model.locality!=='local')return {...result,lastError:'unavailable'};
 try{const data=record(await read('version'));if(typeof data?.version!=='string'||!data.version)throw Error();result.reachable=true;}catch{return {...result,reachable:false,lastError:'daemon'};}
 try{const list=parseInventory(await read('tags'));result.modelsPresent=list.length;if(!list.some(m=>m.id===model.model))return {...result,lastError:'missing'};}catch{return {...result,lastError:'inventory'};}
 try{result.locality=classifyModelLocality(model.model,await read('show',model.model));result.lastError=result.locality==='reported-local'?null:result.locality==='remote'?'remote':'unknown';}catch{result.lastError='metadata';}
 return result;
}
