import test from 'node:test';
import assert from 'node:assert/strict';
import { collectErrorReport, mergeReportEntries, reportEvent } from './errorReport';
const entry = { v: 2, session: 's1', source: 'ts', seq: 1, id: 'SOM-DOC-002', ts: '2026-10-10T16:00:00.000Z', level: 'error' };
test('native tail failure retains safe renderer events without exporting the exception', async () => {
 const text = await collectErrorReport(150, { nativeTail: async () => { throw new Error('secret.pdf'); }, renderer: () => [entry], header: () => 'Somnia dev', now: () => entry.ts });
 assert.match(text, /SOM-DOC-002/); assert.match(text, /partial/); assert.doesNotMatch(text, /secret.pdf/);
});
test('merge keys include session source seq and window; timestamp is not identity', () => {
 assert.equal(mergeReportEntries([entry], [{ ...entry, ts: '2026-10-10T16:01:00.000Z' }]).length, 1);
 assert.equal(mergeReportEntries([entry], [{ ...entry, source: 'rust' }, { ...entry, session: 's2' }, { ...entry, window: 'other' }]).length, 4);
});
test('fatal is opt-in and free text, paths, credentials and recovery claims do not export', () => {
 const safe = reportEvent({ ...entry, message: 'poison.pdf', token: 'SECRET', recovery: { kind: 'incident-scoped' } });
 assert.equal(safe?.fatal, undefined); assert.doesNotMatch(JSON.stringify(safe), /poison|SECRET|recovery/);
 assert.equal(reportEvent({ ...entry, v: 1 }), null);
 assert.equal(reportEvent({ ...entry, seq: -1 }), null);
});
