import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';
import type { PhotoCrop, PhotoSettings } from './studioSettings';

/**
 * Pure snapshot helpers for the Photos lifecycle adapter. Kept free of
 * session, engine and DOM imports so the contract is unit-testable in Node.
 *
 * Recipe-only checkpoints (concept decision, perf review 2026-10-13): the
 * authoritative state is the develop settings with undo/redo history and the
 * saved signature. Source bytes are NOT stored; they stay with the media
 * item. On re-open of the same file (matching source URL fingerprint) the
 * settings are applied to the fresh session. Preview frames and the engine
 * are disposable and rebuilt.
 */
export interface PhotoSessionSnapshot {
  /** Media item name (session identity within the studio). */
  name: string;
  /** Source URL fingerprint at snapshot time; re-open skips sessions whose source moved. */
  source: string;
  now: PhotoSettings;
  past: readonly PhotoSettings[];
  future: readonly PhotoSettings[];
  /** photoSignature of the last exported settings: the dirty marker survives suspension. */
  saved: string;
  cropping: boolean;
  cropDraft: PhotoCrop | null;
}

export interface PhotosSnapshotPayload {
  sessions: readonly PhotoSessionSnapshot[];
}

export const PHOTOS_SNAPSHOT_SCHEMA = 1;

const sessionJson = (s: PhotoSessionSnapshot): string =>
  JSON.stringify([s.now, s.past, s.future, s.cropDraft]);

export function photosSnapshotBytes(payload: PhotosSnapshotPayload): number {
  let total = 0;
  for (const s of payload.sessions) {
    total += (s.name.length + s.source.length + s.saved.length) * 2;
    total += sessionJson(s).length * 2;
  }
  return total;
}

export function photosSnapshotChecksum(payload: PhotosSnapshotPayload): string {
  return checksumParts(payload.sessions.flatMap((s) => [
    s.name,
    s.source,
    s.saved,
    s.cropping ? 1 : 0,
    sessionJson(s),
  ]));
}

export function verifyPhotosSnapshot(snapshot: StudioSnapshot): boolean {
  if (snapshot.studioId !== 'photos' || snapshot.schemaVersion !== PHOTOS_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as PhotosSnapshotPayload | null;
  if (!payload || !Array.isArray(payload.sessions)) return false;
  for (const s of payload.sessions) {
    if (!s || typeof s.name !== 'string' || typeof s.source !== 'string' || !s.now || !Array.isArray(s.past) || !Array.isArray(s.future)) return false;
  }
  return snapshot.checksum === photosSnapshotChecksum(payload);
}
