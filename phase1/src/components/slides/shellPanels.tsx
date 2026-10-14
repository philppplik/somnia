import {SlidesDirectJump} from './SlidesDirectJump';
import {SlidesTextSearch} from './SlidesTextSearch';
import {getSlidesSessionState} from '../../lib/slides/session';
import {captureCurrentSlideSummary} from '../../lib/slides/currentSummarySelection';
import {SlidesSelectionPreview} from './SlidesSelectionPreview';
import {useState} from 'react';
import {ArrowDown,ArrowUp} from 'lucide-react';
import {IconButton} from '../ui/icon-button';
import {Button} from '../ui/button';
import {Menu,MenuTrigger,MenuContent,MenuItem} from '../ui/menu';
import type {InspectorSectionProps} from '../../lib/shell/types';
import {useSlidesSession} from '../../lib/slides/session';
import {useSlidesPanelText} from '../../lib/slides/panelI18n';
import {deckMetrics,selectedRun,slideOutline,textIssue} from '../../lib/slides/panelModel';
import {useSlideTextSelection} from '../../lib/slides/panelSelection';
import {usePanelState} from '../../store/panelStateStore';
import {commandDispatcher} from '../../lib/commandDispatcher';
import type {TextRun} from '../../lib/slides/editCopy';

const button='rounded-lg border border-subtle bg-hover px-2 py-1.5 text-xs text-ink disabled:opacity-40 focus-visible:outline-accent';
const input='w-full min-w-0 rounded-lg border border-subtle bg-panel p-2 text-sm text-ink focus-visible:outline-accent';
function useAction(){const [error,setError]=useState('');return {error,setError,run:async(id:string,params?:unknown)=>{setError('');const result=await commandDispatcher.tryRunCommand(id,params,{origin:'ui'});if(!result.ok)setError(result.error.message);}};}
function Notice({error}:{error:string}){return error?<p role="alert" className="break-words rounded-lg bg-hover p-2 text-xs text-red-600">{error}</p>:null;}
function Empty(){const t=useSlidesPanelText();return <p className="p-3 text-xs text-ink-3">{t('slides.empty')}</p>;}
function Region({children}:{children:React.ReactNode}){return <section className="flex min-w-0 flex-col gap-3 p-3 text-ink">{children}</section>;}

