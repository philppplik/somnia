/** Filmstrip multi-select helpers. Plain click is single-select (handled by the caller); Ctrl toggles one item, Shift selects the anchor..target range in strip order. */
export function toggleSelect(sel:readonly string[],name:string):string[]{
 return sel.includes(name)?sel.filter(n=>n!==name):[...sel,name];
}
/** Range from the anchor (or just the target without one), replacing the current selection — the Lightroom convention. Unknown names fall back to the target alone. */
export function rangeSelect(ordered:readonly string[],anchor:string|null,target:string):string[]{
 const t=ordered.indexOf(target);if(t<0)return[target];
 const a=anchor?ordered.indexOf(anchor):-1;if(a<0)return[target];
 const[lo,hi]=a<t?[a,t]:[t,a];
 return ordered.slice(lo,hi+1);
}
