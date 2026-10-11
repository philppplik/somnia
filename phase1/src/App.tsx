import {ExtensionConsentHost} from "./components/extensions/ExtensionConsentHost";
import {StudioPill} from './components/studios/StudioPill';
import {StudioViewMenu} from './components/studios/StudioViewMenu';
import {getStudio} from './lib/studios';
import {StudioCanvas,StudioInspector,StudioSidebar} from './components/studios/hosts';
import {lazy,Suspense} from 'react';
const PdfPagesPanel=lazy(()=>import('./components/pdfedit/PdfPanels').then(m=>({default:m.PdfPagesPanel})));
const PdfPropertiesPanel=lazy(()=>import('./components/pdfedit/PdfPanels').then(m=>({default:m.PdfPropertiesPanel})));
import {ContextChip} from './components/ContextChip';
import {useUiContext} from './lib/uiContextStore';


import {ImageConversionDialog} from './components/ImageConversionDialog';
import {RasterEditorProvider,RasterLeftPanel,RasterRightPanel,useRasterEditor} from './components/RasterEditor';
import {Account} from './components/Account';
import {applyWindowBackground} from './lib/windowBackground';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {ExtensionPanel} from './components/ExtensionPanel';
import {activateExtensions} from './lib/extensions/host';
import {loadActiveExtensions} from './lib/extensions/registry';
import logoMark from './assets/logo-mark.svg';
import {ExportDialog} from './components/ExportDialog';
import {CloseProjectDialog} from './components/CloseProjectDialog';
import {Breadcrumbs} from './components/Breadcrumbs';
import {DropOverlay} from './components/DropOverlay';
import {SaveDialog} from './components/SaveDialog';
import {ProblemsPanel} from './components/ProblemsPanel';
import { getState,patchState,breakpointFor } from './store/appStore';
import { applyLook } from './lib/look';
import { ViewportControls } from './components/ViewportControls';
import { resolveTheme } from './lib/theme';
import { cn } from './lib/cn';
import {Settings} from './components/Settings';
import {ExtensionsPopupMount} from './components/extensions/ExtensionsPopupMount';
import {DiskComparison} from './components/DiskComparison';
import { useEffect } from 'react';
import { WindowControls } from './components/WindowControls';
import { Menu } from '@base-ui/react/menu';
import { Monitor,Tablet,Smartphone,Minus,Plus,Search,Undo2,Redo2,PanelLeft,PanelRight,Code2,Columns2,MousePointer2,ChevronsUpDown } from './lib/icons';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { IconRail } from './components/IconRail';
import { CommunicationPanel } from './components/CommunicationPanel';
import {ChatMentionToast} from './components/SessionChat';
import {openSessionChat} from './lib/collab/communication';
import {getChatSession} from './lib/collab/chatSession';
import { LayersPanel } from './components/LayersPanel';
import { CloseDialog } from './components/CloseDialog';
import { UpdatePill } from './components/UpdatePill';
import { ShareDialog } from './components/ShareDialog';
import { CollabStatus } from './components/CollabStatus';
import { Inspector } from './components/Inspector';
import { Canvas } from './components/Canvas';
import { CommandPalette } from './components/CommandPalette';
import { ResizeHandle } from './components/ResizeHandle';
import { attachKeyboardShortcuts,commandEnabled,executeCommand,formatShortcut,listCommands } from './lib/commands';
import { useAppStore } from './store/appStore';
import {AppDialogs} from './components/AppDialogs';
import {DiagnosticsHost} from './components/diagnostics/DiagnosticsHost';
import {ConfirmHost} from './components/ConfirmHost';
import {initDiagnostics} from './lib/diagnostics/bootstrap';
import {requestConfirm} from './lib/confirmService';
import { StatusBar } from './components/StatusBar';
import {useT} from './lib/useT';
import {useMedia} from './lib/media';
const card='flex shrink-0 items-center rounded-lg bg-panel shadow-card';
/** D3 surfaces live outside studio boundaries; the runtime was created synchronously in main.tsx. */
function DiagnosticsMount(){
 const {host,diagnostics,review}=initDiagnostics();
 return <DiagnosticsHost host={host} diagnostics={diagnostics} review={review} confirmDelete={()=>requestConfirm({title:'Delete crash reports?',message:'Selected crash reports are removed from this device. This cannot be undone.',confirmLabel:'Delete',destructive:true})}/>;
}
export function App(){return <RasterEditorProvider><AppContent/></RasterEditorProvider>;}
function AppContent(){
 const raster=useRasterEditor();
 const {t}=useT();const state=useAppStore();const media=useMedia();useEffect(()=>attachKeyboardShortcuts(),[]);useEffect(()=>{let off=activateExtensions(loadActiveExtensions());const re=()=>{off();off=activateExtensions(loadActiveExtensions());};window.addEventListener('somnia:extensions-changed',re);return()=>{window.removeEventListener('somnia:extensions-changed',re);off();};},[]);useEffect(()=>{const apply=()=>{const r=resolveTheme(state.themeChoice);document.documentElement.dataset.palette=r.palette;if(getState().theme!==r.mode)patchState({theme:r.mode});};apply();if(state.themeChoice!=='system')return;const mq=matchMedia('(prefers-color-scheme: dark)');mq.addEventListener('change',apply);return()=>mq.removeEventListener('change',apply);},[state.themeChoice]);useEffect(()=>{document.documentElement.dataset.theme=state.theme;document.documentElement.dataset.contrast=state.contrast;document.documentElement.dataset.codeTheme=state.codeTheme;},[state.theme,state.contrast,state.codeTheme]);useEffect(()=>{/* Glass depends on theme colours (code floor) and the OS transparency switch. */const re=()=>applyLook(getState().look);re();if(typeof matchMedia!=='function')return;const mq=matchMedia('(prefers-reduced-transparency: reduce)');mq.addEventListener?.('change',re);return()=>mq.removeEventListener?.('change',re);},[state.theme,state.contrast,state.codeTheme]);
 useEffect(()=>{void applyWindowBackground({mode:state.look.background,dark:state.theme==='dark',highContrast:state.contrast==='high'});},[state.look.background,state.theme,state.contrast]);
 const action=(id:string)=>void executeCommand(id);
 const pdfActive=media.items.some(m=>m.name===media.active&&m.kind==='pdf');
 const context=useUiContext();const mdActive=context.domain==='markdown';const nativeDomain=['raster','vector','pdf'].includes(context.domain);useEffect(()=>{if(state.workflowPrefs.panelFollowsContext)patchState({rightTab:context.surface==='code'?'code':'design'});},[context.surface,context.domain,state.workflowPrefs.panelFollowsContext]);


 const inspectorShown=state.inspectorOpen&&(raster.active||!mdActive||!!state.activePanel.right);
 return <div className="app-frame flex h-dvh min-h-[600px] min-w-[960px] flex-col gap-shell bg-shell p-shell"><header className="relative -mx-shell -mt-shell flex h-11 shrink-0 items-center gap-1 border-b border-subtle bg-transparent px-3 select-none" data-tauri-drag-region onDoubleClick={e=>{if(state.windowPrefs.doubleClick==='maximize'&&isTauri()&&(e.target as HTMLElement).hasAttribute('data-tauri-drag-region'))void getCurrentWindow().toggleMaximize();}}><div className="size-7 bg-ink" style={{maskImage:`url("${logoMark}")`,maskSize:"contain",maskRepeat:"no-repeat",maskPosition:"center",WebkitMaskImage:`url("${logoMark}")`,WebkitMaskSize:"contain",WebkitMaskRepeat:"no-repeat",WebkitMaskPosition:"center"}} data-tauri-drag-region aria-hidden="true"/><span className="w-2"/><div className="flex gap-0.5">{getStudio(state.activeStudio).shell.header.menus.map(category=><Menu.Root key={category}><Menu.Trigger className="h-8 cursor-pointer rounded-sm border-0 bg-transparent px-2.5 text-ink-2 hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink">{t('menu.'+category)}</Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{category==='View'&&<StudioViewMenu/>}{listCommands().filter(c=>c.category===category&&!(category==='View'&&(getStudio(state.activeStudio).menus.view.includes(c.id)||c.id.startsWith('studio.')))).map(command=><Menu.Item key={command.id} className="menu-item" disabled={!commandEnabled(command)||(context.domain!=='web'&&command.category==='Insert')} onClick={()=>action(command.id)}><span>{command.title}</span>{command.shortcut&&<kbd>{formatShortcut(command.shortcut)}</kbd>}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>)}</div><ContextChip/><Separator/>{!raster.active&&<><Button size="icon" aria-label={t('cmd.edit.undo')} disabled={!state.coreConnected||nativeDomain} onClick={()=>action('edit.undo')}><Undo2/></Button><Button size="icon" aria-label={t('cmd.edit.redo')} disabled={!state.coreConnected||nativeDomain} onClick={()=>action('edit.redo')}><Redo2/></Button></>}<span className="grow" data-tauri-drag-region/>{!raster.active&&<StudioPill/>}<span className="grow" data-tauri-drag-region/><Button variant="outline" className="!h-8 rounded-[var(--r-control)]" onClick={()=>action('palette.open')}><Search size={14}/><span>{t('finish2.toolbar.commands')}</span><kbd>{formatShortcut('Mod+K')}</kbd></Button><Account/><WindowControls/></header><div className="flex min-h-0 flex-1 gap-1"><IconRail side="left"/><div className="editor-layout" style={{gridTemplateColumns:`${state.sidebarOpen?`${state.sidebarWidth}px var(--gap)`:'0px 0px'} minmax(180px,1fr) ${inspectorShown?`var(--gap) ${state.inspectorWidth}px`:'0px 0px'}`}}><div className="pane-slot">{state.sidebarOpen&&(raster.active?<RasterLeftPanel/>:pdfActive?<Suspense fallback={null}><PdfPagesPanel/></Suspense>:state.activePanel.left?<ExtensionPanel id={state.activePanel.left}/>:<StudioSidebar/>)}</div>{state.sidebarOpen?<ResizeHandle side="left"/>:<span/>}<StudioCanvas/>{inspectorShown?<ResizeHandle side="right"/>:<span/>}<div className="pane-slot">{inspectorShown&&(raster.active?<RasterRightPanel/>:pdfActive?<Suspense fallback={null}><PdfPropertiesPanel/></Suspense>:state.activePanel.right?<ExtensionPanel id={state.activePanel.right}/>:<StudioInspector/>)}</div></div>{state.agentOpen&&<CommunicationPanel/>}<IconRail side="right"/></div>{state.problemsOpen&&<ProblemsPanel/>}<StatusBar/><AppDialogs/><DiagnosticsMount/><ConfirmHost/><ExtensionConsentHost/><ExtensionsPopupMount/><ChatMentionToast/><ChatShortcut/><CommandPalette/><Settings/><DiskComparison/><ImageConversionDialog/></div>;
}

function ChatShortcut(){useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.code==='KeyC'&&getChatSession()){e.preventDefault();openSessionChat();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[]);return null;}
