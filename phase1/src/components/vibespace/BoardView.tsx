import {BudgetPanel} from './BudgetPanel';
import {RunHistoryFilters} from './RunQuality';
import {emptyRunFilter,filterRunHistory} from '../../lib/vibespace/runQuality';
import {useState} from 'react';
import {Send,Square} from '../../lib/icons';
import {getLocale,t} from '../../lib/i18n';
import {studioControls,studioState} from '../../lib/vibespace/state';
import {aggregateCostLabel,aggregateUsage,boardProjection,BOARD_COLUMNS,scheduleConflicts,type ScheduleConflict,type UsageAggregate} from '../../lib/vibespace/board';
import type {Schedule} from '../../lib/vibespace/schedule';
import type {Space,Studio,VibeIntent,VibeSnapshot} from '../../lib/vibespace/types';
import {StudioScheduleButton} from './StudioScheduleButton';
import {StudioMetrics} from './StudioDetail';
import {NativeButton,NativeInput} from '../ui/native-controls';

/**
 * A8 multi-agent board: read/steer UX over several parallel isolated runs of one
 * space. Every control sends a VibeIntent to the caller's single controller (the
 * A1 runtime owner); this component opens no execution path of its own. Reviews,
 * consent details and apply stay in StudioDetail. Nothing here merges anything.
 */
export function BoardView({space,snapshot,schedules,schedulesError=false,pending,capabilities,mode,onAction,onOpenRun,nowMs=Date.now()}:{
 space:Space;
 snapshot:VibeSnapshot;
 /** null: not loaded / not available in this mode; strip hidden. */
 schedules:Schedule[]|null;
 schedulesError?:boolean;
 pending:boolean;
 capabilities:readonly VibeIntent['type'][];
 mode:'native'|'fixture';
 onAction:(intent:VibeIntent)=>Promise<boolean>;
 onOpenRun:(runId:string)=>void;
 nowMs?:number;
}){
 const [filter,setFilter]=useState({...emptyRunFilter});
 const filtered=filterRunHistory(snapshot.studios,filter);const filtering=!!(filter.status||filter.model||filter.from||filter.to);
 const projection=boardProjection({...snapshot,studios:filtered,sessions:filtering?[]:snapshot.sessions},space.spaceId);const totals=boardProjection(snapshot,space.spaceId);
 const runs=snapshot.studios.filter(s=>s.spaceId===space.spaceId);
 const usage=aggregateUsage(runs);
 const conflicts=scheduleConflicts(schedules??[],runs,nowMs);
 const goalOf=(studioId:string)=>snapshot.sessions.find(s=>s.studioId===studioId)?.goal.split('\n')[0].slice(0,80)??studioId;
 return <div className="vs-boardview" aria-label={t('vs.board.aria')}>
  <BoardSummary total={totals.concurrency.total} active={totals.concurrency.active} needsYou={totals.concurrency.needsYou} usage={usage}/>
  {mode==='native'&&<BudgetPanel spaceId={space.spaceId}/>}
  <RunHistoryFilters runs={runs} value={filter} onChange={setFilter}/>{filtering&&!filtered.some(r=>r.spaceId===space.spaceId)&&<p role="status">{t('vs.quality.empty')}</p>}
  {schedulesError&&<p className="vs-muted" role="status">{t('vs.board.schedule.unavailable')}</p>}
  {schedules&&schedules.length>0&&<ScheduleStrip schedules={schedules} conflicts={conflicts} goalOf={goalOf}/>}
  <div className="vs-board-cols">
   {BOARD_COLUMNS.map(column=>{
    const columnRuns=projection.columns[column];
    const drafts=column==='draft'?projection.drafts:[];
    if(!columnRuns.length&&!drafts.length)return null;
    return <section className="vs-col" key={column} aria-label={t(`vs.board.col.${column==='needs-you'?'needsYou':column}`)}>
     <h3>{t(`vs.board.col.${column==='needs-you'?'needsYou':column}`)} <span>{columnRuns.length+drafts.length}</span></h3>
     {drafts.map(session=><section className="vs-card" key={session.studioId}>
      <p className="vs-eyebrow">Draft Studio</p>
      <h3>{session.goal.split('\n')[0].slice(0,100)}</h3>
      <p>{session.model.provider} / {session.model.model}</p>
      <p className="vs-muted">No run yet. Starting creates an isolated copy and checkpoint before work begins.</p>
      <NativeButton type="button" className="vs-primary" disabled={pending||!session.canStart||!capabilities.includes('start')} onClick={()=>void onAction({type:'start',studioId:session.studioId})}>Start Studio</NativeButton>
      {mode==='native'&&<StudioScheduleButton studioId={session.studioId} disabled={pending}/>}
     </section>)}
     {columnRuns.map(studio=><RunCard key={studio.runId} studio={studio} pending={pending} capabilities={capabilities} onAction={onAction} onOpenRun={onOpenRun}/>)}
    </section>;
   })}
  </div>
 </div>;
}

