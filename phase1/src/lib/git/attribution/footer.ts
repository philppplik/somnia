/**
 * Deterministic attribution footer (concept section 8, R3). It runs after the model has produced text
 * and outside its control: any trailer the model wrote under the reserved keys is removed, and the footer
 * is rebuilt only from the project's opt-in policy plus the task id the host owns.
 *
 * Not wired into the commit UI yet. Integration point: call `finalizeCommitMessage` where the commit
 * request is built (ChangesTab) and show `footer` verbatim in the commit review before `git_commit`.
 */
export interface AttributionPolicy {
  /** Project opt-in (decision D2). Default off. */
  enabled: boolean;
  coAuthorName: string;
  coAuthorEmail: string;
}
export const DEFAULT_ATTRIBUTION_POLICY: AttributionPolicy = {enabled: false, coAuthorName: 'Somnia Agent', coAuthorEmail: ''};
export interface FinalizeInput {
  subject: string;
  body?: string;
  /** Text came from a model. Drafting alone is never co-authorship. */
  aiDrafted: boolean;
  /** Accepted AI changes are a substantive part of the versioned content. */
  substantive: boolean;
  policy: AttributionPolicy;
  /** Opaque task id owned by the host, not by the model. */
  sessionId?: string;
}
export interface FinalizeResult { subject: string; body: string; footer: string[]; applied: boolean; strippedModelTrailers: number }
const RESERVED = /^(co-authored-by|x-somnia-session)\s*:/i;
const SESSION = /^[A-Za-z0-9._-]{1,64}$/;
const NAME = /^[^<>\r\n]{1,100}$/;
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export const validPolicy = (p: AttributionPolicy) => p.enabled && NAME.test(p.coAuthorName.trim()) && EMAIL.test(p.coAuthorEmail.trim());
/** Exact footer lines, or an empty list when attribution is off, not substantive, or inputs are invalid. */
export function buildFooter(policy: AttributionPolicy, substantive: boolean, sessionId?: string): string[] {
  if (!substantive || !validPolicy(policy)) return [];
  const lines = [`Co-authored-by: ${policy.coAuthorName.trim()} <${policy.coAuthorEmail.trim()}>`];
  if (sessionId && SESSION.test(sessionId)) lines.push(`X-Somnia-Session: ${sessionId}`);
  return lines;
}
/** Removes reserved trailers from the final paragraph (git's trailer block) and trims. Other trailers stay. */
function stripReserved(body: string): {body: string; stripped: number} {
  const paras = body.replace(/\r\n/g, '\n').split(/\n{2,}/);
  let stripped = 0;
  const last = paras.at(-1)?.split('\n') ?? [];
  const kept = last.filter(l => { const hit = RESERVED.test(l.trim()); if (hit) stripped++; return !hit; });
  if (stripped) { if (kept.length) paras[paras.length - 1] = kept.join('\n'); else paras.pop(); }
  return {body: paras.join('\n\n').trim(), stripped};
}
export function finalizeCommitMessage(i: FinalizeInput): FinalizeResult {
  const subject = i.subject.replace(/[\r\n]+/g, ' ').trim();
  // Human-written text is left alone; model text may not carry reserved trailers.
  const {body, stripped} = i.aiDrafted ? stripReserved(i.body ?? '') : {body: (i.body ?? '').trim(), stripped: 0};
  const footer = buildFooter(i.policy, i.substantive, i.sessionId);
  const humanHasReserved = !i.aiDrafted && body.split('\n').some(l => RESERVED.test(l.trim()));
  const out = footer.length && !humanHasReserved ? [body, footer.join('\n')].filter(Boolean).join('\n\n') : body;
  return {subject, body: out, footer: humanHasReserved ? [] : footer, applied: footer.length > 0 && !humanHasReserved, strippedModelTrailers: stripped};
}
