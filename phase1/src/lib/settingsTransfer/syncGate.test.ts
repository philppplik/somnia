import test from 'node:test';
import assert from 'node:assert/strict';
import { isSyncPaused, pauseSync, resumeSync, subscribeSyncGate } from './syncGate';

test('sync gate pauses and resumes, notifies once per change, and unsubscribes', () => {
  let n = 0; const off = subscribeSyncGate(() => n++);
  assert.equal(isSyncPaused(), false);
  pauseSync(); pauseSync(); assert.equal(isSyncPaused(), true); assert.equal(n, 1);
  resumeSync(); resumeSync(); assert.equal(isSyncPaused(), false); assert.equal(n, 2);
  off(); pauseSync(); assert.equal(n, 2); resumeSync();
});
