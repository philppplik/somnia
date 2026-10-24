import type {Composition} from './model';
import type {Edit} from './edit';
/** Stacking order of the selected layers. layers[0] is the top layer. Pure: returns the edits, nothing is applied here. */
export const ARRANGE_MODES=['front','back','up','down','reverse'] as const;
export type ArrangeMode=typeof ARRANGE_MODES[number];
/** New order for `order` (top first) when the layers in `sel` are arranged by `mode`. Relative order of the selection is kept except for 'reverse'. */
export function arrangedOrder(order:readonly string[],sel:ReadonlySet<string>,mode:ArrangeMode):string[]{
 const picked=order.filter(id=>sel.has(id)),rest=order.filter(id=>!sel.has(id));
 if(mode==='front')return [...picked,...rest];
 if(mode==='back')return [...rest,...picked];
 if(mode==='reverse'){const r=[...picked].reverse();let i=0;return order.map(id=>sel.has(id)?r[i++]:id);}
 const out=[...order];
 if(mode==='up'){for(let i=1;i<out.length;i++)if(sel.has(out[i])&&!sel.has(out[i-1]))[out[i-1],out[i]]=[out[i],out[i-1]];}
 else{for(let i=out.length-2;i>=0;i--)if(sel.has(out[i])&&!sel.has(out[i+1]))[out[i+1],out[i]]=[out[i],out[i+1]];}
 return out;
}
/** Reorder edits that turn the current order into the target one (only layers whose slot changes). */
export function arrangePlan(c:Composition,ids:readonly string[],mode:ArrangeMode):{edits:Edit[];moved:number}{
 const cur=c.layers.map(l=>l.id),target=arrangedOrder(cur,new Set(ids),mode),sim=[...cur],edits:Edit[]=[];
 target.forEach((id,i)=>{if(sim[i]===id)return;sim.splice(sim.indexOf(id),1);sim.splice(i,0,id);edits.push({type:'layer.reorder',layer:id,index:i});});
 return {edits,moved:edits.length};
}
