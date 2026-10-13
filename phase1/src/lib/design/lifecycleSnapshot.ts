import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';

/**
 * Pure snapshot helpers for the Design studio lifecycle adapter. The design
 * session is a JSON document plus undo/redo history; snapshots serialize both
 * to flat strings (cheaper than live object graphs) with a checksum.
 */
export interface DesignSnapshotPayload {
  /** JSON of DesignDocument, or null when no document is open. */
  document: string | null;
  artboardId: string | null;
  selection: string | null;
  selectedIds: readonly string[];
  tool: string;
  dirty: boolean;
  /** JSON-serialized history documents. */
  past: readonly string[];
  future: readonly string[];
}

export const DESIGN_SNAPSHOT_SCHEMA = 1;

export function designSnapshotBytes(payload: DesignSnapshotPayload): number {
  let total = 1024;
  const add = (s: string | null | undefined): void => {
    total += (s?.length ?? 0) * 2;
  };
  add(payload.document);
  payload.past.forEach(add);
  payload.future.forEach(add);
  return total;
}

export function designSnapshotChecksum(payload: DesignSnapshotPayload): string {
  return checksumParts([
    'design',
    DESIGN_SNAPSHOT_SCHEMA,
    payload.document,
    payload.artboardId,
    payload.selection,
    payload.tool,
    payload.dirty ? 1 : 0,
    payload.selectedIds.join(','),
    payload.past.length,
    ...payload.past,
    payload.future.length,
    ...payload.future,
  ]);
}

export function verifyDesignSnapshot(snapshot: StudioSnapshot): snapshot is StudioSnapshot & { payload: DesignSnapshotPayload } {
  if (snapshot.studioId !== 'design' || snapshot.schemaVersion !== DESIGN_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as DesignSnapshotPayload | null;
  if (!payload || !Array.isArray(payload.past) || !Array.isArray(payload.future)) return false;
  return designSnapshotChecksum(payload) === snapshot.checksum;
}
