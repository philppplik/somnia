import {LOCAL_MODEL_CATALOG,type Hardware} from './localModelAdvice';
export type RamFit='likely'|'tight'|'too-big'|'unknown';
/** Available RAM only: no GPU addition, no total-RAM substitution, no allocation promise. */
export function ramFit(weights:number|undefined,hardware:Hardware|null,now=Date.now()):{state:RamFit;requiredBytes?:number}{
 const ram=hardware?.ramAvailableBytes;
 if(!Number.isSafeInteger(weights)||!weights||weights<1||!Number.isSafeInteger(ram)||ram==null||ram<0||!Number.isFinite(hardware?.checkedAt)||now-hardware!.checkedAt>120000||now<hardware!.checkedAt)return {state:'unknown'};
 const requiredBytes=Math.ceil(weights*1.25+1024**3);if(!Number.isSafeInteger(requiredBytes))return {state:'unknown'};
 return {state:ram<requiredBytes?'too-big':ram<requiredBytes*1.25?'tight':'likely',requiredBytes};
}
export const ramTasks=['chat','vibe','code','summarize']as const;
/** Catalog candidates, not tested task quality. Never selects/downloads or checks inference. */
export function firstRamModel(task:typeof ramTasks[number],hardware:Hardware|null,now=Date.now()):string|null{
 const tags=task==='code'?['qwen2.5-coder:7b','qwen3:4b','qwen3:1.7b']:task==='vibe'?['qwen3:4b']:['qwen3:1.7b','qwen3:4b'];
 for(const tag of tags){const entry=LOCAL_MODEL_CATALOG.find(m=>m.tag===tag);if(ramFit(entry?.estimatedBytes,hardware,now).state==='likely')return tag;}return null;
}
