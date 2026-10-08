/** In-memory GitVariantsBackend for component and flow tests. Mirrors the Rust error codes, not the git internals. */
import type {
  GitCombinePreview, GitCombineSession, GitConflict, GitConflictResolution, GitError, GitRepoState, GitStatus,
  GitVariant, GitVariantsBackend, GitVersion,
} from './types';

const err = (code: GitError['code'], detail: string): GitError => ({ code, message: detail, detail });
export const version = (sha: string, subject = 'v'): GitVersion => ({ sha, subject, body: '', authorName: 'T', time: 1, parents: [], changedFiles: 1 });
export function variant(name: string, o: Partial<GitVariant> = {}): GitVariant {
  return { name, current: false, tip: `tip-${name}`, subject: 's', time: 1, ahead: 0, behind: 0, merged: true, ...o };
}
export function conflict(path: string, o: Partial<GitConflict> = {}): GitConflict {
  return { path, kind: 'both-modified', binary: false, tooLarge: false, base: 'a\nb\n', yours: 'a\nYOURS\n', theirs: 'a\nTHEIRS\n',
    working: 'a\n<<<<<<< HEAD\nYOURS\n=======\nTHEIRS\n>>>>>>> other\n', yoursBytes: 10, theirsBytes: 11, ...o };
}

export class FakeVariantsBackend implements GitVariantsBackend {
  calls: string[] = [];
  variants: GitVariant[];
  session: GitCombineSession | null = null;
  resolved: GitConflictResolution[] = [];
  finished: GitVersion | null = null;
  startResult: GitCombineSession | null = null;
  failNext: GitError | null = null;
  constructor(variants: GitVariant[] = [variant('main', { current: true })]) { this.variants = variants; }
  private gate(name: string) {
    this.calls.push(name);
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw JSON.stringify(e); }
  }
  async listVariants() { this.gate('list'); return this.variants; }
  async createVariant(req: { name: string; open?: boolean }) {
    this.gate('create');
    if (this.variants.some(v => v.name === req.name)) throw JSON.stringify(err('blocked', 'variant-exists'));
    const v = variant(req.name, { current: !!req.open });
    if (req.open) this.variants = this.variants.map(x => ({ ...x, current: false }));
    this.variants.push(v);
    return v;
  }
  async openVariant(req: { name: string; stateToken: string }): Promise<GitRepoState> {
    this.gate('open');
    this.variants = this.variants.map(x => ({ ...x, current: x.name === req.name }));
    return { kind: 'no-repo', root: 'fake' };
  }
  async renameVariant(req: { from: string; to: string }) {
    this.gate('rename');
    const v = this.variants.find(x => x.name === req.from)!;
    v.name = req.to;
    return v;
  }
  async deleteVariant(req: { name: string; expectTip: string; confirmUnmerged?: boolean }) {
    this.gate('delete');
    const v = this.variants.find(x => x.name === req.name)!;
    if (!v.merged && !req.confirmUnmerged) throw JSON.stringify(err('blocked', 'unmerged-variant'));
    this.variants = this.variants.filter(x => x.name !== req.name);
    return { name: req.name, deletedTip: v.tip, backupRef: v.merged ? null : 'refs/somnia/variant-backup/1-x' };
  }
  async combinePreview(name: string): Promise<GitCombinePreview> {
    this.gate('preview');
    return { name, tip: `tip-${name}`, current: 'main', upToDate: false, fastForward: false, commits: [version('c1', 'Their change')], files: [{ path: 'index.html', kind: 'modified' }], truncated: false };
  }
  async combineStart(_req: { name: string }) {
    this.gate('start');
    this.session = this.startResult;
    return this.startResult!;
  }
  async combineStatus() { this.gate('status'); return this.session; }
  async combineResolve(req: { resolutions: GitConflictResolution[] }) {
    this.gate('resolve');
    this.resolved.push(...req.resolutions);
    const done = new Set(req.resolutions.map(r => r.path));
    this.session = { ...this.session!, conflicts: this.session!.conflicts.filter(c => !done.has(c.path)) };
    return this.session;
  }
  async combineFinish(req: { message?: string }) {
    this.gate('finish');
    if (this.session!.conflicts.length) throw JSON.stringify(err('blocked', 'unresolved-conflicts'));
    this.finished = version('merge', req.message ?? this.session!.proposedMessage);
    this.session = null;
    return this.finished;
  }
  async combineAbort(): Promise<GitRepoState> { this.gate('abort'); this.session = null; return { kind: 'no-repo', root: 'fake' }; }
}

export function fakeStatus(changes = 0, token = 'tok'): Pick<{ status(): Promise<GitStatus> }, 'status'> {
  return { status: async () => ({ repo: {} as never, changes: Array.from({ length: changes }, (_, i) => ({ path: `f${i}`, kind: 'modified' as const, staged: false, unstaged: true, binary: false })), stateToken: token, truncated: false }) };
}
