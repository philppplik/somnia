// Somnia Agent diff engine. Pure and synchronous: no disk, editor or network access.
// Builds on sourceDiff (LCS line diff). See notes/AGENT-DIFF.md for the contract.
import {sourceDiff} from './sourceDiff';

export const MAX_FILE_CHARS = 250_000;
export const MAX_FILES_PER_SET = 50;

export interface FileProposal {
  path: string;                 // project-relative, POSIX separators
  kind: 'create' | 'edit';
  baseText: string | null;      // editor text the agent saw; null for create
  proposedText: string;
}
/** Structurally identical to the Privacy module's AIProvenance (createAIProvenance). Replace with an import once that lands on phase1-foundation. */
export interface AIProvenance { generatedBy: 'ai'; provider: string; model: string; generatedAt: string; humanReviewed: boolean }
export interface HunkRef { path: string; index: number }
export interface ChangeSet {
  id: string;
  /** false while the agent is still streaming; incomplete sets can never be applied. */
  complete: boolean;
  /** Set by the agent loop via createAIProvenance(provider, model). Carried unchanged into the apply plan. */
  provenance?: AIProvenance;
  files: FileProposal[];
  /** Agent-declared dependencies: accepting `hunk` requires `requires` to be accepted too. */
  links?: {hunk: HunkRef; requires: HunkRef; reason: string}[];
}
export type Decision = 'accept' | 'reject' | 'pending';
/** Decisions keyed by hunkKey(). Missing = pending. */
export type Decisions = Record<string, Decision>;

export type Op =
  | {t: 'same'; text: string}
  | {t: 'change'; removed: string[]; added: string[]; index: number; baseLine: number};
export interface Hunk {
  key: string; index: number; path: string;
  baseLine: number;             // 1-based first affected base line (insertion point for pure additions)
  removed: string[]; added: string[];
  before: string[]; after: string[]; // up to 3 unchanged context lines each side, display only
}
export interface FileReview { file: FileProposal; ops: Op[]; hunks: Hunk[]; tooLarge: boolean; invalid?: string }

export const hunkKey = (r: HunkRef) => `${r.path}#${r.index}`;

const SECRET = [/(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx|keystore)$/i, /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i, /(^|\/)\.(npmrc|netrc|pypirc)$/i, /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i];
/** Returns an error string, or null when the path is acceptable. Symlink checks are the host's job. */
export function validatePath(p: string): string | null {
  if (!p || typeof p !== 'string') return 'empty path';
  if (p.includes('\0')) return 'NUL in path';
  if (p.includes('\\')) return 'backslash in path (use / and project-relative paths)';
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return 'absolute path';
  const parts = p.split('/');
  if (parts.some(s => s === '..' || s === '.' || s === '')) return 'path segment not allowed (.., ., empty)';
  if (parts[0].toLowerCase() === '.git' || parts.some(s => s.toLowerCase() === '.git')) return '.git is off limits';
  if (SECRET.some(r => r.test(p))) return 'secret-like file is off limits';
  return null;
}

/** Diff of two texts into ordered ops. Returns null when the diff is too large to review safely. */
export function diffOps(base: string, next: string): Op[] | null {
  const d = sourceDiff(base, next);
  if (d.limited) return null;
  const ops: Op[] = []; let cur: Extract<Op, {t: 'change'}> | null = null; let idx = 0; let baseLine = 1;
  for (const l of d.lines) {
    if (l.kind === 'same') { cur = null; ops.push({t: 'same', text: l.text}); baseLine++; continue; }
    if (!cur) { cur = {t: 'change', removed: [], added: [], index: idx++, baseLine}; ops.push(cur); }
    if (l.kind === 'removed') { cur.removed.push(l.text); baseLine++; } else cur.added.push(l.text);
  }
  return ops;
}

export function reviewFile(file: FileProposal): FileReview {
  const bad = validatePath(file.path);
  const empty = (invalid?: string, tooLarge = false): FileReview => ({file, ops: [], hunks: [], tooLarge, invalid});
  if (bad) return empty(bad);
  if (file.proposedText.length > MAX_FILE_CHARS || (file.baseText?.length ?? 0) > MAX_FILE_CHARS) return empty(undefined, true);
  if (file.kind === 'create') {
    if (file.baseText !== null) return empty('create proposal must not have baseText');
    const lines = file.proposedText.split('\n');
    const op: Op = {t: 'change', removed: [], added: lines, index: 0, baseLine: 1};
    return {file, ops: [op], tooLarge: false, hunks: [{key: hunkKey({path: file.path, index: 0}), index: 0, path: file.path, baseLine: 1, removed: [], added: lines, before: [], after: []}]};
  }
  if (file.baseText === null) return empty('edit proposal needs baseText');
  const ops = diffOps(file.baseText, file.proposedText);
  if (!ops) return empty(undefined, true);
  const hunks: Hunk[] = [];
  ops.forEach((o, i) => {
    if (o.t !== 'change') return;
    const ctx = (from: number, to: number, step: number) => { const out: string[] = []; for (let k = from; k !== to && out.length < 3; k += step) { const x = ops[k]; if (!x || x.t !== 'same') break; out.push(x.text); } return out; };
    hunks.push({key: hunkKey({path: file.path, index: o.index}), index: o.index, path: file.path, baseLine: o.baseLine, removed: o.removed, added: o.added, before: ctx(i - 1, -1, -1).reverse(), after: ctx(i + 1, ops.length, 1)});
  });
  return {file, ops, hunks, tooLarge: false};
}

export const reviewChangeSet = (cs: ChangeSet): FileReview[] => cs.files.map(reviewFile);

