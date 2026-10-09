import {nativeEditorHintKey} from '../lib/nativeEditorHint';
import {getStudio} from '../lib/studios';
import {useUiContext} from '../lib/uiContextStore';
import {railFor} from '../lib/contextRegistry';

import type {LucideIcon} from '../lib/icons';
import {PanelLeft,PanelRight,Files,Layers,Search,Image,Boxes,SlidersHorizontal,Play,Puzzle,Blocks,Paintbrush,Settings as Gear,Code2,FileText} from '../lib/icons';
import {Button} from './ui/button';
import {AgentRailButton} from './agent/AgentRailButton';
import {ChatRailButton} from './ChatRailButton';
import {VersionsIcon} from './versions/VersionsIcon';
import {executeCommand} from '../lib/commands';
import {patchState,useAppStore} from '../store/appStore';
import type {AppState} from '../store/appStore';
import {cn} from '../lib/cn';
import {useT} from '../lib/useT';
const railIcons:Record<string,LucideIcon>={Code2,Layers,Files,Search,Boxes,Paintbrush,VersionsIcon,SlidersHorizontal,Play,FileText};
/** Narrow icon strip beside each side panel. Always visible; a click opens that panel, a second click on the active icon collapses it. */
export function IconRail({side}:{side:'left'|'right'}){const {t}=useT();
 const s=useAppStore();const context=useUiContext();const studio=getStudio(s.activeStudio).shell;const studioItems:{id:string;label:string;icon:string}[]=[...(side==='left'?studio.leftRail:studio.rightRail)];if(side==='right'&&context.surface==='code')studioItems.push({id:'code',label:'Code',icon:'Code2'});const native=side==='left'&&['raster','vector','pdf'].includes(context.domain);const items=(native?[]:railFor(context.domain,side)).map(id=>studioItems.find(i=>i.id===id)!).filter(Boolean);const open=side==='left'?s.sidebarOpen:s.inspectorOpen;const active=side==='left'?s.leftTab:s.rightTab;
 const choose=(id:string)=>{
  patchState({activePanel:{...s.activePanel,[side]:null}});
  if(open&&active===id&&!s.activePanel[side]){patchState(side==='left'?{sidebarOpen:false}:{inspectorOpen:false});return;}
  patchState(side==='left'?{leftTab:id as AppState['leftTab'],sidebarOpen:true}:{rightTab:id as AppState['rightTab'],inspectorOpen:true});
 };
 return <div role="toolbar" aria-orientation="vertical" onKeyDown={e=>{const k=e.key;if(!["ArrowDown","ArrowUp","Home","End"].includes(k))return;const b=[...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];const i=b.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;e.preventDefault();b[k==="Home"?0:k==="End"?b.length-1:(i+(k==="ArrowDown"?1:-1)+b.length)%b.length].focus();}} aria-label={side==='left'?'Sidebar panels':'Inspector panels'} className="flex w-11 shrink-0 flex-col items-center gap-1 pt-2">
  <Button size="icon" aria-label={side==='left'?'Toggle sidebar':'Toggle inspector'} title={side==='left'?'Toggle sidebar (Ctrl+B)':'Toggle inspector (Ctrl+Alt+I)'} aria-pressed={open} onClick={()=>void executeCommand(side==='left'?'sidebar.toggle':'inspector.toggle')}>{side==='left'?<PanelLeft/>:<PanelRight/>}</Button>
  <span className="my-1 h-px w-6 bg-line"/>
  {s.extensionPanels.filter(p=>p.side===side).map(p=><Button key={p.id} size="icon" title={p.title} aria-label={`${p.title} panel (extension)`} aria-pressed={open&&s.activePanel[side]===p.id} className={cn(open&&s.activePanel[side]===p.id&&'bg-accent-soft text-accent')} onClick={()=>{const on=open&&s.activePanel[side]===p.id;patchState({activePanel:{...s.activePanel,[side]:on?null:p.id},...(side==='left'?{sidebarOpen:!on}:{inspectorOpen:!on})});}}><Puzzle/></Button>)}
  {native&&<><Button size="icon" aria-label={t('ctx.filesLayers')} title={t('ctx.filesLayers')} onClick={()=>patchState({sidebarOpen:!s.sidebarOpen,leftTab:'files'})}><Files/></Button>{context.domain==='raster'&&<Button size="icon" aria-label={t('imageeditor.title')} title={t('imageeditor.title')} onClick={()=>void executeCommand('tools.editImage')}><Image/></Button>}<span className="sr-only">{t(nativeEditorHintKey(context.domain))}</span></>}{items.map(({id,label,icon})=>{const Icon=railIcons[icon];return <Button key={id} size="icon" data-rail-item={id} disabled={side==='left'&&((context.domain==='markdown'&&id==='layers')||(context.domain==='empty'&&!['files','search'].includes(id)))} title={id==='design'?t('ctx.domain.'+context.domain):label} aria-label={`${label} panel`} aria-pressed={open&&active===id} className={cn(open&&active===id&&'bg-accent-soft text-accent')} onClick={()=>choose(id)}><span className="relative"><Icon/>{side==='left'&&((id==='components'&&context.selection.kind==='container'&&context.selection.isComponent))&&<span data-context-hint="true" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-accent"/>}</span></Button>;})}
 {side==='left'&&<div className="mt-auto flex flex-col items-center gap-1 pb-2"><Button size="icon" title={t('rest.iconRail.extensions')} aria-label={t('rest.iconRail.extensions')} onClick={()=>void executeCommand('extensions.open')}><Blocks/></Button><Button size="icon" title={t('rest.iconRail.settingsCtrl')} aria-label={t('rest.iconRail.settings')} onClick={()=>void executeCommand('settings.open')}><Gear/></Button></div>}
 {side==='right'&&<div className="mt-auto flex flex-col items-center gap-1"><ChatRailButton/><AgentRailButton/></div>}
 </div>;
}
