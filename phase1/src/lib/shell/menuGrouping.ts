/**
 * Menu grouping: one declarative table that turns a flat menu entry list into a tree with at most
 * two submenu levels. It runs inside menuModel, so the in-app menu bar (legacy and shellV2 paths),
 * the macOS native mirror and every test see the same tree. Nothing here knows about React or Tauri.
 *
 * Rules, in order of precedence:
 *  - A rule claims an entry by exact command id (`ids`) or by id prefix (`prefixes`, e.g. 'deploy.').
 *    The first matching rule of the menu wins, so list narrow rules before broad ones.
 *  - Claimed entries move into the submenu. Entries no rule claims stay at the top level in their
 *    original order ("tail"): grouping never drops a command.
 *  - Top-level entries come first, then one separator, then the submenus in table order.
 *  - A rule that ends up with fewer than `MIN_SUBMENU` entries is dissolved (its entry goes back to the
 *    top level). A submenu of one is only a click more.
 *  - Titles, shortcuts and enabled flags are never touched here; they stay on the entries.
 */
import type {MenuModelEntry,MenuModelItem,MenuModelSubmenu} from './menuModelTypes';
import type {MenuId} from './types';

export const MIN_SUBMENU=2;
export const MAX_SUBMENU_DEPTH=2;

export interface SubmenuRule{
 /** i18n key is `menu.sub.<id>`. Ids are unique across the whole table. */
 id:string;
 ids?:readonly string[];
 prefixes?:readonly string[];
 /** Nested rules (depth 2 at most). They claim from this rule's entries first. */
 children?:readonly SubmenuRule[];
}

const ids=(id:string,list:readonly string[],children?:readonly SubmenuRule[]):SubmenuRule=>({id,ids:list,children});
const pre=(id:string,prefixes:readonly string[],children?:readonly SubmenuRule[]):SubmenuRule=>({id,prefixes,children});

/** The table. Everything else in a menu (Undo, Redo, Save, Open, Settings...) stays flat. */
export const SUBMENU_RULES:Readonly<Record<MenuId,readonly SubmenuRule[]>>={
 Project:[
  ids('new',['project.newFile','vector.createBlank','design.new']),
  ids('openOther',['project.openMedia','vector.openSvg']),
  ids('export',['project.export','project.export.md','design.exportProject','design.exportSvg','pdf.saveCopy','sheets.saveCopy','slides.saveCopy']),
  pre('publish',['deploy.open','deploy.publish','deploy.plan','deploy.cancel','deploy.rollback']),
  pre('targets',['deploy.target']),
  pre('server',['deploy.setup','deploy.key','deploy.hostkey','deploy.remote']),
  pre('build',['frameworks.build','frameworks.run']),
 ],
 Edit:[
  ids('code',['edit.format','edit.wrap','edit.unwrap','edit.encodeEntities','edit.decodeEntities']),
  pre('design',['design.']),
  pre('vector',['vector.']),
  pre('sheets',['sheets.']),
  pre('slides',['slides.']),
  pre('pdf',['pdf.']),
 ],
 View:[
  pre('studios',['studio.']),
  pre('zoom',['zoom.']),
  pre('split',['split.']),
  pre('theme',['theme.']),
  pre('tabs',['tab.']),
  ids('panels',['agent.toggle','chat.toggle','inspector.toggle','sidebar.toggle','panels.hideAll','css.open','extensions.open','search.project']),
  pre('vector',['vector.']),
 ],
 Insert:[
  // insert.element.* stays flat on purpose: it is the everyday web insert list.
  pre('markdown',['md.'],[ids('headings',['md.h1','md.h2','md.h3','md.h4','md.h5','md.h6'])]),
  pre('table',['table.']),
  pre('design',['design.']),
  pre('vector',['vector.']),
 ],
 Tools:[
  pre('collaboration',['collab.']),
  pre('design',['design.']),
  pre('vector',['vector.']),
  pre('pdf',['pdf.']),
 ],
 Help:[],
};

