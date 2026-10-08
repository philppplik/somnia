/**
 * Variants and Combine: UI-independent flow (CONTRACT-E). Every function returns a tagged result and never
 * throws, so the panel can render a plain explanation. Nothing here resolves a conflict on its own:
 * a file is "decided" only after an explicit choice or an edited result without conflict markers.
 */
import type {
  GitBackend, GitCombinePreview, GitCombineSession, GitConflict, GitConflictResolution, GitError, GitRepoState,
  GitResolveChoice, GitVariant, GitVariantDeleteResult, GitVariantsBackend, GitVersion,
} from './types';
import { parseGitError } from './variantsBackend';

/** Editor state the Git backend cannot see (contract rule 4). */
export interface VariantGuards {
  /** Project paths with unsaved editor buffers. */
  unsavedBuffers(): string[];
  /** Labels of running reviews (for example a pending AI change review). */
  activeReviews(): string[];
}
export interface VariantsDeps {
  git: Pick<GitBackend, 'status'>;
  variants: GitVariantsBackend;
  guards: VariantGuards;
}

export type FlowError = { kind: 'error'; error: GitError };
export type GuardBlock = { kind: 'guard'; unsaved: string[]; reviews: string[] };
export type Dirty = { kind: 'dirty'; changes: number };

export function checkGuards(g: VariantGuards): GuardBlock | null {
  const unsaved = g.unsavedBuffers();
  const reviews = g.activeReviews();
  return unsaved.length || reviews.length ? { kind: 'guard', unsaved, reviews } : null;
}
const fail = (e: unknown): FlowError => ({ kind: 'error', error: parseGitError(e) });

/** Reads status once: the state token and whether the folder has changes that a switch or combine would trip over. */
async function cleanStatus(deps: VariantsDeps): Promise<{ kind: 'ok'; stateToken: string } | Dirty | FlowError> {
  try {
    const s = await deps.git.status();
    const changes = s.changes.filter(c => c.kind !== 'ignored').length + (s.stagedOutsidePrefix ?? 0);
    if (changes > 0) return { kind: 'dirty', changes };
    return { kind: 'ok', stateToken: s.stateToken };
  } catch (e) { return fail(e); }
}

export async function loadVariants(deps: VariantsDeps): Promise<{ kind: 'list'; variants: GitVariant[] } | FlowError> {
  try { return { kind: 'list', variants: await deps.variants.listVariants() }; } catch (e) { return fail(e); }
}

/** Start a new variant from the current version. Uncommitted work is carried along unchanged. */
export async function startVariant(deps: VariantsDeps, name: string, openNow: boolean): Promise<{ kind: 'created'; variant: GitVariant } | FlowError> {
  try { return { kind: 'created', variant: await deps.variants.createVariant({ name, open: openNow }) }; } catch (e) { return fail(e); }
}

export async function openVariant(deps: VariantsDeps, name: string): Promise<{ kind: 'opened'; state: GitRepoState } | GuardBlock | Dirty | FlowError> {
  const g = checkGuards(deps.guards);
  if (g) return g;
  const c = await cleanStatus(deps);
  if (c.kind !== 'ok') return c;
  try { return { kind: 'opened', state: await deps.variants.openVariant({ name, stateToken: c.stateToken }) }; } catch (e) { return fail(e); }
}

export async function renameVariant(deps: VariantsDeps, from: string, to: string): Promise<{ kind: 'renamed'; variant: GitVariant } | FlowError> {
  try { return { kind: 'renamed', variant: await deps.variants.renameVariant({ from, to }) }; } catch (e) { return fail(e); }
}

/** First call without `confirmUnmerged` never deletes an unmerged variant; the panel asks, then calls again with true. */
export async function deleteVariant(deps: VariantsDeps, v: GitVariant, confirmUnmerged: boolean): Promise<{ kind: 'deleted'; result: GitVariantDeleteResult } | { kind: 'needs-confirm'; ahead: number } | FlowError> {
  if (v.current) return { kind: 'error', error: { code: 'blocked', message: 'The open variant cannot be deleted', detail: 'is-current' } };
  if (!v.merged && !confirmUnmerged) return { kind: 'needs-confirm', ahead: v.ahead };
  try { return { kind: 'deleted', result: await deps.variants.deleteVariant({ name: v.name, expectTip: v.tip, confirmUnmerged }) }; } catch (e) { return fail(e); }
}

export async function previewCombine(deps: VariantsDeps, name: string): Promise<{ kind: 'preview'; preview: GitCombinePreview } | FlowError> {
  try { return { kind: 'preview', preview: await deps.variants.combinePreview(name) }; } catch (e) { return fail(e); }
}

export type CombineStarted =
  | { kind: 'fast-forwarded'; session: GitCombineSession }
  | { kind: 'conflicts'; session: GitCombineSession }
  | { kind: 'clean'; session: GitCombineSession };
export async function startCombine(deps: VariantsDeps, preview: GitCombinePreview): Promise<CombineStarted | GuardBlock | Dirty | FlowError> {
  const g = checkGuards(deps.guards);
  if (g) return g;
  const c = await cleanStatus(deps);
  if (c.kind !== 'ok') return c;
  try {
    const session = await deps.variants.combineStart({ name: preview.name, expectTip: preview.tip, stateToken: c.stateToken });
    if (session.fastForwarded) return { kind: 'fast-forwarded', session };
    return { kind: session.conflicts.length ? 'conflicts' : 'clean', session };
  } catch (e) { return fail(e); }
}

