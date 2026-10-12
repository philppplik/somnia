import {Fragment,type ReactNode} from 'react';
import {layoutStatusBar,statusSlotsFor,type StatusItem} from '../lib/shell/statusSlots';
import type {StatusSlotDef} from '../lib/shell/types';
import {NoticeHost} from './diagnostics/NoticeHost';
import {coordinator} from '../lib/studios/openIntake';
import {useVectorSession} from '../lib/vectorstudio/session';
import {slidesIsDirty,useSlidesSession} from '../lib/slides/session';
import {isMarkdown,useMedia} from '../lib/media';
import {useComponentDrag} from '../lib/componentDrag';
import {Monitor,Tablet,Smartphone,Minus,Plus,ChevronsUpDown} from '../lib/icons';
import {Button} from './ui/button';
import {useUiContext} from '../lib/uiContextStore';
import {cn} from '../lib/cn';
import {useT} from '../lib/useT';
import {useAppStore,patchState} from '../store/appStore';
import {executeCommand} from '../lib/commands';
import {Breadcrumbs} from './Breadcrumbs';
import {ViewportControls} from './ViewportControls';
import {UpdatePill} from './UpdatePill';
import {CollabStatus} from './CollabStatus';
import {MathPill} from './MathPill';
import {formatAppRelease} from '../lib/appRelease';
/** Domain-neutral status slots. Dialogs live in AppDialogs. */
export function StatusBar(){
 const state=useAppStore();useSlidesSession();const vector=useVectorSession();const {t}=useT();const context=useUiContext();const media=useMedia();const mediaActive=media.active;const drag=useComponentDrag();
 const ctx={domain:context.domain,surface:context.surface,studio:state.activeStudio,media:{active:!!mediaActive}};
 const layout=layoutStatusBar(statusSlotsFor(state.activeStudio),ctx);
 const globals:Record<string,()=>ReactNode>={
  'drag-hint':()=>drag?<span role="status" data-testid="component-drag-hint" className="shrink-0 whitespace-nowrap text-accent">{t('panels.components.dragStatus')}</span>:null,
  notices:()=><NoticeHost whenDestructiveApprovalIdle={coordinator.whenDestructiveApprovalIdle}/>,
  update:()=><UpdatePill/>,collab:()=><CollabStatus/>,math:()=><MathPill/>,
  message:()=><span className="max-w-[45%] truncate" role="status" aria-live="polite">{state.activeStudio==='vector'&&vector.open?t(vector.dirty?'vector.unsaved':'vector.unchanged'):mediaActive&&media.items.find(m=>m.name===mediaActive)?.kind==='pptx'?(slidesIsDirty(mediaActive)?'Unsaved slide text changes':'PPTX original unchanged'):state.notice}</span>,
  version:()=><span data-testid="app-version-pill" className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-ink">{formatAppRelease(__APP_RELEASE__)}</span>,
  revision:()=><span>{t('status.revision',{n:state.revision})}</span>,
 };
 const render=(i:StatusItem)=>i.kind==='global'?<Fragment key={'g:'+i.id}>{globals[i.id]?.()}</Fragment>:<Fragment key={'s:'+i.id}><StatusSlotView def={i.def}/></Fragment>;
 return <footer className="-mx-shell -mb-shell flex h-9 shrink-0 items-center gap-4 border-t border-subtle bg-transparent px-[18px] text-[10px] text-ink-2" data-testid="status-bar">{layout.before.map(render)}<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="status-context-slot">{layout.center.map(render)}</div>{layout.after.map(render)}</footer>;}

/** Resolves a declared slot to its component. Unknown components render nothing. */
function StatusSlotView({def}:{def:StatusSlotDef}){
 const C=STATUS_COMPONENTS[def.component];return C?<C def={def}/>:null;
}
const STATUS_COMPONENTS:Record<string,(p:{def:StatusSlotDef})=>ReactNode>={
 'status.save':()=><StatusSaveSlot/>,
 'status.problems':({def})=><ProblemsSlot command={def.command}/>,
 'status.selection':()=><SelectionSlot/>,
 'status.lineCol':()=><LineColSlot/>,
 'status.words':()=><WordsSlot/>,
 'status.file':()=><FileSlot/>,
 'status.viewMode':()=><ViewModeSlot/>,
 'status.viewport':()=><StatusViewportSlot/>,
};
function ProblemsSlot({command}:{command?:string}){const {t}=useT();return <Button size="tiny" aria-label={t('status.toggleProblems')} onClick={()=>void executeCommand(command??'problems.toggle')}><ChevronsUpDown size={12}/>{t('status.problems')}</Button>;}
function SelectionSlot(){const c=useUiContext(),{t}=useT();return c.selection.kind==='multi'?<span>{t('ctx.selected',{count:c.selection.count})}</span>:<Breadcrumbs/>;}
function LineColSlot(){const s=useAppStore(),{t}=useT();return <span className="shrink-0">{t('status.lineCol',{line:s.cursorLine,col:s.cursorCol})}</span>;}
function WordsSlot(){const s=useAppStore(),{t}=useT();return <span>{t('ctx.words',{count:(s.files[s.activeFile]??'').trim().split(/\s+/).filter(Boolean).length})}</span>;}
function FileSlot(){const c=useUiContext();return <span className="truncate">{c.file}</span>;}
function ViewModeSlot(){const state=useAppStore(),{t}=useT(),media=useMedia();const md=isMarkdown(state.activeFile)&&!media.active;return <span data-testid="studio-view-context" aria-label={t('studio.viewMode')} className="shrink-0">{t(md?'md.view.'+state.viewMode:'finish2.toolbar.'+state.viewMode)}</span>;}

