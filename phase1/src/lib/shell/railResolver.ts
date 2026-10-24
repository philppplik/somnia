import type {RailItemDef,RailOverrides} from './types';
import {evalWhen} from './when';
/**
 * Effective rail (concept 4.3a). Pure.
 * base set -> drop `when`-hidden and user-hidden -> sort (user `order` first, unlisted items keep base order after
 * their default position) -> items that are not pinned go to the overflow "more" icon.
 * `when` always wins: a context-hidden item stays hidden even if pinned.
 */
export const EMPTY_RAIL_OVERRIDES:RailOverrides=Object.freeze({order:[],pinned:[],hidden:[],unpinned:[]}) as RailOverrides;
export interface EffectiveRail{visible:readonly RailItemDef[];overflow:readonly RailItemDef[];/** base items the user has not seen yet (new after an update), only when `seen` is given */fresh:readonly string[]}
export interface RailOpts{ctx:unknown;seen?:readonly string[]}
/** Drop ids unknown to the base set (older versions) and duplicates. Unknown ids are ignored, never fatal. */
export function sanitizeOverrides(o:Partial<RailOverrides>|undefined,base:readonly {id:string}[]):RailOverrides{
 const ids=new Set(base.map(i=>i.id));
 const clean=(l:unknown)=>Array.isArray(l)?[...new Set(l.filter((x):x is string=>typeof x==='string'&&ids.has(x)))]:[];
 const pinned=clean(o?.pinned);
 return {order:clean(o?.order),pinned,hidden:clean(o?.hidden),unpinned:clean(o?.unpinned).filter(i=>!pinned.includes(i))};
}
export const isPinned=(i:RailItemDef,o:RailOverrides)=>o.pinned.includes(i.id)||(i.defaultPinned!==false&&!(o.unpinned??[]).includes(i.id));
export function effectiveRail(base:readonly RailItemDef[],overrides:Partial<RailOverrides>|undefined,o:RailOpts):EffectiveRail{
 const ov=sanitizeOverrides(overrides,base);
 const items=base.filter(i=>evalWhen(i.when,o.ctx)&&!ov.hidden.includes(i.id));
 const defaults=[...items].sort((a,b)=>a.order-b.order||base.indexOf(a)-base.indexOf(b));
 // Ordered ids keep the user's sequence; unlisted items slot in at their default position among the unlisted.
 const listed=ov.order.map(id=>defaults.find(i=>i.id===id)).filter((x):x is RailItemDef=>!!x);
 const unlisted=defaults.filter(i=>!ov.order.includes(i.id));
 const merged=[...listed,...unlisted];
 const visible=merged.filter(i=>isPinned(i,ov)),overflow=merged.filter(i=>!isPinned(i,ov));
 const seen=new Set(o.seen??[]);
 return {visible,overflow,fresh:o.seen?base.filter(i=>!seen.has(i.id)).map(i=>i.id):[]};
}
const move=(list:readonly string[],id:string,to:number)=>{const l=list.filter(x=>x!==id);l.splice(Math.max(0,Math.min(to,l.length)),0,id);return l;};
/** Override edits. All return new objects. `current` is the current effective order of visible+overflow ids. */
export const railEdits={
 reorder(o:RailOverrides,current:readonly string[],id:string,to:number):RailOverrides{return {...o,order:move(current,id,to)};},
 pin(o:RailOverrides,id:string):RailOverrides{return {...o,pinned:[...new Set([...o.pinned,id])],unpinned:(o.unpinned??[]).filter(x=>x!==id)};},
 unpin(o:RailOverrides,id:string):RailOverrides{return {...o,pinned:o.pinned.filter(x=>x!==id),unpinned:[...new Set([...(o.unpinned??[]),id])]};},
 hide(o:RailOverrides,id:string):RailOverrides{return {...o,hidden:[...new Set([...o.hidden,id])]};},
 show(o:RailOverrides,id:string):RailOverrides{return {...o,hidden:o.hidden.filter(x=>x!==id)};},
 reset():RailOverrides{return {order:[],pinned:[],hidden:[],unpinned:[]};},
};
