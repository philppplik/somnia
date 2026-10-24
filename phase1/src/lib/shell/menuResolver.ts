import type {MenuId,MenuItemDef} from './types';
import {MENU_IDS} from './types';
import {evalWhen} from './when';
/**
 * Menu merge (concept 4.2): final = global base + studio contributions + extension contributions.
 * Pure. Items are grouped, groups ordered by the lowest order inside them, separators between groups.
 */
export interface ResolvedMenuItem{command:string;label?:string;group:string;submenu?:readonly ResolvedMenuItem[];enabled:boolean}
export type ResolvedMenuEntry=ResolvedMenuItem|{separator:true};
export interface ResolvedMenu{menu:MenuId;entries:readonly ResolvedMenuEntry[];/** zero visible items: shown disabled, never hidden (D6) */disabled:boolean}
export interface MenuSources{base:readonly MenuItemDef[];studio?:readonly MenuItemDef[];extensions?:readonly MenuItemDef[]}
export interface ResolveOpts{ctx:unknown;/** command availability (enabled()+when) for the `enabled` flag */isEnabled?:(command:string)=>boolean;/** command ids that exist, others are dropped (no item visible that cannot run) */exists?:(command:string)=>boolean}
function pick(sources:MenuSources):MenuItemDef[]{
 const studio=sources.studio??[];
 const key=(i:MenuItemDef)=>`${i.menu}:${i.command}`;
 const hidden=new Set(studio.filter(i=>i.hideBase).map(key));
 const baseKeys=new Set(sources.base.map(key));
 // A studio item for a command the base already has overrides label/when instead of duplicating it.
 const overrides=new Map(studio.filter(i=>!i.hideBase&&baseKeys.has(key(i))).map(i=>[key(i),i]));
 const base=sources.base.filter(i=>!hidden.has(key(i))).map(i=>{const o=overrides.get(key(i));return o?{...i,labelOverride:o.labelOverride??i.labelOverride,when:o.when??i.when}:i;});
 const own=studio.filter(i=>!i.hideBase&&!baseKeys.has(key(i)));
 return [...base,...own,...(sources.extensions??[])];
}
function resolveItems(items:readonly MenuItemDef[],o:ResolveOpts):ResolvedMenuEntry[]{
 const seen=new Set<string>();
 const vis=items.filter(i=>evalWhen(i.when,o.ctx)&&(o.exists?o.exists(i.command):true)).filter(i=>{const k=`${i.group}|${i.command}`;if(seen.has(k))return false;seen.add(k);return true;});
 const groups=new Map<string,MenuItemDef[]>();
 for(const i of vis){const g=groups.get(i.group);g?g.push(i):groups.set(i.group,[i]);}
 const ordered=[...groups.entries()].map(([g,list])=>({g,list:[...list].sort((a,b)=>a.order-b.order),min:Math.min(...list.map(i=>i.order))}))
  .sort((a,b)=>a.min-b.min||a.g.localeCompare(b.g));
 const out:ResolvedMenuEntry[]=[];
 for(const grp of ordered){
  if(out.length)out.push({separator:true});
  for(const i of grp.list){
   const sub=i.submenu?resolveItems(i.submenu,o).filter((e):e is ResolvedMenuItem=>!('separator' in e)):undefined;
   if(i.submenu&&!sub!.length)continue;
   out.push({command:i.command,label:i.labelOverride,group:i.group,submenu:sub,enabled:o.isEnabled?o.isEnabled(i.command):true});
  }
 }
 return out;
}
export function resolveMenu(menu:MenuId,sources:MenuSources,o:ResolveOpts):ResolvedMenu{
 const items=pick(sources).filter(i=>i.menu===menu);
 const entries=resolveItems(items,o);
 return {menu,entries,disabled:!entries.some(e=>!('separator' in e))};
}
export const resolveMenuBar=(sources:MenuSources,o:ResolveOpts):ResolvedMenu[]=>MENU_IDS.map(m=>resolveMenu(m,sources,o));
