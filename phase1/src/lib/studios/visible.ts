/** Hard cap for studios shown in the studio bar at once. Smaller windows break the layout above this. */
export const MAX_VISIBLE_STUDIOS=5;
export const clampMaxStudios=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.min(MAX_VISIBLE_STUDIOS,Math.max(1,Math.round(n))):MAX_VISIBLE_STUDIOS;
/** At most `max` (never more than 5) studios stay in the bar, in registry order. The active studio is always kept. The rest go to the overflow menu. */
export function splitStudios<T extends {id:string}>(all:readonly T[],activeId:string,max:unknown):{visible:T[];hidden:T[]}{
 const cap=clampMaxStudios(max);if(all.length<=cap)return {visible:[...all],hidden:[]};
 const keep=new Set(all.slice(0,cap).map(x=>x.id));
 if(!keep.has(activeId)&&all.some(x=>x.id===activeId)){keep.delete(all[cap-1].id);keep.add(activeId);}
 return {visible:all.filter(x=>keep.has(x.id)),hidden:all.filter(x=>!keep.has(x.id))};
}
