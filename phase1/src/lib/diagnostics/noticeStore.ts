import type { ErrorNotice, IntakeContextItem, IntakeOperationNotice, Notice, RecoveryImpact, ReportedFailure, RequestId, UiOnlyContext } from './uiTypes';
/** UI-only metadata. Never pass this state to a logger, report builder, clipboard, or persistence. */
export function sanitizeDisplayName(value: string): string { return value.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 160); }
export function createNoticeStore() {
 let notices: readonly Notice[] = [];
 let overflow = 0;
 const listeners = new Set<() => void>();
 const contexts = new Map<string, Map<number, UiOnlyContext>>();
 const publish = () => {
  while (notices.length > 100) {
   const disposable = notices.findIndex(n => n.acknowledged || n.kind === 'operation');
   const index = disposable >= 0 ? disposable : 0;
   if (disposable < 0) overflow++;
   notices = notices.filter((_, i) => i !== index);
  }
  for (const id of contexts.keys()) if (!notices.some(n => n.kind === 'operation' ? n.corr === id : n.failure.corr === id) && contexts.size > 100) contexts.delete(id);
  for (const fn of listeners) fn();
 };
 const displayFor = (f: ReportedFailure) => f.corr !== undefined && f.ordinal !== undefined ? contexts.get(f.corr)?.get(f.ordinal) : undefined;
 return {
  getSnapshot: () => notices,
  getOverflow: () => overflow,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  presentError(f: ReportedFailure, display?: UiOnlyContext, impact: RecoveryImpact = { kind: 'unknown' }) {
   // Queue reset is operation-only. Deprecated/reserved/CI IDs cannot become defect notices.
   if (f.expected || !f.incidentId || ['err.app.003', 'err.app.012', 'err.app.099', 'err.acl.002'].includes(f.userMessageKey)) return;
   const safeDisplay = display ? { ...display, displayName: display.displayName === undefined ? undefined : sanitizeDisplayName(display.displayName) } : displayFor(f);
   const existing = notices.find(n => n.noticeId === f.incidentId);
   if (existing?.kind === 'error') notices = notices.map(n => n === existing ? { ...existing, display: safeDisplay ?? existing.display } : n);
   else notices = [...notices, { kind: 'error', noticeId: f.incidentId, failure: f, display: safeDisplay, impact, acknowledged: false } satisfies ErrorNotice];
   publish();
  },
  presentIntakeOutcome(outcome: IntakeOperationNotice) {
   this.registerIntakeContext(outcome.corr, outcome.items);
   if (!(outcome.failed || outcome.rejected || outcome.deferred) && !((outcome.resetCount ?? 0) > 0 && (outcome.affectedItems ?? 0) > 0)) return;
   const noticeId = `operation:${outcome.corr}`;
   const safe = { ...outcome, items: outcome.items.map(item => ({ ...item, displayName: item.displayName === undefined ? undefined : sanitizeDisplayName(item.displayName) })), noticeId, acknowledged: false } as const;
   notices = [...notices.filter(n => n.noticeId !== noticeId), safe]; publish();
  },
  registerIntakeContext(requestId: RequestId, items: readonly IntakeContextItem[]) {
   const map = contexts.get(requestId) ?? new Map<number, UiOnlyContext>();
   for (const item of items.slice(0, 100)) map.set(item.ordinal, { displayName: item.displayName === undefined ? undefined : sanitizeDisplayName(item.displayName), operation: 'open' });
   while (map.size > 100) map.delete(map.keys().next().value!);
   contexts.set(requestId, map);
   while (contexts.size > 100) contexts.delete(contexts.keys().next().value!);
   notices = notices.map(n => n.kind === 'error' && n.failure.corr === requestId ? { ...n, display: displayFor(n.failure) ?? n.display } : n); publish();
  },
  forgetIntakeContext(requestId: RequestId) {
   contexts.delete(requestId);
   notices = notices.map(n => n.kind === 'error' && n.failure.corr === requestId ? { ...n, display: undefined } : n.kind === 'operation' && n.corr === requestId ? { ...n, items: n.items.map(({ displayName: _, ...item }) => item) } : n); publish();
  },
  acknowledgeNotice(noticeId: string) {
   notices = notices.map(n => n.noticeId === noticeId ? { ...n, acknowledged: true } : n);
   for (const id of contexts.keys()) if (!notices.some(n => !n.acknowledged && (n.kind === 'operation' ? n.corr === id : n.failure.corr === id))) this.forgetIntakeContext(id as RequestId);
   publish();
  },
 };
}
export const noticeStore = createNoticeStore();
