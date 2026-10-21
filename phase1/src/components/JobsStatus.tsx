import {useState,useSyncExternalStore} from 'react';
import {jobScheduler} from '../lib/jobs/scheduler';
import {useT} from '../lib/useT';
import {NativeButton} from './ui/native-controls';
/** Global progress survives studio/panel unmount. Do not show filenames or prompts. */
export function JobsStatus(){
 const {t}=useT();const records=useSyncExternalStore(jobScheduler.subscribe,jobScheduler.list,jobScheduler.list);
 const live=records.filter(r=>r.state==='running'||r.state==='queued');const [open,setOpen]=useState(false);
 if(!live.length)return null;
 return <div className="relative text-xs text-ink" data-testid="global-jobs">
  <NativeButton type="button" className="rounded px-2 py-1 hover:bg-hover" aria-expanded={open} onClick={()=>setOpen(!open)}>Jobs ({live.length})</NativeButton>
  {open&&<section aria-label="Background jobs" className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border border-subtle bg-panel text-ink p-3 shadow-card">
   {live.map(job=><div key={job.id} className="mb-2 flex items-center gap-2">
    <span className="flex-1 capitalize">{job.kind} ({job.state})</span>
    {job.progress!==null&&<progress className="w-14" max={1} value={job.progress} aria-label={`${job.kind} progress`}/>}
    {job.cancellable&&<NativeButton type="button" className="rounded px-2 py-1 hover:bg-hover" onClick={()=>jobScheduler.cancel(job.id)} aria-label={`Cancel ${job.kind}`}>{t('dialogs.cancel')}</NativeButton>}
   </div>)}
  </section>}
 </div>;
}
