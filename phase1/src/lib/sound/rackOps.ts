import type {EffectRack,RackSlot} from './rack';

/** Fresh, collision-safe insert id. Injectable so tests stay deterministic. */
export const newInsertId=(random:()=>number=Math.random,now:()=>number=Date.now)=>`insert-${now()}-${random().toString(36).slice(2,7)}`;

/** Copy a rack for another target: same slots, enabled flags, params and bypass, brand-new insert ids. */
export function copyRack(rack:EffectRack,makeId:()=>string=newInsertId):EffectRack{
 const seen=new Set<string>();
 const slots=rack.slots.map(s=>{let id=makeId();while(seen.has(id))id=makeId();seen.add(id);return{...s,id,params:{...s.params}};});
 return{...rack,slots};
}

/** Reset one insert to the processor defaults (an empty params map means "all defaults"). Unknown ids change nothing. */
export function resetSlotParams(rack:EffectRack,slotId:string):EffectRack{
 if(!rack.slots.some(s=>s.id===slotId))return rack;
 return{...rack,slots:rack.slots.map((s:RackSlot)=>s.id===slotId?{...s,params:{}}:s)};
}
