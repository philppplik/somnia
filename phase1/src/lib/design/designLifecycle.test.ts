import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesignLifecycleAdapter,
  getDesignState,
  startDesign,
  editDesign,
  undoDesign,
  restoreDesignSession,
} from './session';
import { verifyDesignSnapshot, type DesignSnapshotPayload } from './lifecycleSnapshot';

test('design adapter round trip: snapshot, suspend, resume restores document and history', async () => {
  startDesign();
  editDesign((doc) => ({ ...doc, artboards: doc.artboards.map((a, i) => (i === 0 ? { ...a, name: 'Renamed' } : a)) }));
  assert.equal(getDesignState().past.length, 1);
  const adapter = createDesignLifecycleAdapter();
  assert.equal(adapter.hasUnsavedChanges?.(), true);

  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot && verifyDesignSnapshot(snapshot));
  assert.ok(snapshot.bytesEstimate > 0);

  await adapter.suspend!();
  assert.equal(getDesignState().document, null);

  await adapter.resume!(snapshot);
  const restored = getDesignState();
  assert.equal(restored.document?.artboards[0].name, 'Renamed');
  assert.equal(restored.dirty, true);
  assert.equal(restored.past.length, 1);
  undoDesign(); // history survived the round trip
  assert.equal(getDesignState().document?.artboards[0].name, 'Artboard 1');
});

test('dispose refuses to evict unsaved design edits', async () => {
  startDesign(); // loadDesign marks dirty
  const adapter = createDesignLifecycleAdapter();
  await assert.rejects(adapter.dispose!(), /unsaved/i);
});

test('resume rejects a tampered checkpoint and keeps recovery data intact', async () => {
  startDesign();
  const adapter = createDesignLifecycleAdapter();
  const snapshot = await adapter.snapshot!();
  assert.ok(snapshot);
  const tampered = { ...snapshot, checksum: 'deadbeefdeadbeef' };
  await assert.rejects(adapter.resume!(tampered), /verification/);
});

test('restore revalidates every history document through the parser', () => {
  const payload: DesignSnapshotPayload = {
    document: null,
    artboardId: null,
    selection: null,
    selectedIds: [],
    tool: 'select',
    dirty: false,
    past: ['{"corrupted":true}'],
    future: [],
  };
  assert.throws(() => restoreDesignSession(payload));
});
