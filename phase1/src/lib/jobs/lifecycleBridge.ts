import {jobScheduler,type JobRecord,type JobScheduler} from './scheduler';
import type {StudioLifecycleManager} from '../lifecycle/manager';
/** Translate job-owned dependencies without pretending the entire studio view must remain mounted. */
export function jobNeedsStudio(records:readonly JobRecord[],studioId:string){
 return records.some(r=>(r.state==='running'||r.state==='queued')&&(
  r.resources.includes(`studio:${studioId}`)||
  r.resources.some(id=>id.startsWith(`${studioId}.`)||id.startsWith(`${studioId}:`))));
}
export function wireJobLeases(manager:Pick<StudioLifecycleManager,'registerJobLeaseProvider'>,scheduler:JobScheduler=jobScheduler){
 return manager.registerJobLeaseProvider(id=>{
  if(scheduler.needsResource(id))return true;
  return id.startsWith('studio:')&&jobNeedsStudio(scheduler.list(),id.slice('studio:'.length));
 });
}
