import { checksumParts } from '../lifecycle/checksum';
import type { StudioSnapshot } from '../lifecycle/types';

/**
 * Pure snapshot helpers for the Vector studio lifecycle adapter. The vector
 * session is a JSON document plus bounded undo/redo history; snapshots
 * serialize both to flat strings with a checksum. Transient diagnostics and
 * errors are dropped: they are re-derivable and never authoritative.
 */
export interface VectorSnapshotPayload {
  name: string;
  /** JSON of VectorDocument. */
  doc: string;
  selection: readonly string[];
  tool: string;
  zoom: number;
  pan: { x: number; y: number };
  dirty: boolean;
  open: boolean;
  nodePath: string | null;
  selectedNode: string | null;
  /** JSON-serialized history documents. */
  past: readonly string[];
  future: readonly string[];
}

export const VECTOR_SNAPSHOT_SCHEMA = 1;

export function vectorSnapshotBytes(payload: VectorSnapshotPayload): number {
  let total = 1024 + payload.name.length * 2;
  const add = (s: string): void => {
    total += s.length * 2;
  };
  add(payload.doc);
  payload.past.forEach(add);
  payload.future.forEach(add);
  return total;
}

export function vectorSnapshotChecksum(payload: VectorSnapshotPayload): string {
  return checksumParts([
    'vector',
    VECTOR_SNAPSHOT_SCHEMA,
    payload.name,
    payload.doc,
    payload.tool,
    payload.zoom,
    payload.pan.x,
    payload.pan.y,
    payload.dirty ? 1 : 0,
    payload.open ? 1 : 0,
    payload.selection.join(','),
    payload.nodePath,
    payload.selectedNode,
    payload.past.length,
    ...payload.past,
    payload.future.length,
    ...payload.future,
  ]);
}

export function verifyVectorSnapshot(snapshot: StudioSnapshot): snapshot is StudioSnapshot & { payload: VectorSnapshotPayload } {
  if (snapshot.studioId !== 'vector' || snapshot.schemaVersion !== VECTOR_SNAPSHOT_SCHEMA) return false;
  const payload = snapshot.payload as VectorSnapshotPayload | null;
  if (!payload || typeof payload.doc !== 'string' || !Array.isArray(payload.past) || !Array.isArray(payload.future)) return false;
  return vectorSnapshotChecksum(payload) === snapshot.checksum;
}
