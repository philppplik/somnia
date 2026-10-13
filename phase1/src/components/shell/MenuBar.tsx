import {Menu} from '@base-ui/react/menu';
import {useEffect} from 'react';
import {executeCommand,formatShortcut} from '../../lib/commands';
import {buildLegacyMenuModel,buildMenuModel,type MenuModelEntry} from '../../lib/shell/menuModel';
import {installNativeMenuMirror} from './nativeMenuInstall';
import {useUiContext} from '../../lib/uiContextStore';
import {useT} from '../../lib/useT';
import {useAppStore} from '../../store/appStore';
import {StudioViewMenu} from '../studios/StudioViewMenu';

const triggerClass='h-8 cursor-pointer rounded-sm border-0 bg-transparent px-2.5 text-ink-2 hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink';

/** Entries of one popup. A submenu node renders as a base-ui SubmenuRoot (Right opens, Left/Esc closes, typeahead and roles come from base-ui). */
function Entries({entries,insertLocked,action}:{entries:readonly MenuModelEntry[];insertLocked:boolean;action:(id:string)=>void}){
 return <>{entries.map((entry,index)=>{
  if('separator' in entry)return <Menu.Separator key={'sep'+index} className="my-1 h-px bg-line"/>;
  if('submenu' in entry)return <Menu.SubmenuRoot key={'sub.'+entry.id}><Menu.SubmenuTrigger className="menu-item" disabled={!entry.enabled||insertLocked} data-menu-submenu={entry.id}><span>{entry.title}</span><span aria-hidden="true" className="text-ink-2">›</span></Menu.SubmenuTrigger><Menu.Portal><Menu.Positioner sideOffset={4} alignOffset={-4}><Menu.Popup className="menu-popup"><Entries entries={entry.entries} insertLocked={insertLocked} action={action}/></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.SubmenuRoot>;
  return <Menu.Item key={entry.id} className="menu-item" disabled={!entry.enabled||insertLocked} onClick={()=>action(entry.id)}><span>{entry.title}</span>{entry.shortcut&&<kbd>{formatShortcut(entry.shortcut)}</kbd>}</Menu.Item>;
 })}</>;
}

/**
 * M2: the fixed six top-level menus. A migrated studio (shellV2.menus, Code first) renders from the
 * menuResolver model; every other studio renders the category-based legacy model. Both go through
 * menuGrouping, so long menus show submenus ("tree dropdowns", at most two levels). Titles, shortcuts
 * and enabled flags come from the live command registry in both paths, and clicks go through
 * executeCommand, which re-checks availability.
 */
export function MenuBar(){
 useEffect(()=>{let off=()=>{};void installNativeMenuMirror().then(dispose=>{off=dispose;});return()=>off();},[]);
 const {t}=useT();const state=useAppStore();const context=useUiContext();
 const action=(id:string)=>void executeCommand(id);
 const migrated=buildMenuModel(state.activeStudio);
 const model=migrated??buildLegacyMenuModel(state.activeStudio);
 return <div className="flex gap-0.5">{model.map(m=><Menu.Root key={m.menu}><Menu.Trigger disabled={migrated?m.disabled:false} className={triggerClass}>{t('menu.'+m.menu)}</Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{m.viewModes&&<StudioViewMenu/>}<Entries entries={m.entries} insertLocked={context.domain!=='web'&&m.menu==='Insert'} action={action}/></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>)}</div>;
}
