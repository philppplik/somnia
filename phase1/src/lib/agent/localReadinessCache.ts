import type {RuntimeSnapshot} from './localModels';
export interface ReadinessRecord {snapshot:RuntimeSnapshot;endpoint:string;checkedAt:number}
let record:ReadinessRecord|null=null;const listeners=new Set<()=>void>();
function notifyReadiness(){for(const fn of [...listeners])try{fn();}catch{/* UI observers cannot turn committed metadata into a failed probe. */}}
export const readinessSnapshot=()=>record;
export const subscribeReadiness=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
/** Caller is an existing explicit metadata action only; no fetch or persistence here. */
export function recordReadiness(snapshot:RuntimeSnapshot,endpoint:string,now=Date.now()){
 if(!Number.isFinite(now)||!endpoint||!Number.isFinite(snapshot.checkedAt)||snapshot.checkedAt>now||now-snapshot.checkedAt>120000)return;
 if(record?.endpoint===endpoint&&record.checkedAt>snapshot.checkedAt)return;
 const copy=structuredClone(snapshot);
 // Stable external-store identity, but no consumer can rewrite shared evidence.
 copy.models.forEach(Object.freeze);Object.freeze(copy.models);Object.freeze(copy);
 record=Object.freeze({snapshot:copy,endpoint,checkedAt:snapshot.checkedAt});notifyReadiness();
}
export function clearReadiness(){record=null;notifyReadiness();}
export function freshReadiness(value:ReadinessRecord|null,now=Date.now()):ReadinessRecord|null{return value&&Number.isFinite(now)&&now>=value.checkedAt&&now-value.checkedAt<120000?value:null;}
/** Inventory evidence, not locality/capability/inference verification. */
export function cachedModelState(value:ReadinessRecord|null,model:string,now=Date.now()):'notChecked'|'expired'|'unreachable'|'unknown'|'missing'|'present'{const fresh=freshReadiness(value,now);if(!fresh)return value?'expired':'notChecked';const s=fresh.snapshot;if(s.state!=='running')return 'unreachable';if(s.inventoryError)return 'unknown';return s.models.some(m=>m.id===model)?'present':'missing';}
