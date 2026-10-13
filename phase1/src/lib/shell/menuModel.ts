/**
 * M2: one menu model for every surface (concept 4.2: "Same data feeds: native menu (Tauri),
 * in-app menu, command palette, context menus. One source, four surfaces.").
 *
 * buildMenuModel resolves a migrated studio's `shellV2.menus` through menuResolver and marries the
 * result with the live command registry: titles (i18n + scoped overrides), shortcuts (user overrides)
 * and enabled flags always come from `listCommands()`, exactly like the category-based menu did.
 * Commands registered dynamically at runtime that no MenuItemDef claims (recovery entries, future
 * packages) keep appearing as a tail in registry order, so migrating a studio never hides them.
 */
import type {Command} from '../commandRegistry';
import {commandEnabled,listCommands} from '../commands';
import {t} from '../i18n';
import {getStudio} from '../studios';
import {getUiContext} from '../uiContextStore';
import {groupMenuEntries,flattenItems} from './menuGrouping';
import type {MenuModel,MenuModelEntry,MenuModelItem,MenuModelSubmenu} from './menuModelTypes';
import {resolveMenuBar} from './menuResolver';
import {MENU_IDS,type MenuId,type MenuItemDef} from './types';

export type {MenuModel,MenuModelEntry,MenuModelItem,MenuModelSubmenu};

const subTitle=(id:string)=>t('menu.sub.'+id);

const claimAll=(defs:readonly MenuItemDef[],into:Set<string>)=>{for(const d of defs){into.add(d.command);if(d.submenu)claimAll(d.submenu,into);}};

/** Legacy category filter, kept verbatim from the pre-M2 inline menu so unmigrated studios are untouched. */
export function legacyMenuCommands(studioId:string,menu:MenuId,commands:Command[]):Command[]{
 const studio=getStudio(studioId);
 return commands.filter(c=>c.category===menu&&!(menu==='View'&&(studio.menus.view.includes(c.id)||c.id.startsWith('studio.'))));
}

/** Resolved menu bar for a migrated studio. Returns null while a studio has no `shellV2.menus`. */
export function buildMenuModel(studioId:string,commands:Command[]=listCommands()):MenuModel[]|null{
 const studio=getStudio(studioId);
 const defs=studio.shellV2?.menus;
 if(!defs)return null;
 const ctx={...getUiContext(),studio:studioId};
 const byId=new Map(commands.map(c=>[c.id,c]));
 const claimed=new Set<string>();claimAll(defs,claimed);
 const resolved=resolveMenuBar({base:[],studio:defs},{
  ctx,
  exists:id=>byId.has(id),
  isEnabled:id=>{const c=byId.get(id);return c?commandEnabled(c):true;},
 });
 return resolved.map(rm=>{
  const entries:MenuModelEntry[]=[];
  const present=new Set<string>();
  for(const e of rm.entries){
   if('separator' in e){entries.push({separator:true});continue;}
   const c=byId.get(e.command)!;
   present.add(c.id);
   if(e.submenu){
    // Manifest-declared submenu (MenuItemDef.submenu): its children are real entries, the parent command is only the label.
    const kids:MenuModelItem[]=[];
    for(const k of e.submenu){const kc=byId.get(k.command);if(!kc)continue;present.add(kc.id);kids.push({id:kc.id,title:k.label?t(k.label):kc.title,shortcut:kc.shortcut,enabled:k.enabled});}
    entries.push({id:c.id,submenu:true,title:e.label?t(e.label):c.title,entries:kids,enabled:kids.some(k=>k.enabled)});
    continue;
   }
   entries.push({id:c.id,title:e.label?t(e.label):c.title,shortcut:c.shortcut,enabled:e.enabled});
  }
  // Dynamic tail: registered commands of this menu the manifest does not claim (same exclusions as legacy).
  for(const c of legacyMenuCommands(studioId,rm.menu,commands)){
   if(claimed.has(c.id)||present.has(c.id))continue;
   entries.push({id:c.id,title:c.title,shortcut:c.shortcut,enabled:commandEnabled(c)});
  }
  const grouped=groupMenuEntries(rm.menu,entries,subTitle);
  return {menu:rm.menu,viewModes:rm.menu==='View',entries:grouped,disabled:!flattenItems(grouped).length};
 });
}

/** Category-based model for unmigrated studios. Used by the native menu mirror only; the in-app legacy path renders its own JSX. */
export function buildLegacyMenuModel(studioId:string,commands:Command[]=listCommands()):MenuModel[]{
 const studio=getStudio(studioId);
 return MENU_IDS.filter(menu=>studio.shell.header.menus.includes(menu)).map(menu=>({
  menu,
  viewModes:menu==='View',
  entries:groupMenuEntries(menu,legacyMenuCommands(studioId,menu,commands).map(c=>({id:c.id,title:c.title,shortcut:c.shortcut,enabled:commandEnabled(c)})),subTitle),
  disabled:!legacyMenuCommands(studioId,menu,commands).length,
 }));
}
