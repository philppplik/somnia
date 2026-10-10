import type {GitBackend, GitRestoreResult} from '../types';
import type {GitRefsBackend, GitSafetyEntry, GitDiffRefsResult} from './contract';
import {isObjectId} from './contract';
export type SafetyErrorCode = 'unsaved' | 'not-ready' | 'unsupported' | 'conflicts' | 'changed' | 'busy';
export class SafetyError extends Error { constructor(public code: SafetyErrorCode) { super(code); } }
export interface SafetyReview { entry: GitSafetyEntry; stateToken: string; head: string; changedFiles: number | null }
const PREFIX = 'refs/somnia/safety/';
/** Only well-formed persisted safety refs are shown; anything else the host returns is dropped. */
export function cleanSafetyList(list: readonly GitSafetyEntry[]): GitSafetyEntry[] {
  const seen = new Set<string>();
  return list.filter(e => e.ref.startsWith(PREFIX) && !e.ref.includes('..') && isObjectId(e.sha) && Number.isFinite(e.time) && !seen.has(e.ref) && seen.add(e.ref))
    .sort((a, b) => b.time - a.time || a.ref.localeCompare(b.ref));
}
/**
 * Safety browser logic. Restore stays a new version (git.restoreAsNewVersion makes its own safety copy first),
 * and unsaved editor buffers block both review and apply. A review is bound to the entry's sha and the
 * repository state token, so a moved ref or changed project forces a new review.
 */
export class SafetyController {
  private restoring = false;
  constructor(private git: GitBackend, private refs: GitRefsBackend, private hasUnsavedBuffers: () => boolean) {}
  async list(): Promise<GitSafetyEntry[]> { return cleanSafetyList(await this.refs.safetyList()); }
  async review(entry: GitSafetyEntry): Promise<SafetyReview> {
    if (this.hasUnsavedBuffers()) throw new SafetyError('unsaved');
    const repo = await this.git.detect();
    if (repo.kind !== 'ready') throw new SafetyError('not-ready');
    if (repo.repo.hasLfs || repo.repo.hasSubmodules) throw new SafetyError('unsupported');
    const status = await this.git.status();
    if (status.truncated || status.changes.some(c => c.kind === 'conflicted')) throw new SafetyError('conflicts');
    await this.assertCurrent(entry);
    let changedFiles: number | null = null;
    try { const d: GitDiffRefsResult = await this.refs.diffRefs({from: 'HEAD', to: entry.sha}); changedFiles = d.truncated ? null : d.files.length; } catch { /* preview is optional */ }
    return {entry, stateToken: status.stateToken, head: repo.repo.head ?? '', changedFiles};
  }
  async restore(review: SafetyReview): Promise<GitRestoreResult> {
    if (this.restoring) throw new SafetyError('busy');
    if (this.hasUnsavedBuffers()) throw new SafetyError('unsaved');
    this.restoring = true;
    try {
      await this.assertCurrent(review.entry);
      return await this.git.restoreAsNewVersion({sha: review.entry.sha, stateToken: review.stateToken});
    } finally { this.restoring = false; }
  }
  private async assertCurrent(entry: GitSafetyEntry) {
    const now = (await this.list()).find(e => e.ref === entry.ref);
    if (!now || now.sha !== entry.sha) throw new SafetyError('changed');
  }
}