/** A combine that was started earlier (even before an app restart) and still needs a decision. */
export async function resumeCombine(deps: VariantsDeps): Promise<{ kind: 'session'; session: GitCombineSession | null } | FlowError> {
  try { return { kind: 'session', session: await deps.variants.combineStatus() }; } catch (e) { return fail(e); }
}

export async function abortCombine(deps: VariantsDeps): Promise<{ kind: 'aborted'; state: GitRepoState } | GuardBlock | FlowError> {
  const g = checkGuards(deps.guards);
  if (g) return g;
  try { return { kind: 'aborted', state: await deps.variants.combineAbort() }; } catch (e) { return fail(e); }
}

// ------------------------------------------------------------------ conflict drafts

export interface ConflictDraft {
  conflict: GitConflict;
  /** null = not decided yet. Nothing is sent for an undecided file. */
  choice: GitResolveChoice | null;
  /** The editable Result column. */
  result: string;
}

export function hasConflictMarkers(text: string): boolean {
  return text.split(/\r\n|\n|\r/).some(l => l === '<<<<<<<' || l.startsWith('<<<<<<< ') || l === '>>>>>>>' || l.startsWith('>>>>>>> '));
}
/** Text conflicts can be edited; binary and cut-off (too large) files only take a whole side. */
export const canEditResult = (c: GitConflict) => !c.binary && !c.tooLarge;

export function initDrafts(conflicts: GitConflict[]): ConflictDraft[] {
  return conflicts.map(conflict => ({ conflict, choice: null, result: conflict.working ?? conflict.yours ?? '' }));
}
export function pickSide(d: ConflictDraft, side: 'yours' | 'theirs'): ConflictDraft {
  const text = d.conflict[side] ?? '';
  return { ...d, choice: side, result: d.conflict.binary ? '' : text };
}
export function editResult(d: ConflictDraft, text: string): ConflictDraft {
  if (!canEditResult(d.conflict)) return d;
  return { ...d, result: text, choice: hasConflictMarkers(text) ? null : 'content' };
}
export function useBoth(d: ConflictDraft): ConflictDraft {
  if (!canEditResult(d.conflict)) return d;
  const y = d.conflict.yours ?? '';
  const t = d.conflict.theirs ?? '';
  const joined = y && t && !y.endsWith('\n') ? `${y}\n${t}` : `${y}${t}`;
  return editResult(d, joined);
}
export const isDecided = (d: ConflictDraft) => d.choice !== null;
export const allDecided = (ds: ConflictDraft[]) => ds.length > 0 && ds.every(isDecided);
export const undecidedCount = (ds: ConflictDraft[]) => ds.filter(d => !isDecided(d)).length;

export function buildResolutions(ds: ConflictDraft[]): GitConflictResolution[] {
  return ds.filter(isDecided).map(d => d.choice === 'content'
    ? { path: d.conflict.path, choice: 'content' as const, content: d.result }
    : { path: d.conflict.path, choice: d.choice as GitResolveChoice });
}

export async function finishCombine(deps: VariantsDeps, session: GitCombineSession, drafts: ConflictDraft[], message?: string): Promise<{ kind: 'finished'; version: GitVersion } | GuardBlock | { kind: 'incomplete'; undecided: string[] } | FlowError> {
  const g = checkGuards(deps.guards);
  if (g) return g;
  const decided = new Set(drafts.filter(isDecided).map(d => d.conflict.path));
  const undecided = session.conflicts.map(c => c.path).filter(p => !decided.has(p));
  if (undecided.length) return { kind: 'incomplete', undecided };
  try {
    const resolutions = buildResolutions(drafts);
    if (resolutions.length) await deps.variants.combineResolve({ resolutions });
    return { kind: 'finished', version: await deps.variants.combineFinish({ message: message?.trim() || undefined }) };
  } catch (e) { return fail(e); }
}

/** i18n key for a flow error; unknown details fall back to the generic text. */
export function errorKey(e: GitError): string {
  if (e.code === 'state-changed') return 'variants.err.stateChanged';
  if (e.code === 'identity-missing') return 'variants.err.identity';
  if (e.code === 'hook-failed') return 'variants.err.hook';
  if (e.code === 'signing-failed') return 'variants.err.signing';
  if (e.code === 'git-missing') return 'variants.err.noGit';
  const d = e.detail ?? '';
  const map: Record<string, string> = {
    'invalid-variant-name': 'variants.err.name', 'variant-exists': 'variants.err.exists', 'variant-missing': 'variants.err.missing',
    'is-current': 'variants.err.isCurrent', 'unmerged-variant': 'variants.err.unmerged', 'dirty-worktree': 'variants.err.dirty',
    'detached-head': 'variants.err.detached', 'unborn': 'variants.err.unborn', 'same-variant': 'variants.err.same',
    'up-to-date': 'variants.err.upToDate', 'unrelated-histories': 'variants.err.unrelated', 'untrusted-repo': 'variants.err.untrusted',
    'conflict-markers': 'variants.err.markers', 'binary-needs-choice': 'variants.err.binary', 'unresolved-conflicts': 'variants.err.unresolved',
    'conflict-outside-project': 'variants.err.outside', 'no-merge': 'variants.err.noMerge',
  };
  return map[d] ?? 'variants.err.generic';
}