/** Pure merge: accepted hunks take the proposed lines, everything else keeps the base. */
export function applyHunks(review: FileReview, decisions: Decisions): string {
  const out: string[] = [];
  for (const o of review.ops) {
    if (o.t === 'same') out.push(o.text);
    else if (decisions[hunkKey({path: review.file.path, index: o.index})] === 'accept') out.push(...o.added);
    else out.push(...o.removed);
  }
  return out.join('\n');
}

export type Freshness = 'fresh' | 'stale' | 'exists' | 'missing-base';
/** Exact comparison with the current editor text (incl. unsaved changes). No fuzzy matching. */
export function checkFresh(f: FileProposal, current: string | null): Freshness {
  if (f.kind === 'create') return current === null ? 'fresh' : 'exists';
  if (current === null) return 'missing-base';
  return current === f.baseText ? 'fresh' : 'stale';
}

export interface Blocker { path?: string; reason: 'incomplete' | 'invalid-path' | 'too-large' | 'stale' | 'exists' | 'missing-base' | 'dependency' | 'duplicate-path' | 'too-many-files' | 'pending'; detail: string }
export interface PlannedWrite { path: string; kind: 'create' | 'edit'; text: string; acceptedHunks: number; totalHunks: number; provenance?: AIProvenance }
export interface ApplyPlan { ok: boolean; provenance?: AIProvenance; writes: PlannedWrite[]; skipped: string[]; blockers: Blocker[] }

/** Provenance of applied content: still AI generated, now human reviewed (user accepted hunks explicitly). */
const reviewedProvenance = (p?: AIProvenance): AIProvenance | undefined => p && {...p, humanReviewed: true};

/**
 * Sandboxed apply: computes what WOULD be written. Never touches disk or editor.
 * All-or-nothing: any blocker on an accepted file makes ok=false and writes=[].
 */
export function planApply(cs: ChangeSet, decisions: Decisions, readCurrent: (path: string) => string | null, opts: {allowPending?: boolean} = {}): ApplyPlan {
  const blockers: Blocker[] = []; const writes: PlannedWrite[] = []; const skipped: string[] = [];
  if (!cs.complete) blockers.push({reason: 'incomplete', detail: 'Agent is still producing this change set.'});
  if (cs.files.length > MAX_FILES_PER_SET) blockers.push({reason: 'too-many-files', detail: `More than ${MAX_FILES_PER_SET} files.`});
  const seen = new Set<string>();
  for (const f of cs.files) { const k = f.path.toLowerCase(); if (seen.has(k)) blockers.push({path: f.path, reason: 'duplicate-path', detail: 'Same file proposed twice.'}); seen.add(k); }
  const reviews = reviewChangeSet(cs);
  const accepted = (path: string, index: number) => decisions[hunkKey({path, index})] === 'accept';
  for (const l of cs.links ?? []) if (accepted(l.hunk.path, l.hunk.index) && !accepted(l.requires.path, l.requires.index)) blockers.push({path: l.hunk.path, reason: 'dependency', detail: `${hunkKey(l.hunk)} needs ${hunkKey(l.requires)}: ${l.reason}`});
  for (const r of reviews) {
    const {path} = r.file;
    const n = r.hunks.filter(h => decisions[h.key] === 'accept').length;
    const pend = r.hunks.filter(h => !decisions[h.key] || decisions[h.key] === 'pending').length;
    // Unreviewable files fail closed: they block the whole set even if nothing was accepted.
    if (r.invalid) { blockers.push({path, reason: 'invalid-path', detail: r.invalid}); continue; }
    if (r.tooLarge) { blockers.push({path, reason: 'too-large', detail: 'Too large to review hunk by hunk.'}); continue; }
    if (n === 0 && !(pend && !opts.allowPending)) { skipped.push(path); continue; }
    if (pend && !opts.allowPending) blockers.push({path, reason: 'pending', detail: `${pend} hunk(s) undecided.`});
    if (n === 0) { skipped.push(path); continue; }
    const fresh = checkFresh(r.file, readCurrent(path));
    if (fresh !== 'fresh') { blockers.push({path, reason: fresh, detail: fresh === 'stale' ? 'File changed since the proposal. Re-propose from the current state.' : fresh === 'exists' ? 'File already exists; never overwritten silently.' : 'File no longer exists.'}); continue; }
    writes.push({path, kind: r.file.kind, text: applyHunks(r, decisions), acceptedHunks: n, totalHunks: r.hunks.length, provenance: reviewedProvenance(cs.provenance)});
  }
  const ok = blockers.length === 0;
  return {ok, writes: ok ? writes : [], skipped, blockers, provenance: reviewedProvenance(cs.provenance)};
}

/** Host port. `applyBatch` must be ONE undo step and must not save to disk. */
export interface AgentApplyPort {
  read(path: string): string | null;
  applyBatch(writes: PlannedWrite[]): Promise<void> | void;
}
/** Re-plans against live state right before applying, so a stale plan is never executed. */
export async function applyReviewed(port: AgentApplyPort, cs: ChangeSet, decisions: Decisions): Promise<ApplyPlan> {
  const plan = planApply(cs, decisions, p => port.read(p));
  if (plan.ok && plan.writes.length) await port.applyBatch(plan.writes);
  return plan;
}

export const summarize = (rs: FileReview[], d: Decisions) => ({
  files: rs.length,
  hunks: rs.reduce((a, r) => a + r.hunks.length, 0),
  accepted: rs.reduce((a, r) => a + r.hunks.filter(h => d[h.key] === 'accept').length, 0),
  rejected: rs.reduce((a, r) => a + r.hunks.filter(h => d[h.key] === 'reject').length, 0),
  added: rs.reduce((a, r) => a + r.hunks.reduce((x, h) => x + h.added.length, 0), 0),
  removed: rs.reduce((a, r) => a + r.hunks.reduce((x, h) => x + h.removed.length, 0), 0),
});
