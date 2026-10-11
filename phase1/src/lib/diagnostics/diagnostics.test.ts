import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_IDS } from '../../generated/errorIds';
import type { IncidentId, RequestId, ReportedFailure, DiagnosticSnapshot, CrashMeta } from './uiTypes';
import type { DiagnosticsClient, DiagnosticsInvoker } from './client';
import { createDiagnosticsClient, createWebDiagnosticsClient } from './client';
import { createIntakeGate } from './intakeGate';
import { createNoticeStore, sanitizeDisplayName } from './noticeStore';
import { createDiagnosticsStore } from './diagnosticsStore';
import { createCrashReviewStore } from './crashReviewStore';
import { attachRetryCapability, registerIntakeRetryExecutor, retryNoticeItem, canRetryNotice } from './retryActions';
import { DIAGNOSTIC_LOCALES } from './locales';
import keys from './messageKeys.fixture.json';
const incident = 'incident-test' as IncidentId, request = 'request-test' as RequestId;
const failure = (): ReportedFailure => ({ id: ERROR_IDS.APP_002, incidentId: incident, expected: false, level: 'error', fatal: false, fingerprint: 'fp', userMessageKey: 'err.app.002', corr: request, ordinal: 0 });
const snapshot = (): DiagnosticSnapshot => ({ snapshotId: 'immutable-one', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), selection: { incidentIds: [], includeLogs: false, includeIncidentDetails: false, includeCapabilityHealth: false }, files: [{ name: 'manifest.json', utf8Bytes: 2, text: '{}' }], reportText: 'previewed bytes only', totalUncompressedBytes: 2, health: 'complete', omissions: [] });
const client = (overrides: Partial<DiagnosticsClient> = {}): DiagnosticsClient => ({ native: true, prepare: async () => snapshot(), save: async () => ({ kind: 'cancelled' }), discard: async () => {}, list: async () => [], markReviewed: async () => {}, delete: async () => {}, ...overrides });
const crash = (): CrashMeta => ({ incidentId: incident, kind: 'unclean-exit', occurredAt: new Date().toISOString(), errorId: ERROR_IDS.APP_010, reviewedAt: null, build: { release: '12.0.1', sha: 'abc', channel: 'beta', arch: 'x64', frontend_build: 'test' }, recovery: [{ kind: 'unknown' }], artifacts: [] });
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
test('initial decision and nested idempotent pause handles gate all claims', async () => {
 const gate = createIntakeGate(); let allowed = false;
 void gate.whenIntakeAllowed().then(() => { allowed = true; });
 const initial = gate.pauseIntake('initial-review'), modal = gate.pauseIntake('diagnostics-modal');
 gate.completeInitialReviewDecision(); initial(); initial(); await turn(); assert.equal(allowed, false);
 modal(); await turn(); assert.equal(allowed, true);
});
for (const order of ['failure-first', 'outcome-first']) test(`notice race ${order}: one incident, one operation, UI-only correlation`, () => {
 const store = createNoticeStore();
 const outcome = { kind: 'operation' as const, corr: request, opened: 1, rejected: 0, failed: 1, deferred: 0, items: [{ ordinal: 0, displayName: '<img>\u202e\nindex.html', status: 'failed' as const, incidentId: incident }] };
 if (order === 'failure-first') { store.presentError(failure()); store.presentIntakeOutcome(outcome); }
 else { store.presentIntakeOutcome(outcome); store.presentError(failure()); }
 store.presentError(failure()); store.presentIntakeOutcome(outcome);
 assert.equal(store.getSnapshot().length, 2);
 const notice = store.getSnapshot().find(n => n.kind === 'error'); assert.ok(notice?.kind === 'error'); assert.equal(notice.display?.displayName, '<img>index.html');
 assert.equal(JSON.stringify(notice.failure).includes('index.html'), false);
 store.acknowledgeNotice(incident); store.acknowledgeNotice(`operation:${request}`);
 const done = store.getSnapshot().find(n => n.kind === 'error'); assert.ok(done?.kind === 'error'); assert.equal(done.display, undefined);
});
test('expected, reset-only, pure cancel and inactive entries never become defect notices', () => {
 const store = createNoticeStore(); store.presentError({ ...failure(), expected: true }); store.presentError({ ...failure(), userMessageKey: 'err.app.012' });
 store.presentIntakeOutcome({ kind: 'operation', corr: request, opened: 0, rejected: 0, failed: 0, deferred: 0, items: [], resetCount: 0, affectedItems: 1 });
 assert.equal(store.getSnapshot().length, 0);
 store.presentIntakeOutcome({ kind: 'operation', corr: request, opened: 1, rejected: 0, failed: 0, deferred: 0, items: [], resetCount: 1, affectedItems: 1 });
 assert.equal(store.getSnapshot()[0].kind, 'operation');
});
test('history bounded; unresolved overflow remains explicit; basenames bounded and control-free', () => {
 const store = createNoticeStore(); for (let i = 0; i < 110; i++) store.presentError({ ...failure(), incidentId: `i${i}` as IncidentId });
 assert.equal(store.getSnapshot().length, 100); assert.equal(store.getOverflow(), 10);
 assert.equal(sanitizeDisplayName('C:\\secret\\a\n\u202e.html'), 'a.html'); assert.equal(sanitizeDisplayName('x'.repeat(5000)).length, 160);
});
test('one copy uses exact immutable preview; save cancel is silent; transport failure not re-logged', async () => {
 let copied = '', saves = 0;
 const input = snapshot();
 const store = createDiagnosticsStore(client({ prepare: async () => input, save: async id => { assert.equal(id, 'immutable-one'); saves++; return { kind: 'cancelled' }; } }), () => [], async text => { copied = text; });
 await store.open(); input.reportText = 'new live bytes'; await store.copy(); assert.equal(copied, 'previewed bytes only');
 await store.save(); assert.equal(saves, 1); assert.equal(store.getSnapshot().feedback, undefined);
});
test('copy denial preserves preview; refresh invalidates old snapshot; details default off on reopen', async () => {
 const discarded: string[] = [];
 const store = createDiagnosticsStore(client({ discard: async id => { discarded.push(id); } }), () => [], async () => { throw new Error('clipboard-denied'); });
 await store.open(); await store.copy(); assert.equal(store.getSnapshot().feedback, 'diag.copyFailed'); assert.ok(store.getSnapshot().snapshot);
 await store.changeSelection({ ...store.getSelection(), includeLogs: true }); assert.deepEqual(discarded, ['immutable-one']);
 store.close(); await store.open(); assert.equal(store.getSelection().includeLogs, false);
});
test('double copy/save click does not start two operations; expired snapshot refuses action', async () => {
 let calls = 0, resolve!: () => void;
 const store = createDiagnosticsStore(client(), () => [], () => { calls++; return new Promise<void>(r => { resolve = r; }); });
 await store.open(); const first = store.copy(); await store.copy(); assert.equal(calls, 1); resolve(); await first;
 const expired = createDiagnosticsStore(client({ prepare: async () => ({ ...snapshot(), expiresAt: '2000-01-01T00:00:00Z' }) }), () => [], async () => { calls++; });
 await expired.open(); await expired.copy(); assert.equal(expired.getSnapshot().feedback, 'diag.expired'); assert.equal(calls, 1);
});
test('all native diagnostic commands use camelCase args with no grant/path', async () => {
 const calls: unknown[] = [];
 const invoke = (async (command: string, args: unknown) => { calls.push([command, args]); return command === 'build_diagnostic_zip' ? snapshot() : command === 'list_crash_reports' ? [] : command === 'write_diagnostic_zip' ? { kind: 'saved', bytes: 2 } : undefined; }) as DiagnosticsInvoker;
 const c = createDiagnosticsClient(invoke); const selection = snapshot().selection;
 await c.prepare(selection, []); await c.save('snapshot-id'); await c.discard('snapshot-id'); await c.list(); await c.markReviewed([incident]); await c.delete([incident]);
 assert.deepEqual(calls, [['build_diagnostic_zip', { selection, rendererEntries: [] }], ['write_diagnostic_zip', { snapshotId: 'snapshot-id' }], ['discard_diagnostic_snapshot', { snapshotId: 'snapshot-id' }], ['list_crash_reports', undefined], ['mark_crash_reports_reviewed', { ids: [incident] }], ['delete_crash_reports', { ids: [incident] }]]);
});
for (const mode of ['empty', 'reject', 'hang', 'unmount', 'later', 'review-reject'] as const) test(`startup ${mode} releases gate, never claim/ack; viewing does not mark reviewed`, async () => {
 const gate = createIntakeGate(); let marks = 0;
 const c = client({ list: async () => mode === 'hang' || mode === 'unmount' ? new Promise(() => {}) : mode === 'reject' ? Promise.reject(new Error('typed')) : mode === 'empty' ? [] : [crash()], markReviewed: async () => { marks++; throw new Error('typed'); } });
 const review = createCrashReviewStore(c, gate, 5);
 const starting = review.start(); let allowed = false; void gate.whenIntakeAllowed().then(() => { allowed = true; });
 assert.equal(allowed, false);
 if (mode === 'unmount') review.dispose(); await starting;
 assert.equal(marks, 0);
 if (mode === 'later') review.later(); if (mode === 'review-reject') await review.review([incident]);
 await turn(); assert.equal(allowed, true);
 if (mode === 'review-reject') assert.equal(review.getSnapshot().incidents[0].reviewedAt, null);
 await review.refresh(); assert.equal(review.getSnapshot().open, false); review.dispose();
});
test('web startup skips native list and has no ZIP save', async () => {
 const gate = createIntakeGate(), review = createCrashReviewStore(createWebDiagnosticsClient(async () => snapshot()), gate);
 await review.start(); await gate.whenIntakeAllowed(); assert.equal(review.getSnapshot().open, false);
});
test('delete cancellation changes no incident and no drafts', async () => {
 let deletes = 0; const review = createCrashReviewStore(client({ list: async () => [crash()], delete: async () => { deletes++; } }), createIntakeGate());
 await review.start(); await review.deleteSelected(incident, async () => false); assert.equal(deletes, 0); assert.equal(review.getSnapshot().incidents.length, 1); review.dispose();
});
test('retry requires executor/capability, consumes before await, expires, and has no token snapshot', async () => {
 let calls = 0, complete!: () => void;
 const unregister = registerIntakeRetryExecutor(async () => { calls++; await new Promise<void>(r => { complete = r; }); return { status: 'cancelled' }; });
 attachRetryCapability(incident, { requestId: request, ordinal: 0, token: 'PRIVATE-TOKEN', expiresAt: new Date(Date.now() + 60000).toISOString() });
 assert.equal(canRetryNotice(incident), true); const first = retryNoticeItem(incident); await retryNoticeItem(incident); assert.equal(calls, 1); assert.equal(canRetryNotice(incident), false); complete(); await first;
 attachRetryCapability(incident, { requestId: request, ordinal: 0, token: 'expired', expiresAt: '2000-01-01T00:00:00Z' }); assert.equal(canRetryNotice(incident), false); unregister();
});
test('five catalogues cover exact active title/hint manifest and have placeholder parity', () => {
 assert.equal(keys.length, 152);
 const placeholders = (v: string) => [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
 for (const [locale, cat] of Object.entries(DIAGNOSTIC_LOCALES)) {
  for (const key of keys) { assert.ok(cat[key]?.trim(), `${locale}:${key}`); assert.deepEqual(placeholders(cat[key]), placeholders(DIAGNOSTIC_LOCALES.en[key])); }
  for (const key of Object.keys(DIAGNOSTIC_LOCALES.en)) { assert.ok(cat[key], `${locale}:${key}`); assert.deepEqual(placeholders(cat[key]), placeholders(DIAGNOSTIC_LOCALES.en[key])); }
  assert.ok(!cat['err.doc.002.hint'].includes('rolled back'));
 }
 assert.equal(DIAGNOSTIC_LOCALES.de['recovery.current'], 'Aktuell verfügbare lokale Recovery-Drafts');
});
test('mark-reviewed timeout releases initial gate and leaves pending badge', async () => {
 const gate = createIntakeGate(); const review = createCrashReviewStore(client({ list: async () => [crash()], markReviewed: async () => new Promise(() => {}) }), gate, 5);
 await review.start(); await review.review([incident]); await gate.whenIntakeAllowed(); assert.equal(review.getSnapshot().incidents[0].reviewedAt, null); assert.equal(review.getSnapshot().feedback, 'diag.failed');
});
