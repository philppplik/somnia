import type {LocalContextBudgetReport} from './localContextReport';
let report:LocalContextBudgetReport|null=null;const listeners=new Set<()=>void>();
/** Ephemeral aggregate numbers only, never text/tools/images or persistence. */
export const localContextBudgetSnapshot=()=>report;
export const subscribeLocalContextBudget=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function publishLocalContextBudget(value:LocalContextBudgetReport|null){report=value?Object.freeze({...value}):null;listeners.forEach(fn=>fn());}