export function SlidesOverviewPanel(){
 const s=useSlidesSession(),t=useSlidesPanelText(),action=useAction();
 const [status,setStatus]=useState('');const [query,setQuery]=usePanelState('slides.overview.filter','');const [compact,setCompact]=usePanelState('slides.overview.compact',false);
 if(!s.summary)return <Empty/>;
 const rows=slideOutline(s.runs,s.summary.slides,query);
 const canMove=!query.trim()&&s.slideIds.length>1&&s.slideIds.length===s.summary.slides;
 const currentId=s.slideIds[s.index];
 const structure=async(id:string,params:unknown,done:string)=>{setStatus('');const result=await commandDispatcher.tryRunCommand(id,params,{origin:'ui'});if(!result.ok)action.setError(result.error.message);else setStatus(done);};
 const move=async(from:number,to:number)=>{setStatus('');const id=s.slideIds[from];const result=await commandDispatcher.tryRunCommand('slides.moveSlide',{source:s.source,slideId:id,toIndex:to},{origin:'ui'});if(!result.ok)action.setError(result.error.message);else setStatus(t('slides.moved',{number:from+1,position:to+1}));};
 return <Region><p className="truncate text-xs text-ink-2" title={s.name}>{s.name}</p>
  <SlidesDirectJump key={s.source} source={s.source} index={s.index} total={s.summary.slides} busy={s.busy} current={getSlidesSessionState} navigate={async index=>{const result=await commandDispatcher.tryRunCommand('slides.showSlide',{index},{origin:'ui'});if(!result.ok)throw Error(result.error.message);const after=getSlidesSessionState();if(after.source!==s.source||after.index!==index||after.busy)throw Error('Slide navigation changed');}}/><div className="flex flex-wrap gap-1"><button className={button} disabled={s.busy||s.index===0} onClick={()=>void action.run('slides.showSlide',{index:s.index-1})}>{t('slides.previous')}</button><button className={button} disabled={s.busy||s.index>=s.summary.slides-1} onClick={()=>void action.run('slides.showSlide',{index:s.index+1})}>{t('slides.next')}</button></div>
  <div className="flex flex-wrap gap-1" role="group" aria-label={t('slides.panel.overview')}>
   <Menu><MenuTrigger render={<Button size="compact" variant="outline" disabled={s.busy||!s.layouts.some(l=>l.supported)||!s.slideIds.length}>{t('slides.newFromLayout')}</Button>}/><MenuContent>{s.layouts.map(l=><MenuItem key={l.part} disabled={!l.supported} onClick={()=>void structure('slides.newSlide',{source:s.source,layoutPart:l.part,afterSlideId:currentId},t('slides.added',{position:s.index+2}))}>{l.supported?l.name:t('slides.layoutUnsupported',{name:l.name})}</MenuItem>)}</MenuContent></Menu>
   <Button size="compact" variant="outline" disabled={s.busy||currentId===undefined} onClick={()=>void structure('slides.duplicateSlide',{source:s.source,slideId:currentId},t('slides.duplicated',{number:s.index+1}))}>{t('slides.duplicate')}</Button>
   <Button size="compact" variant="outline" disabled={s.busy||currentId===undefined||s.slideIds.length<2} onClick={()=>void structure('slides.deleteSlide',{source:s.source,slideId:currentId},t('slides.deleted',{number:s.index+1}))}>{t('slides.delete')}</Button>
  </div>
  <input className={input} aria-label={t('slides.search')} placeholder={t('slides.search')} value={query} onChange={e=>setQuery(e.target.value)}/>
  <label className="flex items-center gap-2 text-xs"><input className="!w-4 shrink-0" type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)}/>{t('slides.compact')}</label>
  <button className={button} disabled={s.busy} onClick={()=>void action.run('slides.loadThumbnails')}>{t('cmd.slides.loadThumbnails')}</button>
  <nav aria-label={t('slides.panel.overview')} className="flex flex-col gap-2">{rows.map(row=>{
   const id=s.slideIds[row.index],last=s.summary!.slides-1;
   return <div key={id??`i${row.index}`} className="flex items-stretch gap-1" draggable={canMove} onDragStart={e=>{if(canMove){e.dataTransfer.setData('text/plain',String(row.index));e.dataTransfer.effectAllowed='move';}}} onDragOver={e=>{if(canMove)e.preventDefault();}} onDrop={e=>{if(!canMove)return;e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&s.slideIds[from]!==undefined&&from!==row.index)void move(from,row.index);}}>
   <button className={`${button} min-w-0 flex-1 text-left ${row.index===s.index?'border-accent bg-accent-soft':''}`} aria-current={row.index===s.index?'page':undefined} disabled={s.busy} onClick={()=>void action.run('slides.showSlide',{index:row.index})} onKeyDown={e=>{if(canMove&&e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();const to=row.index+(e.key==='ArrowUp'?-1:1);if(to>=0&&to<=last)void move(row.index,to);}}}>
    {!compact&&s.thumbnails[row.index]&&<img src={s.thumbnails[row.index]} alt="" loading="lazy" className="mb-2 aspect-video w-full object-contain"/>}<span className="block text-xs font-medium">{t('slides.slide',{number:row.index+1})}</span><span className="block truncate text-xs text-ink-2">{row.title}</span>
   </button>
   {canMove&&<div className="flex shrink-0 flex-col justify-center gap-1"><IconButton size="row" variant="outline" aria-label={`${t('slides.moveEarlier')} (${t('slides.slide',{number:row.index+1})})`} disabled={s.busy||row.index===0} onClick={()=>void move(row.index,row.index-1)}><ArrowUp aria-hidden/></IconButton><IconButton size="row" variant="outline" aria-label={`${t('slides.moveLater')} (${t('slides.slide',{number:row.index+1})})`} disabled={s.busy||row.index===last} onClick={()=>void move(row.index,row.index+1)}><ArrowDown aria-hidden/></IconButton></div>}
   </div>;})}</nav>{!rows.length&&<p className="text-xs text-ink-3">{t('slides.noMatches')}</p>}<p role="status" aria-live="polite" className="text-xs text-ink-2">{status}</p>{!canMove&&query.trim()&&s.slideIds.length>1&&<p className="text-xs text-ink-3">{t('slides.reorderFiltered')}</p>}{!s.slideIds.length&&<p className="text-xs text-ink-3">{t('slides.reorderUnavailable')}</p>}<Notice error={action.error}/></Region>;
}
export function SlidesOutlinePanel(){
 const s=useSlidesSession(),t=useSlidesPanelText(),action=useAction();const [query,setQuery]=usePanelState('slides.outline.filter','');
 if(!s.summary)return <Empty/>;
 const rows=slideOutline(s.runs,s.summary.slides,query);
 return <Region><SlidesTextSearch key={s.source} source={s.source} runs={s.runs} busy={s.busy} current={getSlidesSessionState} navigate={async params=>{const result=await commandDispatcher.tryRunCommand('slides.selectText',params,{origin:'ui'});if(!result.ok)throw Error(result.error.message);}}/><input className={input} aria-label={t('slides.search')} placeholder={t('slides.search')} value={query} onChange={e=>setQuery(e.target.value)}/>
  {rows.map(row=><section key={row.index} className="min-w-0"><button className={`${button} mb-2 w-full text-left`} disabled={s.busy} onClick={()=>void action.run('slides.showSlide',{index:row.index})}>{t('slides.slide',{number:row.index+1})}</button>
   <ul className="flex flex-col gap-1">{row.texts.map(run=><li key={run.run}><button className="w-full rounded p-2 text-left text-xs hover:bg-hover focus-visible:outline-accent" disabled={s.busy} onClick={()=>void action.run('slides.selectText',{source:s.source,slide:run.slide,run:run.run,old:run.text})}><span className="block whitespace-pre-wrap break-words line-clamp-4">{run.text||t('slides.run',{number:run.run+1})}</span></button></li>)}</ul>
  </section>)}{!rows.length&&<p className="text-xs text-ink-3">{t('slides.noMatches')}</p>}<Notice error={action.error}/></Region>;
}
function TextEditor({run,source,busy}:{run:TextRun;source:string;busy:boolean}){
 const t=useSlidesPanelText(),action=useAction();const [text,setText]=useState(run.text);const issue=textIssue(text),bytes=new TextEncoder().encode(text).length;
 return <form className="flex flex-col gap-2 rounded-lg border border-subtle p-2" onSubmit={e=>{e.preventDefault();void action.run('slides.editText',{source,slide:run.slide,run:run.run,old:run.text,text});}}>
  <label className="text-xs">{t('slides.run',{number:run.run+1})}<textarea className={`${input} mt-2 min-h-28 select-text`} value={text} onChange={e=>setText(e.target.value)} disabled={busy} aria-invalid={!!issue}/></label>
  <p className="text-xs text-ink-3">{t('slides.bytes',{count:bytes})}</p>{issue&&<p role="alert" className="text-xs text-red-600">{t(`slides.${issue}`)}</p>}
  <div className="flex flex-wrap gap-2"><button className={button} type="submit" disabled={busy||!!issue||text===run.text}>{t('cmd.slides.editText')}</button><button className={button} type="button" disabled={busy||text===run.text} onClick={()=>setText(run.text)}>{t('slides.reset')}</button></div><Notice error={action.error}/>
 </form>;
}
export function SlidesTextPanel({context}:InspectorSectionProps){
 const s=useSlidesSession(),t=useSlidesPanelText(),action=useAction();const selection=useSlideTextSelection();
 if(!s.summary)return <Empty/>;
 const runs=s.runs.filter(r=>r.slide===s.index),selected=selectedRun(s,selection);let summarySelection=null;try{summarySelection=captureCurrentSlideSummary();}catch{}
 // Explicit canvas selection wins; source-bound UI selection is only a fallback.
 const contextId=context.selection.type==='textRun'?context.selection.ids?.[0]:undefined;
 const active=runs.find(r=>`${r.slide}:${r.run}`===contextId)??selected??runs[0];
 return <Region><SlidesSelectionPreview snapshot={summarySelection} scope={JSON.stringify([s.source,s.index,s.runs,s.dirty,summarySelection])} run={s.diagnostics?.editable?selected??null:null} busy={s.busy}/><p className="text-xs text-ink-2">{t('slides.slide',{number:s.index+1})}</p>
  <div className="flex flex-wrap gap-1"><button className={button} disabled={s.busy||!s.undo.length} onClick={()=>void action.run('slides.undo')}>{t('cmd.slides.undo')}</button><button className={button} disabled={s.busy||!s.redo.length} onClick={()=>void action.run('slides.redo')}>{t('cmd.slides.redo')}</button></div>
  {!!runs.length&&<select className={input} aria-label={t('slides.panel.text')} value={active?.run??''} disabled={s.busy} onChange={e=>{const r=runs.find(r=>r.run===Number(e.target.value));if(r)void action.run('slides.selectText',{source:s.source,slide:r.slide,run:r.run,old:r.text});}}>{runs.map(r=><option key={r.run} value={r.run}>{t('slides.run',{number:r.run+1})}: {r.text.slice(0,60)}</option>)}</select>}
  {active?<TextEditor key={`${s.source}:${active.slide}:${active.run}:${active.text}`} source={s.source} run={active} busy={s.busy}/>:<><p className="text-xs text-ink-3">{t('slides.noText')}</p>{s.texts.map((text,i)=><p key={i} className="select-text whitespace-pre-wrap break-words text-xs">{text}</p>)}</>}
  <p className="text-xs text-ink-3">{t('slides.copyNotice')}</p><button className={button} disabled={s.busy||!s.working} onClick={()=>void action.run('slides.saveCopy')}>{t('cmd.slides.saveCopy')}</button><Notice error={action.error}/></Region>;
}
function Metrics({rows}:{rows:[string,string|number][]}){return <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 text-xs">{rows.map(([label,value])=><div key={label} className="contents"><dt className="text-ink-3">{label}</dt><dd className="break-words text-right tabular-nums">{value}</dd></div>)}</dl>;}
export function SlidesDeckPanel(){const s=useSlidesSession(),t=useSlidesPanelText(),action=useAction();if(!s.summary)return <Empty/>;const m=deckMetrics(s),ratio=s.summary.heightPt?s.summary.widthPt/s.summary.heightPt:0;return <Region>
 <p className="break-words text-sm">{s.name}</p><p role="status" className="text-xs text-ink-2">{t(s.dirty?'slides.unsaved':'slides.original')}</p>
 <Metrics rows={[[t('slides.panel.overview'),m.slides],[t('slides.dimensions'),`${s.summary.widthPt} × ${s.summary.heightPt}`],[t('slides.aspect'),ratio.toFixed(3)],[t('slides.runs'),m.runs],[t('slides.words'),m.words],[t('slides.fileSize'),(m.bytes/1024).toFixed(1)]]}/>
 <button className={button} disabled={s.busy||!s.working} onClick={()=>void action.run('slides.saveCopy')}>{t('cmd.slides.saveCopy')}</button><p className="text-xs text-ink-3">{t('slides.copyNotice')}</p><Notice error={action.error}/></Region>;}
export function SlidesDiagnosticsPanel(){const s=useSlidesSession(),t=useSlidesPanelText();if(!s.summary)return <Empty/>;const d=s.diagnostics;if(!d)return <Region><p className="text-xs text-ink-3">{t('slides.pending')}</p></Region>;return <Region><p className="text-xs font-medium">{t(d.editable?'slides.editable':'slides.previewOnly')}</p>
 <Metrics rows={[[t('slides.producer'),d.producer],[t('slides.entries'),d.entryCount],[t('slides.expanded'),(d.expandedBytes/1048576).toFixed(2)],[t('slides.memory'),(s.wasmBytes/1048576).toFixed(2)]]}/>
 <ul className="flex flex-col gap-2">{d.warnings.map((warning,i)=><li key={i} className="break-words rounded-lg border border-subtle bg-hover p-2 text-xs">{warning}</li>)}</ul>{s.error&&<Notice error={s.error}/>}</Region>;}
export const slidesPanelHosts={'slides.overview':SlidesOverviewPanel,'slides.outline':SlidesOutlinePanel};
export const slidesInspectorHosts={'slides.inspector.text':SlidesTextPanel,'slides.inspector.deck':SlidesDeckPanel,'slides.inspector.diagnostics':SlidesDiagnosticsPanel};