/** Kept for compatibility: the context region with every default slot, evaluated against the live context. */
export function StatusContextSlot(){const c=useUiContext(),s=useAppStore(),media=useMedia();const layout=layoutStatusBar(statusSlotsFor(s.activeStudio),{domain:c.domain,surface:c.surface,studio:s.activeStudio,media:{active:!!media.active}});return <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" data-testid="status-context-slot">{layout.center.map(i=>i.kind==='slot'?<StatusSlotView key={i.id} def={i.def}/>:null)}</div>;}

export function StatusSaveSlot(){useSlidesSession();const state=useAppStore(),{t}=useT();const media=useMedia();const vector=useVectorSession();if(state.activeStudio==='vector'&&vector.open)return <span data-testid="vector-session-status" data-storage="memory" data-dirty={vector.dirty} className="flex items-center gap-1.5" role="group" aria-label={`${vector.name}: ${t(vector.dirty?'vector.unsaved':'vector.unchanged')}`}><span aria-hidden className={`size-2 rounded-full ${vector.dirty?'bg-amber-500':'bg-emerald-500'}`}/><span className="max-w-[180px] truncate text-ink">{vector.name}{vector.dirty&&<span aria-hidden className="ml-1 text-warning">*</span>}</span><span>{t(vector.dirty?'vector.unsaved':'vector.unchanged')} · {t('vector.inMemory')}</span></span>;const active=media.items.find(m=>m.name===media.active);if(active?.kind==='pptx')return <span role="group" aria-label="Read-only presentation" className="text-ink-2">{active.name} · {slidesIsDirty(active.name)?'Unsaved changes':'Original unchanged'}</span>;return <span className="flex items-center gap-1.5" role="group" aria-label={`${t('status.storage')}: ${state.storage==='disk'?t('status.storageDisk'):state.storage==='tab'?t('status.storageTab'):t('status.storageMemory')}${state.isDirty?t('status.unsavedSuffix'):''}`} data-dirty={state.isDirty} data-storage={state.storage}><span aria-hidden className={`size-2 rounded-full ${state.storage==='disk'&&!state.isDirty?'bg-emerald-500':'bg-amber-500'}`}/><span className="max-w-[180px] truncate text-ink" title={state.nativeConnected?t('status.nativeFolder'):state.coreConnected?t('status.memoryProject'):t('status.shellOnly')}>{state.projectName}{state.isDirty&&<span aria-hidden className="ml-1 text-warning">*</span>}</span><span className="text-ink-2">{state.storage==='disk'?t('status.onDisk'):state.storage==='tab'?t('status.tabCopy'):t('status.memoryOnly')}</span></span>;}

export function StatusViewportSlot(){const state=useAppStore(),context=useUiContext(),{t}=useT();const web=context.domain==='web'||context.domain==='code-only'&&context.surface!=='code';const zoom=web&&context.surface!=='code';return <>{web&&context.surface!=='code'&&<div className="flex items-center gap-0.5" role="group" aria-label={t('status.viewport')}>{([{width:1280,icon:Monitor,label:t('status.desktop')},{width:820,icon:Tablet,label:t('status.tablet')},{width:390,icon:Smartphone,label:t('status.mobile')}] as const).map(({width,icon:Icon,label})=><Button key={width} size="tiny" title={`${label} (${width}px)`} aria-label={t('status.viewportOf',{label})} aria-pressed={state.viewport===width} className={cn(state.viewport===width&&'bg-accent-soft text-accent')} onClick={()=>patchState({viewport:width})}><Icon size={13}/></Button>)}</div>}{web&&context.surface!=='code'&&<ViewportControls/>}<div className="flex shrink-0 items-center" style={{visibility:zoom?'visible':'hidden'}}><Button size="tiny" aria-label={t('status.zoomOut')} onClick={()=>void executeCommand('zoom.out')}><Minus size={12}/></Button><span className="w-9 text-center" aria-label={t('status.zoom')}>{state.zoom}%</span><Button size="tiny" aria-label={t('status.zoomIn')} onClick={()=>void executeCommand('zoom.in')}><Plus size={12}/></Button></div></>;}
