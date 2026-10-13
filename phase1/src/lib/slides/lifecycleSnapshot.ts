import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';
import type { DeckSummary } from './protocol';
import type { TextRun } from './editCopy';

/**
 * Pure snapshot helpers for the Slides lifecycle pilot. Kept free of session,
 * worker and DOM imports so the contract is unit-testable in Node.
 * Authoritative recovery data: current edited package bytes plus undo/redo
 * history. Disposable resources (rendered slide, thumbnails, present cache,
 * WASM worker) are released on suspend and rebuilt on resume.
 */
export interface SlidesSessionSnapshot {
  /** Media item name (session identity within the studio). */
  name: string;
  /** Source URL fingerprint at snapshot time; resume skips sessions whose source moved. */
  source: string;
  revision: number;
  index: number;
  dirty: boolean;
  original: Uint8Array | null;
  working: Uint8Array | null;
  undo: readonly Uint8Array[];
  redo: readonly Uint8Array[];
  summary: DeckSummary | null;
  runs: readonly TextRun[];
}

export interface SlidesSnapshotPayload {
  sessions: readonly SlidesSessionSnapshot[];
}

export const SLIDES_SNAPSHOT_SCHEMA = 1;

export function slidesSnapshotBytes(payload: SlidesSnapshotPayload): number {
  let total = 0;
  const add = (b: Uint8Array | null | undefined): void => {
    total += b?.byteLength ?? 0;
  };
  for (const s of payload.sessions) {
    add(s.original);
    add(s.working);
    s.undo.forEach(add);
    s.redo.forEach(add);
    total += 1024; // metadata and summary allowance
  }
  return total;
}

export function slidesSnapshotChecksum(payload: SlidesSnapshotPayload): string {
  const parts: (string | number | Uint8Array | null)[] = ['slides', SLIDES_SNAPSHOT_SCHEMA];
  for (const s of payload.sessions) {
    parts.push(s.name, s.source, s.revision, s.index, s.dirty ? 1 : 0, s.working, s.original ?? null);
    parts.push(s.undo.length, s.redo.length);
    s.undo.forEach((b) => parts.push(b));
    s.redo.forEach((b) => parts.push(b));
  }
  return checksumParts(parts);
}

/** Verify identity, schema and integrity before a checkpoint is trusted. */
export function verifySlidesSnapshot(snapshot: StudioSnapshot): snapshot is StudioSnapshot & { payload: SlidesSnapshotPayload } {
  if (snapshot.studioId !== 'slides' || snapshot.schemaVersion !== SLIDES_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as SlidesSnapshotPayload | null;
  if (!payload || !Array.isArray(payload.sessions)) return false;
  return slidesSnapshotChecksum(payload) === snapshot.checksum;
}
