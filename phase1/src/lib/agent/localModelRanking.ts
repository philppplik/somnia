import {LOCAL_MODEL_CATALOG} from './localModelAdvice';
export type RecommendationTask='chat'|'code'|'summarize'|'embed';
export interface MachineFacts {checkedAt:number;ramAvailableBytes?:number;vramFreeBytes?:number;vramUnified?:boolean;vramLowerBound?:boolean}
export interface LocalModelCandidate {tag:string;estimatedBytes:number;sourceUrl:string;fit:'likely'|'tight'|'unknown'|'too-big';requiredBytes:number;basis:'ram'|'vram'|'none';quality:'not-tested';adapter:'text'|'embedding-pending';minimumRuntime?:string;automaticSelection:false}
/** Explicit facts only. Memory-first candidates, not quality or successful inference. */
export function rankLocalModelCandidates(task:RecommendationTask,facts:MachineFacts|null,now:number):readonly LocalModelCandidate[]{
 if(!['chat','code','summarize','embed'].includes(task)||!Number.isSafeInteger(now)||now<0)throw Error('Invalid recommendation scope/clock');
 if(facts){if(typeof facts!=='object'||Array.isArray(facts)||Object.keys(facts).some(k=>!['checkedAt','ramAvailableBytes','vramFreeBytes','vramUnified','vramLowerBound'].includes(k))||!Number.isSafeInteger(facts.checkedAt)||facts.checkedAt<0)throw Error('Invalid machine facts');for(const key of ['ramAvailableBytes','vramFreeBytes']as const)if(facts[key]!==undefined&&(!Number.isSafeInteger(facts[key])||(facts[key] as number)<0))throw Error('Invalid memory facts');for(const key of ['vramUnified','vramLowerBound']as const)if(facts[key]!==undefined&&typeof facts[key]!=='boolean')throw Error('Invalid GPU facts');}
 const tags=task==='code'?['qwen3:1.7b','qwen3:4b','qwen2.5-coder:7b']:['qwen3:1.7b','qwen3:4b'];
 const entries=task==='embed'?[{tag:'embeddinggemma:300m',estimatedBytes:622_000_000,sourceUrl:'https://ollama.com/library/embeddinggemma:300m'}]:tags.map(tag=>{const c=LOCAL_MODEL_CATALOG.find(c=>c.tag===tag)!;return {tag:c.tag,estimatedBytes:c.estimatedBytes!,sourceUrl:c.sourceUrl};});
 const fresh=!!facts&&now>=facts.checkedAt&&now-facts.checkedAt<=120000;
 const pools:readonly {bytes:number;basis:'ram'|'vram'}[]=fresh?[...(facts!.ramAvailableBytes===undefined?[]:[{bytes:facts!.ramAvailableBytes,basis:'ram' as const}]),...(facts!.vramFreeBytes!==undefined&&facts!.vramUnified===false&&facts!.vramLowerBound===false?[{bytes:facts!.vramFreeBytes,basis:'vram' as const}]:[])]:[];
 const order={likely:0,tight:1,unknown:2,'too-big':3};
 const rows=entries.map(entry=>{
  const requiredBytes=Math.ceil(entry.estimatedBytes*1.25+1024**3);
  const best=[...pools].sort((a,b)=>b.bytes-a.bytes)[0];
  const insufficientGpuUnknown=fresh&&facts!.vramFreeBytes!==undefined&&(facts!.vramUnified===undefined||facts!.vramLowerBound!==false)&&facts!.vramUnified!==true;
  const fit:LocalModelCandidate['fit']=!best?'unknown':best.bytes>=requiredBytes*1.25?'likely':best.bytes>=requiredBytes?'tight':insufficientGpuUnknown?'unknown':'too-big';
  return Object.freeze({...entry,requiredBytes,fit,basis:best?.basis??'none',quality:'not-tested' as const,adapter:task==='embed'?'embedding-pending' as const:'text' as const,...(task==='embed'?{minimumRuntime:'0.11.10'}:{}),automaticSelection:false as const});
 });
 return Object.freeze(rows.sort((a,b)=>order[a.fit]-order[b.fit]||a.estimatedBytes-b.estimatedBytes));
}
