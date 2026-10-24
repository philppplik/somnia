import {loadTemplates,type TemplateStore} from './localAssistant';import {loadComparisons,type ComparisonStorage} from './localComparison';
export type LocalStoreId='templates'|'comparisons'|'evaluations';
export const localStoreIds:LocalStoreId[]=['templates','comparisons','evaluations'];
const templateKey='somnia.local-task-templates.v1',comparisonKey='somnia.local-comparisons.v1';
const evaluation=(prompt:string)=>/^\[Local evaluation task: (chat|vibe|code|summarize)\]\n/.test(prompt);
export function readLocalStore(id:LocalStoreId,store:TemplateStore&ComparisonStorage){if(id==='templates')return loadTemplates(store);return loadComparisons(store).filter(c=>evaluation(c.prompt)===(id==='evaluations'));}
export function localStoreBytes(value:unknown):number{return new TextEncoder().encode(JSON.stringify(value)).length;}
export function exportLocalStore(id:LocalStoreId,store:TemplateStore&ComparisonStorage):string{return JSON.stringify({format:'somnia-local-privacy',version:1,store:id,records:readLocalStore(id,store)},null,2);}
/** Fresh selective read/write; never removes the shared history's other category. */
export function clearLocalStore(id:LocalStoreId,store:TemplateStore&ComparisonStorage):void{if(id==='templates'){store.setItem(templateKey,'[]');return;}const keep=loadComparisons(store).filter(c=>evaluation(c.prompt)!==(id==='evaluations'));store.setItem(comparisonKey,JSON.stringify(keep));}
export function downloadPrivateJSON(text:string,name:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
