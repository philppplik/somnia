import { TaskError } from './errors';
import { sha256Hex } from './hash';

/**
 * Commit attribution (R3, D2 = opt-in). The setting `attribution.commit` is OFF by default.
 * The footer is assembled here, outside model control; the human stays Git author and committer.
 */
export const ATTRIBUTION_SETTING_KEY = 'attribution.commit';
export type AttributionMode = 'off' | 'on' | 'custom';
export interface AttributionIdentity { name: string; email: string }
export interface AttributionSetting {
  mode: AttributionMode;
  /** 'custom' only: the identity the user chose. Never invented, never a guessed noreply address. */
  custom?: AttributionIdentity;
  /** Independent of co-author disclosure (R3-R5). */
  sessionLink: boolean;
  /** Minimum accepted AI-changed lines before a co-author trailer applies (message-only help never counts). */
  assistanceThreshold: number;
}
export const DEFAULT_ATTRIBUTION: AttributionSetting = { mode: 'off', sessionLink: false, assistanceThreshold: 1 };

/** Normalises a stored value; anything unknown falls back to the safe off default. */
export function normalizeAttributionSetting(raw: unknown): AttributionSetting {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ATTRIBUTION };
  const r = raw as Record<string, unknown>;
  const mode: AttributionMode = r.mode === 'on' || r.mode === 'custom' ? r.mode : 'off';
  const th = typeof r.assistanceThreshold === 'number' && Number.isFinite(r.assistanceThreshold) && r.assistanceThreshold >= 1 ? Math.floor(r.assistanceThreshold) : 1;
  const c = r.custom as Record<string, unknown> | undefined;
  const custom = c && typeof c.name === 'string' && typeof c.email === 'string' ? { name: c.name, email: c.email } : undefined;
  return { mode, custom, sessionLink: r.sessionLink === true, assistanceThreshold: th };
}

const TRAILER_KEY = /^[A-Za-z][A-Za-z0-9-]*$/;
const CTRL = /[\r\n\0\u2028\u2029]/;
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export function validateIdentity(i: AttributionIdentity | undefined): AttributionIdentity {
  if (!i || !i.name.trim() || !EMAIL.test(i.email) || CTRL.test(i.name) || CTRL.test(i.email) || /[<>]/.test(i.name) || i.name.length > 100 || i.email.length > 200) throw new TaskError('identity');
  return { name: i.name.trim(), email: i.email.trim() };
}

/** Protected trailer namespaces: never accepted from model-drafted text. */
const PROTECTED = /^(co-authored-by|signed-off-by|x-somnia-[a-z0-9-]+)$/i;

/** Strips a trailing trailer block and any protected trailer line from a model-drafted message. */
export function sanitizeModelMessage(msg: string): string {
  const lines = msg.replace(/\r\n?/g, '\n').split('\n');
  const kept = lines.filter(l => { const m = /^([A-Za-z][A-Za-z0-9-]*):\s/.exec(l); return !(m && PROTECTED.test(m[1])); });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface FooterContext {
  taskId: string;
  /** Accepted (not merely proposed) AI-changed lines in this commit. 0 for AI-drafted message text only. */
  acceptedAiLines: number;
  /** Reviewed third-party trailers to carry over verbatim (e.g. from a squash). Validated, never model-supplied. */
  preservedTrailers?: string[];
  /** Identity for mode 'on' resolved from a verified source; absent means needs_input, never a guess. */
  resolvedIdentity?: AttributionIdentity;
}
export interface Footer { lines: string[]; text: string; coAuthor: boolean; sessionLink: boolean }

export function buildFooter(setting: AttributionSetting, ctx: FooterContext): Footer {
  if (setting.mode === 'off' && !setting.sessionLink) return { lines: [], text: '', coAuthor: false, sessionLink: false };
  const out: string[] = [];
  let coAuthor = false;
  if (setting.mode !== 'off' && ctx.acceptedAiLines >= setting.assistanceThreshold) {
    const id = validateIdentity(setting.mode === 'custom' ? setting.custom : ctx.resolvedIdentity);
    out.push(`Co-authored-by: ${id.name} <${id.email}>`);
    coAuthor = true;
  }
  let sessionLink = false;
  if (setting.sessionLink) {
    if (CTRL.test(ctx.taskId) || !/^[A-Za-z0-9._-]{1,64}$/.test(ctx.taskId)) throw new TaskError('invalid-record');
    out.push(`X-Somnia-Session: ${ctx.taskId}`);
    sessionLink = true;
  }
  for (const p of ctx.preservedTrailers ?? []) {
    const m = /^([^:\s]+):\s(.+)$/.exec(p);
    if (!m || CTRL.test(p) || !TRAILER_KEY.test(m[1]) || PROTECTED.test(m[1])) throw new TaskError('invalid-record');
    out.push(p);
  }
  const lines = [...new Set(out)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return { lines, text: lines.join('\n'), coAuthor, sessionLink };
}
const rank = (l: string) => (l.startsWith('Co-authored-by:') ? 0 : l.startsWith('X-Somnia-Session:') ? 2 : 1);

/** Final commit message: sanitised body, blank line, deterministic footer. */
export function applyFooter(modelMessage: string, footer: Footer): string {
  const body = sanitizeModelMessage(modelMessage);
  if (!body) throw new TaskError('invalid-record');
  return footer.lines.length ? `${body}\n\n${footer.text}\n` : `${body}\n`;
}

/** The review digest covers message + footer; any change to either invalidates the approval. */
export async function reviewDigest(finalMessage: string, treeSha: string, contentHash: string): Promise<string> {
  return sha256Hex(JSON.stringify([finalMessage, treeSha, contentHash]));
}

/**
 * GitCommitRequest extension. Deliberately has NO author/committer/signing/hook fields: the human identity
 * from existing Git config is used, and nothing is written to global config.
 */
export interface AttributedCommitRequest {
  taskId: string; repoId: string; worktreeId: string | null;
  expectedHead: string; workspaceGeneration: number;
  treeSha: string; contentHash: string;
  message: string; footerLines: string[]; reviewDigest: string;
  requestId: string;
}

/** Reads the real commit object result; intended settings are not success. */
export function verifyCommitResult(expected: AttributedCommitRequest, actual: { message: string; treeSha: string; authorEmail: string; committerEmail: string }, humanEmail: string): void {
  if (actual.treeSha !== expected.treeSha) throw new TaskError('stale-plan', expected.requestId);
  if (actual.authorEmail !== humanEmail) throw new TaskError('identity', expected.requestId);
  const lines = new Set(actual.message.replace(/\r\n?/g, '\n').split('\n'));
  if (!expected.footerLines.every(l => lines.has(l))) throw new TaskError('stale-plan', expected.requestId);
  // The model must not have introduced extra attribution trailers beyond the reviewed footer.
  for (const l of lines) { const m = /^([A-Za-z][A-Za-z0-9-]*):\s/.exec(l); if (m && PROTECTED.test(m[1]) && !expected.footerLines.includes(l)) throw new TaskError('stale-plan', expected.requestId); }
}