const isItem=(e:MenuModelEntry):e is MenuModelItem=>!('separator' in e)&&!('submenu' in e);
const claims=(r:SubmenuRule,id:string)=>!!(r.ids?.includes(id)||r.prefixes?.some(p=>id.startsWith(p)));
const claimsDeep=(r:SubmenuRule,id:string):boolean=>claims(r,id)||!!r.children?.some(c=>claimsDeep(c,id));

function build(rule:SubmenuRule,items:MenuModelItem[],title:(id:string)=>string,depth:number):MenuModelSubmenu|null{
 const kids=depth<MAX_SUBMENU_DEPTH?(rule.children??[]):[];
 const nested:MenuModelSubmenu[]=[];
 let rest=items;
 for(const k of kids){
  const own=rest.filter(i=>claims(k,i.id));
  if(own.length<MIN_SUBMENU)continue;
  const sub=build(k,own,title,depth+1);
  if(sub){nested.push(sub);rest=rest.filter(i=>!claims(k,i.id));}
 }
 const entries:MenuModelEntry[]=[...rest];
 if(rest.length&&nested.length)entries.push({separator:true});
 entries.push(...nested);
 if(!entries.length)return null;
 return {id:rule.id,submenu:true,title:title(rule.id),entries,enabled:anyEnabled(entries)};
}
function anyEnabled(entries:readonly MenuModelEntry[]):boolean{return entries.some(e=>!('separator' in e)&&e.enabled);}

/** Drop leading/trailing/double separators. Pure. */
export function tidySeparators(entries:readonly MenuModelEntry[]):MenuModelEntry[]{
 const out:MenuModelEntry[]=[];
 for(const e of entries){
  if('separator' in e&&(!out.length||'separator' in out[out.length-1]))continue;
  out.push(e);
 }
 while(out.length&&'separator' in out[out.length-1])out.pop();
 return out;
}

/** Group a flat entry list for one menu. `title` resolves `menu.sub.<id>` (injected so this stays pure). */
export function groupMenuEntries(menu:MenuId,entries:readonly MenuModelEntry[],title:(submenuId:string)=>string,rules:Readonly<Record<MenuId,readonly SubmenuRule[]>>=SUBMENU_RULES):MenuModelEntry[]{
 const table=rules[menu]??[];
 if(!table.length)return [...entries];
 const owner=(e:MenuModelEntry)=>isItem(e)?table.find(r=>claimsDeep(r,e.id)):undefined;
 const counts=new Map<string,number>();
 for(const e of entries){const r=owner(e);if(r)counts.set(r.id,(counts.get(r.id)??0)+1);}
 // A rule with fewer than MIN_SUBMENU entries is dissolved: its entry keeps its original place at the top level.
 const live=new Set(table.filter(r=>(counts.get(r.id)??0)>=MIN_SUBMENU).map(r=>r.id));
 const buckets=new Map<string,MenuModelItem[]>(table.map(r=>[r.id,[]]));
 const flat:MenuModelEntry[]=[];
 for(const e of entries){
  const rule=owner(e);
  if(rule&&live.has(rule.id))buckets.get(rule.id)!.push(e as MenuModelItem);else flat.push(e);
 }
 const subs:MenuModelSubmenu[]=[];
 for(const rule of table){
  const items=buckets.get(rule.id)!;
  if(!items.length)continue;
  const sub=build(rule,items,title,1);
  if(sub)subs.push(sub);
 }
 const top=tidySeparators(flat);
 const out:MenuModelEntry[]=[...top];
 if(top.length&&subs.length)out.push({separator:true});
 out.push(...subs);
 return out;
}

/** Every item id in a (possibly nested) entry list, in display order. Used by tests and the e2e inventory. */
export function flattenItems(entries:readonly MenuModelEntry[]):MenuModelItem[]{
 return entries.flatMap(e=>'separator' in e?[]:'submenu' in e?flattenItems(e.entries):[e]);
}
