import type {RuntimeSnapshot} from './localModels';import {freshReadiness,type ReadinessRecord} from './localReadinessCache';
export const firstRunSteps=['install','start','model','test']as const;
/** Unknown is not todo-by-proof, and mounted snapshots never count as an explicit test. */
export function firstRunProgress(snapshot:RuntimeSnapshot|null,cache:ReadinessRecord|null,endpoint:string,now=Date.now()){
 const checked=cache?.endpoint===endpoint?freshReadiness(cache,now):null;
 const live=snapshot&&Number.isFinite(snapshot.checkedAt)&&now>=snapshot.checkedAt&&now-snapshot.checkedAt<120000?snapshot:null;const s=checked?.snapshot??live;const small='qwen3:1.7b';
 return {install:s?.installed===true?'done':s?.installed===false?'todo':'unknown',start:s?.state==='running'?'done':s&&['stopped','not-found'].includes(s.state)?'todo':'unknown',model:s?.state==='running'&&!s.inventoryError?(s.models.some(m=>m.id===small)?'done':'todo'):'unknown',test:checked?.snapshot.state==='running'&&!checked.snapshot.inventoryError?'done':'todo'} as const;
}
