export interface ReviewHistoryEntry{id:string;file:string;summary:string;state:'accepted'|'rejected'|'undone';decidedAt:number}
const histories=new Map<string,readonly ReviewHistoryEntry[]>(),listeners=new Set<()=>void>();const EMPTY:readonly ReviewHistoryEntry[]=Object.freeze([]);
/** Session-local, bounded, display only. No content, tokens, engine receipts or executable callbacks. */
export const documentReviewHistory=(key:string)=>histories.get(key)??EMPTY;
export const subscribeReviewHistory=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export function recordReviewDecision(key:string,entry:ReviewHistoryEntry){if(!key)return;const safe=Object.freeze({id:entry.id,file:entry.file,summary:entry.summary.slice(0,160),state:entry.state,decidedAt:entry.decidedAt});const prior=documentReviewHistory(key).filter(e=>e.id!==entry.id).slice(-11);histories.delete(key);histories.set(key,Object.freeze([...prior,safe]));while(histories.size>20)histories.delete(histories.keys().next().value!);listeners.forEach(f=>{try{f();}catch{/* Display cannot affect review. */}});}
