import {shellLayoutStore,editPanelStack,useShellLayout} from '../store/shellLayoutStore';
import {studioPanels,studioDefaultLayout,studioRail} from '../lib/shell/codePanels';
import {evalWhen} from '../lib/shell/when';
import {useState} from 'react';
import {resolveRailIcon} from '../lib/shell/railIcons';
import {useStudioContext} from '../lib/shell/studioContext';
import {applyRailOp,railCustomizable,railModel,setFocusedRailItem} from '../store/railActions';
import {RailMenu,type RailMenuItem} from './shell/RailMenu';
import {useRovingToolbar} from './shell/useRovingToolbar';
import './shell/railIconSet';
import type {RailItemDef} from '../lib/shell/types';
import {nativeEditorHintKey} from '../lib/nativeEditorHint';
import {getStudio} from '../lib/studios';
import {useUiContext} from '../lib/uiContextStore';
import {railFor} from '../lib/contextRegistry';

import type {LucideIcon} from '../lib/icons';
import {PanelLeft,PanelRight,Files,Layers,Search,Image,Boxes,SlidersHorizontal,Play,Puzzle,Blocks,Paintbrush,Settings as Gear,Code2,FileText,Columns2} from '../lib/icons';
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
export function IconRail({side}:{side:'left'|'right'}){const {t}=useT();const toolbarRef=useRovingToolbar<HTMLDivElement>();
 const s=useAppStore();const context=useUiContext();const studio=getStudio(s.activeStudio);const studioItems:RailItemDef[]=[...studioRail(studio,side)];if(side==='right'&&context.surface==='code')studioItems.push({id:'code',label:'Code',icon:'Code2',kind:'panel',panel:'code',order:100});const native=side==='left'&&s.activeStudio==='code'&&['raster','vector','pdf'].includes(context.domain);const items=(native?[]:studio.shellV2?.panels?.length?studioItems:railFor(context.domain,side).map(id=>studioItems.find(i=>i.id===id)!)).filter(i=>i&&evalWhen(i.when,context));const panels=studioPanels(studio),defaults=studioDefaultLayout(studio),layout=useShellLayout(studio.id,defaults,panels);const open=side==='left'?s.sidebarOpen:s.inspectorOpen;const active=studio.shellV2?.panels?.length?(side==='left'?layout.activeLeft:layout.activeRight):(side==='left'?s.leftTab:s.rightTab);
 const v2=railCustomizable(studio),sctx=useStudioContext(studio.id),rail=v2?railModel(studio,side,layout.railOverrides,sctx):null,shown:readonly RailItemDef[]=rail?rail.visible:items;
 const [menu,setMenu]=useState<{x:number;y:number;label:string;items:RailMenuItem[]}|null>(null);
 const itemLabel=(i:{label:string;labelKey?:string})=>i.labelKey?t(i.labelKey):i.label;
 const runTool=(id?:string)=>{const tl=studio.shellV2?.tools?.find(x=>x.id===id);if(!tl)return;void executeCommand(tl.command);if(tl.opensPanel)choose(tl.opensPanel);};
 const cmdItem=(op:string,id:string,disabled=false):RailMenuItem=>({label:t('cmd.shell.rail.'+op),disabled,onClick:()=>void executeCommand('shell.rail.'+op,{side,id})});
 const itemMenu=(e:React.MouseEvent,id:string)=>{if(!rail)return;e.preventDefault();setFocusedRailItem({side,id});const at=rail.visible.findIndex(i=>i.id===id),pinned=at>=0;setMenu({x:e.clientX,y:e.clientY,label:t('shell.rail.menu'),items:[cmdItem('moveUp',id,at<=0),cmdItem('moveDown',id,!pinned||at>=rail.visible.length-1),pinned?cmdItem('unpin',id):cmdItem('pin',id),cmdItem('hide',id),{label:'',onClick:()=>{},separator:true},{label:t('cmd.shell.rail.reset'),onClick:()=>void executeCommand('shell.rail.reset')}]});};
 const choose=(id:string)=>{
  const panels=studioPanels(studio);if(panels.some(p=>p.id===id&&p.side===side)){const defaults=studioDefaultLayout(studio);const layout=shellLayoutStore.get(studio.id,defaults,panels);shellLayoutStore.update(studio.id,{...editPanelStack(studio.shellV2?.panels?.length?layout:{...layout,[side==='left'?'leftPanels':'rightPanels']:[]},side,id,'toggle'),collapsedPanels:(layout.collapsedPanels??[]).filter(p=>p!==id)},defaults,panels);}
  patchState({activePanel:{...s.activePanel,[side]:null}});
  if(open&&active===id&&!s.activePanel[side]){patchState(side==='left'?{sidebarOpen:false}:{inspectorOpen:false});return;}
  patchState(side==='left'?{...(s.activeStudio==='code'?{leftTab:id as AppState['leftTab']}:{}),sidebarOpen:true}:{...(s.activeStudio==='code'?{rightTab:id as AppState['rightTab']}:{}),inspectorOpen:true});
 };
 return <div ref={toolbarRef} role="toolbar" aria-orientation="vertical" onKeyDown={e=>{const k=e.key;if(!["ArrowDown","ArrowUp","Home","End"].includes(k))return;const b=[...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];const i=b.indexOf(document.activeElement as HTMLButtonElement);if(i<0)return;e.preventDefault();b[k==="Home"?0:k==="End"?b.length-1:(i+(k==="ArrowDown"?1:-1)+b.length)%b.length].focus();}} aria-label={side==='left'?t('shell.rail.panelsLeft'):t('shell.rail.panelsRight')} className="flex w-11 shrink-0 flex-col items-center gap-1 pt-2">
  <Button size="icon" aria-label={side==='left'?t('shell.rail.toggleSidebar'):t('shell.rail.toggleInspector')} title={side==='left'?'Toggle sidebar (Ctrl+B)':'Toggle inspector (Ctrl+Alt+I)'} aria-pressed={open} onClick={()=>void executeCommand(side==='left'?'sidebar.toggle':'inspector.toggle')}>{side==='left'?<PanelLeft/>:<PanelRight/>}</Button>
  <span className="my-1 h-px w-6 bg-line"/>
  {s.extensionPanels.filter(p=>p.side===side).map(p=><Button key={p.id} size="icon" title={p.title} aria-label={t('shell.rail.extensionPanel',{title:p.title})} aria-pressed={open&&s.activePanel[side]===p.id} className={cn(open&&s.activePanel[side]===p.id&&'bg-accent-soft text-accent')} onClick={()=>{const on=open&&s.activePanel[side]===p.id;patchState({activePanel:{...s.activePanel,[side]:on?null:p.id},...(side==='left'?{sidebarOpen:!on}:{inspectorOpen:!on})});}}><Puzzle/></Button>)}
  {native&&<><Button size="icon" aria-label={t('ctx.filesLayers')} title={t('ctx.filesLayers')} onClick={()=>patchState({sidebarOpen:!s.sidebarOpen,leftTab:'files'})}><Files/></Button>{context.domain==='raster'&&<Button size="icon" aria-label={t('imageeditor.title')} title={t('imageeditor.title')} onClick={()=>void executeCommand('tools.editImage')}><Image/></Button>}<span className="sr-only">{t(nativeEditorHintKey(context.domain))}</span></>}{shown.map((item,index)=>{const {id,icon,kind,command,panel,tool:toolId,badge}=item,label=itemLabel(item),Icon=v2?resolveRailIcon(icon):(railIcons[icon]??Puzzle);return <Button key={id} size="icon" data-rail-item={id} {...(v2?{draggable:true,onDragStart:(e:React.DragEvent)=>{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';},onDragOver:(e:React.DragEvent)=>e.preventDefault(),onDrop:(e:React.DragEvent)=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');if(from&&from!==id)applyRailOp(studio,'move',{side,id:from,to:index});},onContextMenu:(e:React.MouseEvent)=>itemMenu(e,id),onFocus:()=>setFocusedRailItem({side,id})}:{})} disabled={!v2&&side==='left'&&((context.domain==='markdown'&&id==='layers')||(context.domain==='empty'&&!['files','search'].includes(id)))} title={!v2&&id==='design'?t('ctx.domain.'+context.domain):label} aria-label={kind==='panel'?`${label} panel`:label} aria-pressed={open&&active===id} className={cn(open&&active===id&&'bg-accent-soft text-accent')} onClick={()=>kind==='action'||kind==='command'?command&&void executeCommand(command):kind==='tool'?runTool(toolId):choose(panel??id)}><span className="relative"><Icon/>{badge&&evalWhen(badge,sctx)&&<span data-rail-badge="true" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-accent"/>}{side==='left'&&((id==='components'&&context.selection.kind==='container'&&context.selection.isComponent))&&<span data-context-hint="true" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-accent"/>}</span></Button>;})}
 {rail&&(rail.overflow.length>0||rail.hidden.length>0)&&<Button size="icon" data-testid="rail-more" aria-label={t('shell.rail.more')} title={t('shell.rail.more')} aria-haspopup="menu" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setMenu({x:side==='left'?r.right+4:r.left-200,y:r.top,label:t('shell.rail.more'),items:[...rail.overflow.map<RailMenuItem>(i=>({label:itemLabel(i),onClick:()=>{if(i.kind==='command'||i.kind==='action'){if(i.command)void executeCommand(i.command);}else if(i.kind==='tool')runTool(i.tool);else choose(i.panel??i.id);}})),...(rail.overflow.length?[{label:'',onClick:()=>{},separator:true}]:[]),...rail.overflow.map<RailMenuItem>(i=>cmdItem('pin',i.id)).map((m,n)=>({...m,label:t('shell.rail.pinItem',{label:itemLabel(rail.overflow[n])})})),...rail.hidden.map<RailMenuItem>(i=>({label:t('shell.rail.showItem',{label:itemLabel(i)}),onClick:()=>void executeCommand('shell.rail.show',{side,id:i.id})})),{label:'',onClick:()=>{},separator:true},{label:t('cmd.shell.rail.reset'),onClick:()=>void executeCommand('shell.rail.reset')}]});}}><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></Button>}
 {menu&&<RailMenu {...menu} onClose={()=>setMenu(null)}/>}
 {side==='left'&&s.activeStudio==='code'&&<Button size="icon" aria-label={t('rest.fileTabs.toggleDiffSplit')} title={t('rest.fileTabs.compareInEditorDiffSplit')} aria-pressed={s.diffSplit} className={cn(s.diffSplit&&'bg-accent-soft text-accent')} onClick={()=>patchState({diffSplit:!s.diffSplit})}><Columns2/></Button>}
 {side==='left'&&<div className="mt-auto flex flex-col items-center gap-1 pb-2"><Button size="icon" title={t('rest.iconRail.extensions')} aria-label={t('rest.iconRail.extensions')} onClick={()=>void executeCommand('extensions.open')}><Blocks/></Button><Button size="icon" title={t('rest.iconRail.settingsCtrl')} aria-label={t('rest.iconRail.settings')} onClick={()=>void executeCommand('settings.open')}><Gear/></Button></div>}
 {side==='right'&&<div className="mt-auto flex flex-col items-center gap-1"><ChatRailButton/><AgentRailButton/></div>}
 </div>;
}
