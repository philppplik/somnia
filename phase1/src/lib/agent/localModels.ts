import {invoke,isTauri} from '@tauri-apps/api/core';
import {isLoopbackHttp,normalizeBaseUrl,OLLAMA_DEFAULT_URL,OllamaProvider} from './providers/ollama';
export type Capability = 'text'|'vision'|'tools'|'embedding';
export interface InstalledModel {id:string;digest?:string;sizeBytes?:number;parameterSize?:string;quantization?:string}
export interface ModelEvidence {capabilities:Capability[]|null;locality:'reported-local'|'remote'|'unverified'}
export interface RuntimeSnapshot {state:'running'|'stopped'|'not-found'|'unreachable'|'unavailable';installed:boolean|null;version?:string;checkedAt:number;models:InstalledModel[];inventoryError:boolean}
export type RuntimeRead=(operation:'version'|'tags'|'show'|'ps',model?:string)=>Promise<unknown>;
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
export function localOrigin(raw=OLLAMA_DEFAULT_URL):string {
 const base=normalizeBaseUrl(raw),u=new URL(raw);
 if(!isLoopbackHttp(base)||u.username||u.password||u.search||u.hash||(u.pathname!==''&&u.pathname!=='/'))throw Error('Local runtime requires an HTTP loopback origin');
 return base;
}
export function parseInventory(value:unknown):InstalledModel[]{
 const data=record(value);if(!data||!Array.isArray(data.models))throw Error('Invalid model inventory');
 return data.models.map(value=>{
  const model=record(value);if(!model)throw Error('Invalid inventory row');
  const id=typeof model.model==='string'?model.model:model.name;
  if(typeof id!=='string'||!id.trim()||id.length>512)throw Error('Invalid model name');
  const details=record(model.details);
  return {id,digest:typeof model.digest==='string'?model.digest:undefined,sizeBytes:typeof model.size==='number'&&Number.isFinite(model.size)&&model.size>=0?model.size:undefined,parameterSize:typeof details?.parameter_size==='string'?details.parameter_size:undefined,quantization:typeof details?.quantization_level==='string'?details.quantization_level:undefined};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
export function parseEvidence(model:string,value:unknown):ModelEvidence {
 const data=record(value);if(!data)throw Error('Invalid model metadata');
 const aliases:Record<string,Capability>={completion:'text',vision:'vision',tools:'tools',embedding:'embedding'};
 const capabilities=Array.isArray(data.capabilities)&&data.capabilities.every(c=>typeof c==='string')?[...new Set(data.capabilities.flatMap(c=>aliases[c]?[aliases[c]]:[]))]:null;
 const weights=record(data.model_info);
 const locality=/(^|[:\-_/])cloud$/i.test(model.trim())||data.remote_host||data.remote_model?'remote':weights&&Object.keys(weights).length?'reported-local':'unverified';
 return {capabilities,locality};
}
export class LocalModelsRuntime {
 readonly baseUrl:string;
 private metadataActive=0;
 private metadataWaiters:Array<()=>void>=[];
 constructor(baseUrl=OLLAMA_DEFAULT_URL,private read:RuntimeRead=(operation,model)=>invoke('local_models_read',{baseUrl:this.baseUrl,operation,model:model??null}),private detect:()=>Promise<{installed:boolean}>=()=>invoke('local_models_detect'),private available:()=>boolean=isTauri){this.baseUrl=localOrigin(baseUrl);}
 async snapshot():Promise<RuntimeSnapshot>{
  const checkedAt=Date.now(),models:InstalledModel[]=[];
  if(!this.available())return {state:'unavailable',installed:null,models,checkedAt,inventoryError:false};
  const detection=await this.detect().catch(()=>null);
  let version:string;
  try {const data=record(await this.read('version'));if(typeof data?.version!=='string'||!data.version)throw Error('Invalid runtime version');version=data.version;}
  catch {return {state:detection===null?'unreachable':detection.installed?'stopped':'not-found',installed:detection?.installed??null,models,checkedAt,inventoryError:false};}
  try{return {state:'running',installed:detection?.installed??null,version,models:parseInventory(await this.read('tags')),checkedAt,inventoryError:false};}
  catch{return {state:'running',installed:detection?.installed??null,version,models,checkedAt,inventoryError:true};}
 }
 async running():Promise<unknown>{if(!this.available())return null;return this.read('ps');}
 async verify(model:string):Promise<boolean>{
  const provider=new OllamaProvider({baseUrl:this.baseUrl,fetch:async()=>new Response(JSON.stringify(await this.read('show',model)),{headers:{'content-type':'application/json'}})});
  return (await provider.verifyLocalModel(model)).local;
 }
 async evidence(model:string):Promise<ModelEvidence>{
  if(this.metadataActive>=2)await new Promise<void>(resolve=>this.metadataWaiters.push(resolve));
  else this.metadataActive++;
  try{return parseEvidence(model,await this.read('show',model));}
  finally{const next=this.metadataWaiters.shift();if(next)next();else this.metadataActive--;}
 }
}
