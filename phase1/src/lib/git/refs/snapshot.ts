import type {VisualComparison, VisualSnapshot} from '../../visualDiff';
import type {GitDiffRefsResult, GitRefsBackend, GitRefSide, GitRefTree, GitTreeEntry} from './contract';
import {isObjectId, validateDiffRefs} from './contract';
/** R2-C3 evidence: which exact content each side showed and what the rendering cannot tell you. */
export type LimitationKey = 'static' | 'animation' | 'remote' | 'binary' | 'partial' | 'large' | 'truncated';
export interface SideEvidence { ref: string; sha: string; tree: string; contentHash: string; fileCount: number }
export interface ComparisonEvidence {
  protocol: 'somnia-studio-compare/1';
  engine: 'static-preview-v1';
  viewports: number[];
  before: SideEvidence;
  after: SideEvidence;
  /** True only when both sides came from a full tree listing. */
  complete: boolean;
  limitations: {key: LimitationKey; count?: number}[];
}
export interface RefComparisonBundle {
  evidence: ComparisonEvidence;
  /** One entry per changed previewable file; each carries the full project snapshot. */
  comparisons: VisualComparison[];
  /** Changed files that cannot be previewed (binary or too large). */
  skipped: {path: string; reason: 'binary' | 'large' | 'missing'}[];
}
export const SNAPSHOT_LIMITS = {maxFiles: 2000, maxFileBytes: 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024, concurrency: 6};
export const VIEWPORTS = [320, 768, 960, 1440];

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Hash of sorted `path NUL blob` lines. Same tree contents give the same hash on any machine. */
export async function contentHash(entries: readonly {path: string; blob: string}[]): Promise<string> {
  const lines = entries.map(e => `${e.path}\0${e.blob}`).sort();
  return sha256Hex(lines.join('\n'));
}
async function pool<T, R>(items: readonly T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(size, items.length)}, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}
function checkTree(tree: GitRefTree, side: GitRefSide): GitTreeEntry[] {
  if (tree.side.sha !== side.sha || tree.side.tree !== side.tree) throw new Error('Snapshot tree does not match the compared version');
  for (const e of tree.entries) if (!isObjectId(e.blob) || !e.path || e.path.split('/').some(p => !p || p === '..' || p === '.') || /^[\/\\]|\0|\\/.test(e.path)) throw new Error('Snapshot tree contains an unsafe entry');
  return tree.entries;
}
/**
 * Builds the evidence and per-file comparisons for two versions. The result is bound to the resolved
 * commit shas and tree contents; `evidenceMatches` detects a later change instead of showing stale proof.
 */
export async function buildRefComparison(refs: GitRefsBackend, from: string, to: string): Promise<RefComparisonBundle> {
  const diff: GitDiffRefsResult = validateDiffRefs(await refs.diffRefs({from, to}), {from, to});
  const limitations: ComparisonEvidence['limitations'] = [{key: 'static'}, {key: 'animation'}, {key: 'remote'}];
  const canTree = !!refs.refTree && !!refs.readBlob;
  let beforeEntries: GitTreeEntry[] = [], afterEntries: GitTreeEntry[] = [], complete = false;
  if (canTree) {
    const [bt, at] = await Promise.all([refs.refTree!(diff.from.sha), refs.refTree!(diff.to.sha)]);
    beforeEntries = checkTree(bt, diff.from); afterEntries = checkTree(at, diff.to);
    complete = !bt.truncated && !at.truncated && beforeEntries.length <= SNAPSHOT_LIMITS.maxFiles && afterEntries.length <= SNAPSHOT_LIMITS.maxFiles;
  } else {
    for (const f of diff.files) {
      if (f.beforeBlob) beforeEntries.push({path: f.oldPath ?? f.path, blob: f.beforeBlob, sizeBytes: f.sizeBytes ?? 0, binary: f.binary});
      if (f.afterBlob) afterEntries.push({path: f.path, blob: f.afterBlob, sizeBytes: f.sizeBytes ?? 0, binary: f.binary});
    }
  }
  if (!complete) limitations.push({key: 'partial'});
  if (diff.truncated) limitations.push({key: 'truncated'});
  const [bh, ah] = await Promise.all([contentHash(beforeEntries), contentHash(afterEntries)]);

  // Load each distinct text blob once, within byte limits.
  const wanted = new Map<string, GitTreeEntry>();
  let total = 0, tooLarge = 0;
  for (const e of [...beforeEntries, ...afterEntries]) {
    if (e.binary || wanted.has(e.blob)) continue;
    if (e.sizeBytes > SNAPSHOT_LIMITS.maxFileBytes || total + e.sizeBytes > SNAPSHOT_LIMITS.maxTotalBytes) { tooLarge++; continue; }
    total += e.sizeBytes; wanted.set(e.blob, e);
  }
  const texts = new Map<string, string>();
  if (refs.readBlob) {
    await pool([...wanted.keys()], SNAPSHOT_LIMITS.concurrency, async blob => {
      const r = await refs.readBlob!(blob);
      if (r.blob !== blob) throw new Error('Blob response does not match the request');
      if (r.tooLarge) { tooLarge++; return; }
      if (!r.binary && typeof r.text === 'string') texts.set(blob, r.text);
    });
  }
  const files = (entries: GitTreeEntry[]) => Object.fromEntries(entries.filter(e => texts.has(e.blob)).map(e => [e.path, texts.get(e.blob)!]));
  const snapshot = (entries: GitTreeEntry[], side: GitRefSide): VisualSnapshot => ({files: files(entries), label: side.sha.slice(0, 8), incomplete: !complete || tooLarge > 0});
  const before = snapshot(beforeEntries, diff.from), after = snapshot(afterEntries, diff.to);
  if (diff.files.some(f => f.binary)) limitations.push({key: 'binary', count: diff.files.filter(f => f.binary).length});
  if (tooLarge) limitations.push({key: 'large', count: tooLarge});

  const comparisons: VisualComparison[] = [], skipped: RefComparisonBundle['skipped'] = [];
  for (const f of diff.files) {
    const hasText = (blob?: string | null) => !blob || texts.has(blob);
    if (f.binary) { skipped.push({path: f.path, reason: 'binary'}); continue; }
    if (!hasText(f.beforeBlob) || !hasText(f.afterBlob) || (!canTree && !f.beforeBlob && !f.afterBlob)) { skipped.push({path: f.path, reason: canTree ? 'large' : 'missing'}); continue; }
    comparisons.push({path: f.path, before, after});
  }
  const side = (s: GitRefSide, h: string, n: number): SideEvidence => ({ref: s.ref, sha: s.sha, tree: s.tree, contentHash: h, fileCount: n});
  return {evidence: {protocol: 'somnia-studio-compare/1', engine: 'static-preview-v1', viewports: VIEWPORTS, before: side(diff.from, bh, beforeEntries.length), after: side(diff.to, ah, afterEntries.length), complete, limitations}, comparisons, skipped};
}
/** Stored evidence is only valid while its refs still resolve to the same commits and trees (branch names move). */
export async function evidenceMatches(refs: GitRefsBackend, e: ComparisonEvidence): Promise<boolean> {
  const req = {from: e.before.ref, to: e.after.ref};
  const d = validateDiffRefs(await refs.diffRefs(req), req);
  return d.from.sha === e.before.sha && d.from.tree === e.before.tree && d.to.sha === e.after.sha && d.to.tree === e.after.tree;
}
