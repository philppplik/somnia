import {Menu} from '@base-ui/react/menu';
import {useEffect} from 'react';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../../lib/commands';
import {buildMenuModel} from '../../lib/shell/menuModel';
import {installNativeMenuMirror} from './nativeMenuInstall';
import {getStudio} from '../../lib/studios';
import {useUiContext} from '../../lib/uiContextStore';
import {useT} from '../../lib/useT';
import {useAppStore} from '../../store/appStore';
import {StudioViewMenu} from '../studios/StudioViewMenu';

const triggerClass='h-8 cursor-pointer rounded-sm border-0 bg-transparent px-2.5 text-ink-2 hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink';

/**
 * M2: the fixed six top-level menus. A migrated studio (shellV2.menus, Code first) renders from the
 * menuResolver model; every other studio keeps the pre-M2 category-based rendering, byte for byte.
 * Titles, shortcuts and enabled flags come from the live command registry in both paths, and clicks
 * go through executeCommand, which re-checks availability.
 */
export function MenuBar(){
 useEffect(()=>{let off=()=>{};void installNativeMenuMirror().then(dispose=>{off=dispose;});return()=>off();},[]);
 const {t}=useT();const state=useAppStore();const context=useUiContext();
 const studio=getStudio(state.activeStudio);
 const action=(id:string)=>void executeCommand(id);
 const model=buildMenuModel(state.activeStudio);
 if(model)return <div className="flex gap-0.5">{model.map(m=><Menu.Root key={m.menu}><Menu.Trigger disabled={m.disabled} className={triggerClass}>{t('menu.'+m.menu)}</Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{m.viewModes&&<StudioViewMenu/>}{m.entries.map((entry,index)=>'separator' in entry?<Menu.Separator key={index} className="my-1 h-px bg-line"/>:<Menu.Item key={entry.id} className="menu-item" disabled={!entry.enabled||(context.domain!=='web'&&m.menu==='Insert')} onClick={()=>action(entry.id)}><span>{entry.title}</span>{entry.shortcut&&<kbd>{formatShortcut(entry.shortcut)}</kbd>}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>)}</div>;
 return <div className="flex gap-0.5">{studio.shell.header.menus.map(category=><Menu.Root key={category}><Menu.Trigger className={triggerClass}>{t('menu.'+category)}</Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{category==='View'&&<StudioViewMenu/>}{listCommands().filter(c=>c.category===category&&!(category==='View'&&(studio.menus.view.includes(c.id)||c.id.startsWith('studio.')))).map(command=><Menu.Item key={command.id} className="menu-item" disabled={!commandEnabled(command)||(context.domain!=='web'&&command.category==='Insert')} onClick={()=>action(command.id)}><span>{command.title}</span>{command.shortcut&&<kbd>{formatShortcut(command.shortcut)}</kbd>}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>)}</div>;
}
