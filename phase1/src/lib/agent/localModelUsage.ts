/** Device-local successful Agent completions only, never daemon-wide last use.
 * No prompts, responses, telemetry or model names are sent anywhere by this log.
 */
export interface UsageStorage{getItem(key:string):string|null;setItem(key:string,value:string):void}
const KEY='somnia.local-model-success.v1',LIMIT=200;
function storage():UsageStorage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
function entries(store:UsageStorage|null):Record<string,number>{try{const raw=store?.getItem(KEY);if(!raw)return {};const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value).filter(([k,v])=>k.length<=1024&&typeof v==='number'&&Number.isSafeInteger(v)&&v>0).slice(0,LIMIT));}catch{return {};}}
function identity(origin:string,model:string){return JSON.stringify([origin,model.includes(':')?model:model+':latest']);}
export function recordLocalModelSuccess(origin:string,model:string,at=Date.now(),store:UsageStorage|null=storage()):void{if(!store||!model||model.length>512||!Number.isSafeInteger(at)||at<=0)return;try{const data=entries(store),key=identity(origin,model);data[key]=Math.max(data[key]??0,at);const bounded=Object.fromEntries(Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,LIMIT));store.setItem(KEY,JSON.stringify(bounded));}catch{/* Storage failure cannot turn a successful answer into a failed inference. */}}
export function lastLocalModelSuccess(origin:string,model:string,now=Date.now(),store:UsageStorage|null=storage()):number|null{const value=entries(store)[identity(origin,model)];return value&&value<=now?value:null;}
