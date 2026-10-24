import {invoke,isTauri} from '@tauri-apps/api/core';
export interface Gpu {name:string;totalBytes?:number|null;freeBytes?:number|null;unified:boolean;lowerBound:boolean}
export interface Hardware {os:string;arch:string;ramTotalBytes?:number|null;ramAvailableBytes?:number|null;cpu?:string|null;cores?:number|null;gpus:Gpu[];errors:string[];checkedAt:number}
export interface Residency {model:string;sizeVramBytes?:number;contextLength?:number}
export function parseResidency(value:unknown):Residency[]|null{
 if(!value||typeof value!=='object'||!Array.isArray((value as {models?:unknown}).models))return null;
 const rows=(value as {models:unknown[]}).models;const finite=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:undefined;
 if(rows.some(v=>!v||typeof v!=='object'||typeof ((v as {model?:unknown;name?:unknown}).model??(v as {name?:unknown}).name)!=='string'))return null;
 return rows.map(row=>{const m=row as {model?:string;name?:string;size_vram?:unknown;context_length?:unknown};return {model:m.model??m.name!,sizeVramBytes:finite(m.size_vram),contextLength:finite(m.context_length)};});
}
export async function inspectHardware():Promise<Hardware|null>{
 if(!isTauri())return null;
 try{return {...await invoke<Omit<Hardware,'checkedAt'>>('local_models_hardware'),checkedAt:Date.now()};}catch{return null;}
}
export type Fit='estimated-gpu'|'estimated-ram'|'may-offload'|'too-large'|'unknown';
/** Heuristic only: weights + 25% runtime reserve + 1 GiB context/headroom. Never a benchmark or allocation promise. */
export function estimateFit(weights:number|undefined,hardware:Hardware|null):{label:Fit;requiredBytes?:number}{
 if(!weights||!Number.isFinite(weights)||weights<=0||!hardware)return {label:'unknown'};
 const requiredBytes=Math.ceil(weights*1.25+1024**3);
 // A unified GPU shares RAM. Do not add or advertise a second pool.
 const discrete=hardware.gpus.filter(g=>!g.unified&&!g.lowerBound);
 if(discrete.some(g=>typeof g.freeBytes==='number'&&g.freeBytes>=requiredBytes))return {label:'estimated-gpu',requiredBytes};
 const ram=hardware.ramAvailableBytes;
 if(typeof ram==='number'&&ram>=requiredBytes)return {label:hardware.gpus.some(g=>g.unified)?'may-offload':'estimated-ram',requiredBytes};
 // Unknown free VRAM cannot justify an insufficient-memory verdict.
 if(hardware.gpus.some(g=>!g.unified&&(g.lowerBound||g.freeBytes==null)))return {label:'unknown',requiredBytes};
 if(typeof ram==='number'&&ram<requiredBytes)return {label:'too-large',requiredBytes};
 return {label:'unknown',requiredBytes};
}
export interface CatalogEntry {id:string;tag:string;sourceUrl:string;license:string;licenseUrl:string;reviewedAt:string;catalogVersion:1;estimatedBytes?:number;modalities:readonly ('text'|'image')[];candidateTasks:readonly ('text'|'tools'|'vision')[];adapterSupport:'text'|'text-only-image-pending';benchmark:'not-tested';quantization:'not-reviewed';confidence:'candidate'}
// Vendor-reviewed exact tags, not pinned digests or measured performance. No hidden Latest selection.
export const LOCAL_MODEL_CATALOG:readonly CatalogEntry[]=[
 {id:'qwen3-small',tag:'qwen3:1.7b',sourceUrl:'https://ollama.com/library/qwen3:1.7b',license:'Apache-2.0',licenseUrl:'https://ollama.com/library/qwen3:1.7b',estimatedBytes:1.4e9,modalities:['text'],candidateTasks:['text']},
 {id:'qwen3-medium',tag:'qwen3:4b',sourceUrl:'https://ollama.com/library/qwen3:4b',license:'Apache-2.0',licenseUrl:'https://ollama.com/library/qwen3:4b',estimatedBytes:2.5e9,modalities:['text'],candidateTasks:['text','tools']},
 {id:'qwen3-large',tag:'qwen3:8b',sourceUrl:'https://ollama.com/library/qwen3:8b',license:'Apache-2.0',licenseUrl:'https://ollama.com/library/qwen3:8b',estimatedBytes:5.2e9,modalities:['text'],candidateTasks:['text','tools']},
 {id:'qwen-coder',tag:'qwen2.5-coder:7b',sourceUrl:'https://ollama.com/library/qwen2.5-coder:7b',license:'Apache-2.0',licenseUrl:'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/LICENSE',estimatedBytes:4.7e9,modalities:['text'],candidateTasks:['text']},
 {id:'gemma-image',tag:'gemma3:4b',sourceUrl:'https://ollama.com/library/gemma3:4b',license:'Gemma terms',licenseUrl:'https://ollama.com/library/gemma3:4b',estimatedBytes:3.4e9,modalities:['text','image'],candidateTasks:['text','vision']},
].map(entry=>({...entry,reviewedAt:'2026-10-14',catalogVersion:1,adapterSupport:entry.modalities.includes('image')?'text-only-image-pending':'text',benchmark:'not-tested',quantization:'not-reviewed',confidence:'candidate'} as CatalogEntry));
