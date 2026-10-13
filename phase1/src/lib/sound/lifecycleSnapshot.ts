import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';
import type { SoundSettings } from './recipe';

/**
 * Pure snapshot helpers for the Sound lifecycle adapter. Kept free of
 * session, engine and DOM imports so the contract is unit-testable in Node.
 *
 * Recipe-only checkpoints (concept decision, perf review 2026-10-13): the
 * authoritative state is the effect settings (the recipe), the pending
 * selection (regions) and the listen toggle. Source bytes are NOT stored;
 * they stay with the media item. On re-open of the same file (matching
 * source URL fingerprint) the recipe is applied to the fresh session and the
 * processed render is rebuilt by the engine. Decoded WAV versions and peaks
 * are disposable.
 */
export interface SoundSessionSnapshot {
  /** Media item name (session identity within the studio). */
  name: string;
  /** Source URL fingerprint at snapshot time; re-open skips sessions whose source moved. */
  source: string;
  settings: SoundSettings;
  selection: { start: number; end: number } | null;
  listen: 'original' | 'processed';
}

export interface SoundSnapshotPayload {
  sessions: readonly SoundSessionSnapshot[];
}

export const SOUND_SNAPSHOT_SCHEMA = 1;

const sessionJson = (s: SoundSessionSnapshot): string =>
  JSON.stringify([s.settings, s.selection]);

export function soundSnapshotBytes(payload: SoundSnapshotPayload): number {
  let total = 0;
  for (const s of payload.sessions) {
    total += (s.name.length + s.source.length + s.listen.length) * 2;
    total += sessionJson(s).length * 2;
  }
  return total;
}

export function soundSnapshotChecksum(payload: SoundSnapshotPayload): string {
  return checksumParts(payload.sessions.flatMap((s) => [
    s.name,
    s.source,
    s.listen,
    sessionJson(s),
  ]));
}

export function verifySoundSnapshot(snapshot: StudioSnapshot): boolean {
  if (snapshot.studioId !== 'sound' || snapshot.schemaVersion !== SOUND_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as SoundSnapshotPayload | null;
  if (!payload || !Array.isArray(payload.sessions)) return false;
  for (const s of payload.sessions) {
    if (!s || typeof s.name !== 'string' || typeof s.source !== 'string' || !s.settings) return false;
  }
  return snapshot.checksum === soundSnapshotChecksum(payload);
}