function BoardSummary({total,active,needsYou,usage}:{total:number;active:number;needsYou:number;usage:UsageAggregate}){
 return <div className="vs-board-summary">
  <span className="vs-badge">{t('vs.board.summary',{count:total})}</span>
  {active>0&&<span className="vs-badge" data-state="running">{t('vs.board.active',{count:active})}</span>}
  {needsYou>0&&<span className="vs-badge" data-state="needs-you">{t('vs.board.needsYou',{count:needsYou})}</span>}
  <details className="vs-usage">
   <summary>{t('vs.board.usage.title')}</summary>
   {usage.runsWithUsage===0?<p className="vs-muted">{t('vs.board.usage.none')}</p>:<>
    {(usage.runsWithoutUsage>0||usage.partialCost)&&<p className="vs-muted" role="status">{t('vs.board.usage.partial',{reported:usage.runsWithUsage,total:usage.runsWithUsage+usage.runsWithoutUsage})}</p>}
    <dl>
     <dt>{t('vs.board.usage.input')}</dt><dd>{usage.inputTokens===null?t('vs.board.usage.notReported'):usage.inputTokens.toLocaleString(getLocale())}</dd>
     <dt>{t('vs.board.usage.output')}</dt><dd>{usage.outputTokens===null?t('vs.board.usage.notReported'):usage.outputTokens.toLocaleString(getLocale())}</dd>
     <dt>{t('vs.board.usage.cacheRead')}</dt><dd>{usage.cacheReadTokens===null?t('vs.board.usage.notReported'):usage.cacheReadTokens.toLocaleString(getLocale())}</dd>
     <dt>{t('vs.board.usage.cacheWrite')}</dt><dd>{usage.cacheWriteTokens===null?t('vs.board.usage.notReported'):usage.cacheWriteTokens.toLocaleString(getLocale())}</dd>
     <dt>{t('vs.board.usage.cost')}</dt><dd>{usage.costUsd===null||usage.costUsd<=0?t('vs.board.usage.notReported'):aggregateCostLabel(usage.costUsd)}</dd>
    </dl>
   </>}
  </details>
 </div>;
}

function ScheduleStrip({schedules,conflicts,goalOf}:{schedules:Schedule[];conflicts:ScheduleConflict[];goalOf:(studioId:string)=>string}){
 return <section className="vs-sched-strip" aria-label={t('vs.board.schedule.title')}>
  <h3>{t('vs.board.schedule.title')}</h3>
  <ul>{schedules.map(schedule=>{
   const conflict=conflicts.find(c=>c.scheduleIds.includes(schedule.id));
   return <li className="vs-sched-item" key={schedule.id} data-conflict={conflict?.kind}>
    <strong>{schedule.spec.name||schedule.id}</strong>
    <span className="vs-muted">{goalOf(schedule.spec.studioId)}</span>
    <span>{t('vs.board.schedule.next')}: <time dateTime={new Date(schedule.nextRunMs).toISOString()}>{new Date(schedule.nextRunMs).toLocaleString(getLocale())}</time></span>
    {!schedule.enabled&&<span className="vs-badge">{t('vs.board.schedule.disabled')}</span>}
    {conflict&&<span className="vs-conflict" role="status">{t(conflict.kind==='same-slot'?'vs.board.schedule.conflictSameSlot':'vs.board.schedule.conflictActive')}</span>}
   </li>;
  })}</ul>
 </section>;
}

function RunCard({studio,pending,capabilities,onAction,onOpenRun}:{studio:Studio;pending:boolean;capabilities:readonly VibeIntent['type'][];onAction:(intent:VibeIntent)=>Promise<boolean>;onOpenRun:(runId:string)=>void}){
 const state=studioState(studio);
 const controls=studioControls(studio,pending);
 const [steerOpen,setSteerOpen]=useState(false);
 const [message,setMessage]=useState('');
 const review=studio.review;
 const active=['running','claimed','paused'].includes(studio.executionState);
 return <article className="vs-run-card" data-state={state}>
  <NativeButton type="button" className="vs-run-open" onClick={()=>onOpenRun(studio.runId)}>
   <strong>{studio.goal.split('\n')[0].slice(0,100)}</strong>
   <StudioMetrics studio={studio}/>
   <span className="vs-last-step">{studio.failure?.message||studio.pendingConsents[0]?.reason||studio.lastStep||'No step recorded yet.'}</span>
   {review&&<span className="vs-run-review">{t('vs.board.files',{count:review.files.length})}{review.conflicts.length>0&&<> · <span className="vs-conflict">{t('vs.board.conflict',{count:review.conflicts.length})}</span></>}</span>}
  </NativeButton>
  {active&&<div className="vs-run-controls">
   <NativeButton type="button" disabled={!controls.stop||!capabilities.includes('stop')} onClick={()=>void onAction({type:'stop',runId:studio.runId})}><Square size={13}/>{t('vs.board.stop')}</NativeButton>
   <NativeButton type="button" aria-pressed={steerOpen} disabled={!controls.steer||!capabilities.includes('steer')} onClick={()=>setSteerOpen(open=>!open)}>{t('vs.board.steer.toggle')}</NativeButton>
  </div>}
  {active&&steerOpen&&<form className="vs-steer-inline" aria-label={`${t('vs.board.steer.toggle')}: ${studio.goal.split('\n')[0].slice(0,60)}`} onSubmit={event=>{
   event.preventDefault();
   const text=message.trim();
   if(!text||!controls.steer||!capabilities.includes('steer'))return;
   void onAction({type:'steer',runId:studio.runId,message:text}).then(ok=>{if(ok){setMessage('');setSteerOpen(false);}});
  }}>
   <label>{t('vs.board.steer.toggle')}<NativeInput value={message} maxLength={8192} disabled={!controls.steer} placeholder={t('vs.board.steer.placeholder')} onChange={event=>setMessage(event.target.value)}/></label>
   <div className="vs-actions"><NativeButton type="submit" disabled={!controls.steer||!message.trim()}><Send size={13}/>{t('vs.board.steer.send')}</NativeButton></div>
  </form>}
 </article>;
}
