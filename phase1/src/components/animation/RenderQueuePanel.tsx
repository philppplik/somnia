import {useState} from 'react';
import {useT} from '../../lib/useT';
import {NativeSelect} from '../ui/native-controls';
import {Button} from '../ui/button';
import {executeCommand} from '../../lib/commands';
import {useQueueState} from '../../lib/animation/renderQueueRun';
import {queueSummary,MAX_QUEUE} from '../../lib/animation/renderQueue';
import {EXPORT_FORMATS,type ExportFormat} from '../../lib/animation/exportSettings';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Render queue: capture the current export setup as jobs, then render them one after another. Session state, no undo step. */
export function RenderQueuePanel({busy}:{busy:boolean}){
 const {t}=useT();const q=useQueueState();const [format,setFormat]=useState<ExportFormat>('gif');const [err,setErr]=useState('');
 const go=async(id:string,params?:unknown)=>{setErr('');try{await executeCommand(id,params);}catch(e){setErr((e as Error).message);}};
 const sum=queueSummary(q.jobs);const off=busy&&!q.running;
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" data-testid="animation-render-queue"><legend className="text-ink-3">{t('animation.queue.title')}</legend>
  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
   <label className="grid gap-1 text-ink-3">{t('animation.queue.format')}<NativeSelect className={field} value={format} disabled={q.running} onChange={e=>setFormat(e.target.value as ExportFormat)} data-testid="animation-queue-format">
    {EXPORT_FORMATS.map(f=><option key={f} value={f}>{t(`animation.export.kind.${f}`)}</option>)}</NativeSelect></label>
   <Button size="compact" variant="outline" disabled={off||q.running||q.jobs.length>=MAX_QUEUE} onClick={()=>void go('animation.export.queue.add',{format})} data-testid="animation-queue-add">{t('animation.queue.add')}</Button>
  </div>
  {q.jobs.length>0&&<ul className="m-0 grid list-none gap-1 p-0 text-ink-2" aria-label={t('animation.queue.title')} data-testid="animation-queue-list">
   {q.jobs.map(j=><li key={j.id} className="flex items-center justify-between gap-2" data-status={j.status} data-testid={`animation-queue-job-${j.id}`}>
    <span className={j.status==='error'?'min-w-0 text-danger':'min-w-0'}>{j.compName} - {t(`animation.export.kind.${j.format}`)} {j.settings.scale}% - {t(`animation.queue.status.${j.status}`)}{j.message?`: ${j.message}`:''}</span>
    <Button size="tiny" variant="ghost" disabled={j.status==='running'} onClick={()=>void go('animation.export.queue.remove',{id:j.id})} aria-label={t('animation.queue.remove')}>{t('animation.queue.removeShort')}</Button></li>)}
  </ul>}
  {q.jobs.length>0&&<p className="m-0 text-ink-3" data-testid="animation-queue-summary">{t('animation.queue.summary',sum)}</p>}
  <div className="flex flex-wrap gap-1">
   <Button size="compact" variant="outline" disabled={off||q.running||!q.jobs.some(j=>j.status!=='done')} onClick={()=>void go('animation.export.queue.run')} data-testid="animation-queue-run">{t('animation.queue.run')}</Button>
   <Button size="compact" variant="outline" disabled={!q.running} onClick={()=>void go('animation.export.queue.cancel')} data-testid="animation-queue-cancel">{t('animation.queue.cancel')}</Button>
   <Button size="tiny" variant="ghost" disabled={q.running||!q.jobs.some(j=>j.status==='done'||j.status==='error'||j.status==='cancelled')} onClick={()=>void go('animation.export.queue.clear')} data-testid="animation-queue-clear">{t('animation.queue.clear')}</Button>
  </div>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
