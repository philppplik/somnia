import type {GitBackend, GitRepoState, GitRestoreResult, GitVersion} from '../types';
import type {Revision} from '../../fileAdapter';
import type {RecoveryBackend, RecoveryEntry, RecoveryRestoreResult} from './recovery';
export type TimelineEntry =
 | {id: string; kind: 'version'; timeMs: number; version: GitVersion; safety?: boolean}
 | {id: string; kind: 'recovery' | 'safety'; timeMs: number | null; recovery: RecoveryEntry};
export function mergeTimeline(versions: GitVersion[], recoveries: RecoveryEntry[]): TimelineEntry[] {
 const entries: TimelineEntry[] = versions.map(version => ({id: `git:${version.sha}`, kind: 'version', timeMs: version.time * 1000, version}));
 entries.push(...recoveries.map(recovery => ({id: `local:${recovery.id}`, kind: recovery.kind,
  timeMs: typeof recovery.record.updatedAtMs === 'number' && Number.isFinite(recovery.record.updatedAtMs) ? recovery.record.updatedAtMs : null, recovery})));
 return [...new Map(entries.map(e => [e.id, e])).values()].sort((a, b) => (b.timeMs ?? -Infinity) - (a.timeMs ?? -Infinity) || a.id.localeCompare(b.id));
}
export interface HistoryPage {entries: TimelineEntry[]; repo: GitRepoState; moreBefore?: string; warnings: string[]}
export type RestoreReview = {entry: TimelineEntry} & ({kind: 'version'; stateToken: string} | {kind: 'recovery'; disk: Revision});
export type RestoreOutcome = {kind: 'version'; result: GitRestoreResult} | {kind: 'recovery'; result: RecoveryRestoreResult};
function ready(repo: GitRepoState): void {
 if (repo.kind !== 'ready') throw Error(`Git is not ready (${repo.kind}${repo.kind === 'blocked' ? `: ${repo.reason}` : ''}).`);
 if (repo.repo.hasLfs || repo.repo.hasSubmodules) throw Error('Restoring LFS or submodule projects is not supported.');
}
/** Independent backend failures never silently turn into "empty history". */
export class HistoryController {
 private restoring = false;
 private safetyCopies = new Map<string, GitVersion>();
 constructor(private git: GitBackend, private recovery: RecoveryBackend, private hasUnsavedBuffers: () => boolean) {}
 async load(before?: string): Promise<HistoryPage> {
  const repo = await this.git.detect();
  const warnings: string[] = [];
  let versions: GitVersion[] = [], snapshots: RecoveryEntry[] = [];
  await Promise.all([
   repo.kind === 'ready' ? this.git.log({limit: 50, before}).then(v => {versions = v;}).catch(e => {warnings.push(String(e));}) : Promise.resolve(),
   this.recovery.list().then(r => {snapshots = r;}).catch(e => {warnings.push(String(e));}),
  ]);
  return {entries: mergeTimeline([...versions, ...this.safetyCopies.values()], snapshots).map(e => e.kind === 'version' && this.safetyCopies.has(e.version.sha) ? {...e, safety: true} : e), repo, warnings, moreBefore: versions.length === 50 ? versions.at(-1)?.sha : undefined};
 }
 async review(entry: TimelineEntry): Promise<RestoreReview> {
  if (this.hasUnsavedBuffers()) throw Error('Save unsaved editor changes before reviewing a restore.');
  if (entry.kind === 'version') {
   ready(await this.git.detect());
   const status = await this.git.status();
   if (status.truncated || status.changes.some(c => c.kind === 'conflicted')) throw Error('Resolve conflicts or the truncated change list before restoring.');
   return {kind: 'version', entry, stateToken: status.stateToken};
  }
  return {kind: 'recovery', entry, disk: await this.recovery.review(entry.recovery)};
 }
 async restore(review: RestoreReview): Promise<RestoreOutcome> {
  if (this.restoring) throw Error('A restore is already running.');
  if (this.hasUnsavedBuffers()) throw Error('Editor changes appeared. Save and review again.');
  this.restoring = true;
  try {
   if (review.kind === 'version' && review.entry.kind === 'version') {
    ready(await this.git.detect());
    const result = await this.git.restoreAsNewVersion({sha: review.entry.version.sha, stateToken: review.stateToken});
    if (result.safetyCopy) this.safetyCopies.set(result.safetyCopy.sha, result.safetyCopy);
    return {kind: 'version', result};
   }
   if (review.kind === 'recovery' && review.entry.kind !== 'version') {
    return {kind: 'recovery', result: await this.recovery.restore(review.entry.recovery, review.disk)};
   }
   throw Error('Invalid restore review.');
  } finally {this.restoring = false;}
 }
}
