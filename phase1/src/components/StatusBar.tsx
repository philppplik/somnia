import {Monitor,Tablet,Smartphone,Minus,Plus,ChevronsUpDown} from 'lucide-react';
import {Button} from './ui/button';
import {cn} from '../lib/cn';
import {useT} from '../lib/useT';
import {useAppStore,patchState} from '../store/appStore';
import {executeCommand} from '../lib/commands';
import {Breadcrumbs} from './Breadcrumbs';
import {DropOverlay} from './DropOverlay';
import {ViewportControls} from './ViewportControls';
import {UpdatePill} from './UpdatePill';
import {CollabStatus} from './CollabStatus';
import {SaveDialog} from './SaveDialog';
import {ExportDialog} from './ExportDialog';
import {CloseProjectDialog} from './CloseProjectDialog';
import {ShareDialog} from './ShareDialog';
import {CloseDialog} from './CloseDialog';
import {WelcomeDialog} from './WelcomeDialog';
const card='flex shrink-0 items-center rounded-lg bg-panel shadow-card';
/** Bottom status bar (also hosts the app-level dialogs). Moved out of App.tsx for i18n. */
export function StatusBar(){
 const state=useAppStore();const {t}=useT();const action=(id:string)=>void executeCommand(id);
 return <footer className={cn(card,"h-9 gap-4 rounded-md px-[18px] text-[10px] text-ink-2")}><Button size="tiny" aria-label={t('status.toggleProblems')} onClick={()=>action('problems.toggle')}><ChevronsUpDown size={12}/>{t('status.problems')}</Button><UpdatePill/><CollabStatus/><DropOverlay/><SaveDialog/><ExportDialog/><CloseProjectDialog/><ShareDialog/><CloseDialog/><WelcomeDialog/><span className="flex items-center gap-1.5" role="group" aria-label={`${t('status.storage')}: ${state.storage==='disk'?t('status.storageDisk'):state.storage==='tab'?t('status.storageTab'):t('status.storageMemory')}${state.isDirty?t('status.unsavedSuffix'):''}`} data-dirty={state.isDirty} data-storage={state.storage}><span aria-hidden className={`size-2 rounded-full ${state.storage==='disk'&&!state.isDirty?'bg-emerald-500':'bg-amber-500'}`}/><span className="max-w-[180px] truncate text-ink" title={state.nativeConnected?t('status.nativeFolder'):state.coreConnected?t('status.memoryProject'):t('status.shellOnly')}>{state.projectName}{state.isDirty&&<span aria-hidden className="ml-1 text-warning">*</span>}</span><span className="text-ink-2">{state.storage==='disk'?t('status.onDisk'):state.storage==='tab'?t('status.tabCopy'):t('status.memoryOnly')}</span></span><span className="max-w-[45%] truncate" role="status" aria-live="polite">{state.notice}</span><Breadcrumbs/>{state.viewMode!=='design'&&<span>{t('status.lineCol',{line:state.cursorLine,col:state.cursorCol})}</span>}<span className="rounded-full bg-hover px-2 py-0.5 text-ink">{/\.css$/i.test(state.activeFile)?'CSS':/\.[jt]sx?$/i.test(state.activeFile)?'JS':'HTML'}</span><span>{t('status.revision',{n:state.revision})}</span><div className="flex items-center gap-0.5" role="group" aria-label={t('status.viewport')}>{([{width:1280,icon:Monitor,label:t('status.desktop')},{width:820,icon:Tablet,label:t('status.tablet')},{width:390,icon:Smartphone,label:t('status.mobile')}] as const).map(({width,icon:Icon,label})=><Button key={width} size="tiny" title={`${label} (${width}px)`} aria-label={t('status.viewportOf',{label})} aria-pressed={state.viewport===width} className={cn(state.viewport===width&&'bg-accent-soft text-accent')} onClick={()=>patchState({viewport:width})}><Icon size={13}/></Button>)}</div><ViewportControls/><Button size="tiny" aria-label={t('status.zoomOut')} onClick={()=>void executeCommand('zoom.out')}><Minus size={12}/></Button><span className="w-9 text-center" aria-label={t('status.zoom')}>{state.zoom}%</span><Button size="tiny" aria-label={t('status.zoomIn')} onClick={()=>void executeCommand('zoom.in')}><Plus size={12}/></Button></footer>;}
