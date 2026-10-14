/**
 * Host glue for setup transfer: turns a write set into a state patch (never resets anything else) and stores
 * restore points. Storage is injected so it can be tested. Restore points hold only transferable settings and shortcuts.
 */
import { SETTINGS_REGISTRY, type StateLike } from '../settingsRegistry';
import { pruneSnapshots, type Snapshot } from './apply';

/** State patch for the given setting values. Untouched fields of each group stay as they are. */
export function settingsPatch(state: StateLike, values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const patch: Record<string, any> = {};
  for (const [id, v] of Object.entries(values)) {
    const e = SETTINGS_REGISTRY.find((x) => x.id === id);
    if (!e) continue;
    if (!e.field) { patch[e.group] = v; continue; }
    patch[e.group] = { ...(patch[e.group] ?? state[e.group]), [e.field]: v };
  }
  return patch;
}

export const SNAPSHOT_KEY = 'somnia.settingsSnapshots.v1';
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const isSnapshot = (s: any): s is Snapshot => s && s.schemaVersion === 1 && typeof s.createdAt === 'number' && typeof s.revision === 'string' && s.settings && typeof s.settings === 'object' && s.shortcuts && typeof s.shortcuts === 'object';
export function readSnapshots(kv: KV): Snapshot[] {
  try { const v = JSON.parse(kv.getItem(SNAPSHOT_KEY) || '[]'); return Array.isArray(v) ? v.filter(isSnapshot) : []; } catch { return []; }
}
/** Saves a restore point and reads it back. Throws when it cannot be verified, so apply stops before any write. */
export function saveSnapshot(kv: KV, snap: Snapshot): void {
  const next = pruneSnapshots([snap, ...readSnapshots(kv)]);
  kv.setItem(SNAPSHOT_KEY, JSON.stringify(next));
  if (!readSnapshots(kv).some((s) => s.createdAt === snap.createdAt && s.revision === snap.revision)) throw new Error('restore point not stored');
}
export const latestSnapshot = (kv: KV): Snapshot | undefined => readSnapshots(kv).sort((a, b) => b.createdAt - a.createdAt)[0];
export function removeSnapshot(kv: KV, createdAt: number): void {
  kv.setItem(SNAPSHOT_KEY, JSON.stringify(readSnapshots(kv).filter((s) => s.createdAt !== createdAt)));
}
export const clearSnapshots = (kv: KV): void => kv.removeItem(SNAPSHOT_KEY);
