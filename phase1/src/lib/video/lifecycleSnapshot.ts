import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';
import type { VideoFormat } from './recipe';
import type { TimelineClip } from './timeline';

/**
 * Pure snapshot helpers for the Video lifecycle adapter. Kept free of
 * session, engine and DOM imports so the contract is unit-testable in Node.
 *
 * Recipe-only checkpoints (concept decision, perf review 2026-10-13): the
 * authoritative state is the timeline (clips, selection, output format) plus
 * the identity of the source file. Source bytes are NOT stored; they stay
 * with the media item. On re-open of the same file (matching source URL
 * fingerprint) the timeline is applied to the fresh session. Probe results,
 * capabilities, exports and the filmstrip are disposable and rebuilt.
 */
export interface VideoSessionSnapshot {
  /** Media item name (session identity within the studio). */
  name: string;
  /** Source URL fingerprint at snapshot time; re-open skips sessions whose source moved. */
  source: string;
  ext: string;
  clips: readonly TimelineClip[];
  selectedClipId: string | null;
  format: VideoFormat;
}

export interface VideoSnapshotPayload {
  sessions: readonly VideoSessionSnapshot[];
}

export const VIDEO_SNAPSHOT_SCHEMA = 1;

export function videoSnapshotBytes(payload: VideoSnapshotPayload): number {
  let total = 0;
  for (const s of payload.sessions) {
    total += (s.name.length + s.source.length + s.ext.length + (s.selectedClipId?.length ?? 0)) * 2;
    total += JSON.stringify(s.clips).length * 2;
  }
  return total;
}

export function videoSnapshotChecksum(payload: VideoSnapshotPayload): string {
  return checksumParts(payload.sessions.flatMap((s) => [
    s.name,
    s.source,
    s.ext,
    s.selectedClipId,
    s.format,
    JSON.stringify(s.clips),
  ]));
}

export function verifyVideoSnapshot(snapshot: StudioSnapshot): boolean {
  if (snapshot.studioId !== 'video' || snapshot.schemaVersion !== VIDEO_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as VideoSnapshotPayload | null;
  if (!payload || !Array.isArray(payload.sessions)) return false;
  for (const s of payload.sessions) {
    if (!s || typeof s.name !== 'string' || typeof s.source !== 'string' || !Array.isArray(s.clips)) return false;
  }
  return snapshot.checksum === videoSnapshotChecksum(payload);
}
