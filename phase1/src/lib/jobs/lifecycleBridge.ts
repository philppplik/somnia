import { jobScheduler, type JobPressure, type JobRecord, type JobScheduler } from './scheduler';
import type { StudioLifecycleManager } from '../lifecycle/manager';
import type { ResourceBudgetProfile } from '../lifecycle/budgets';

/** Map job-owned dependencies without requiring the whole view to stay mounted. */
export function jobNeedsStudio(records: readonly JobRecord[], studioId: string): boolean {
  return records.some(r => (r.state === 'running' || r.state === 'queued') && (
    r.resources.includes(`studio:${studioId}`) ||
    r.resources.some(id => id.startsWith(`${studioId}.`) || id.startsWith(`${studioId}:`))));
}
export function wireJobLeases(
  manager: Pick<StudioLifecycleManager, 'registerJobLeaseProvider'>,
  scheduler: JobScheduler = jobScheduler,
): () => void {
  return manager.registerJobLeaseProvider(id => {
    if (scheduler.needsResource(id)) return true;
    return id.startsWith('studio:') && jobNeedsStudio(scheduler.list(), id.slice('studio:'.length));
  });
}
/** All lanes share the jobs bucket; heavy jobs use the profile's concurrency. */
export function applyJobBudget(
  profile: ResourceBudgetProfile,
  pressure: JobPressure,
  scheduler: JobScheduler = jobScheduler,
): void {
  scheduler.setAdmission({ maxBytes: profile.buckets.jobs, backgroundConcurrency: profile.heavyJobs, pressure });
}
