/**
 * Applying a reviewed plan: pre-import snapshot, typed transactional write with rollback, undo and retention.
 * Pure core with injected adapters, so nothing here touches storage by itself.
 */
import { SETTINGS_REGISTRY, getSetting, type StateLike } from '../settingsRegistry';
import { transferableSettings } from './classify';
import { targetRevision, type Plan, type PlanRow, type Target } from './plan';

export type Resolution = 'skip' | 'replace';
export interface Review {
  /** Row keys the user left checked. Anything not listed is untouched. */
  readonly selectedKeys: ReadonlySet<string>;
  /** Conflict rows: 'replace' takes the incoming key and unbinds the other commands; default is 'skip'. */
  readonly resolutions?: Readonly<Record<string, Resolution>>;
  /** Replace mode only: the reset count the user acknowledged. Must equal the count of selected reset rows. */
  readonly acknowledgedResets?: number;
}
export interface Snapshot {
  readonly schemaVersion: 1;
  readonly createdAt: number;
  readonly revision: string;
  /** Stored values of every transferable setting and all shortcuts. Never keys, tokens, documents or project data. */
  readonly settings: Readonly<Record<string, unknown>>;
  readonly shortcuts: Readonly<Record<string, string>>;
}
export const takeSnapshot = (t: Target, now: number): Snapshot => {
  const settings: Record<string, unknown> = {};
  for (const e of transferableSettings()) settings[e.id] = getSetting(t.state, e);
  return { schemaVersion: 1, createdAt: now, revision: targetRevision(t), settings, shortcuts: { ...t.shortcuts } };
};

export interface Change { readonly settings: Readonly<Record<string, unknown>>; readonly shortcuts: Readonly<Record<string, string | null>> }
export type ChangeResult = { ok: true; change: Change; applied: number; skipped: number } | { ok: false; code: 'stale' | 'ack-required' | 'nothing-selected'; message: string };

/** Compute the exact write set. Rejects when the target changed since the plan was made. */
export function buildChange(plan: Plan, target: Target, review: Review): ChangeResult {
  if (targetRevision(target) !== plan.revision) return { ok: false, code: 'stale', message: 'Your settings changed since the preview. Review the import again.' };
  const rows: PlanRow[] = plan.rows.filter((r) => review.selectedKeys.has(r.key) && r.status !== 'same');
  const resets = rows.filter((r) => r.status === 'reset').length;
  if (plan.mode === 'replace' && resets > 0 && review.acknowledgedResets !== resets) return { ok: false, code: 'ack-required', message: `Confirm the ${resets} reset(s) before applying.` };
  const settings: Record<string, unknown> = {}, shortcuts: Record<string, string | null> = {};
  let applied = 0;
  for (const r of rows) {
    if (r.kind === 'setting') { settings[r.id] = r.proposed; applied++; continue; }
    if (r.status === 'conflict') {
      if ((review.resolutions?.[r.key] ?? 'skip') !== 'replace') continue;
      for (const other of r.conflictsWith ?? []) if (!(other in shortcuts)) shortcuts[other] = '';
    }
    shortcuts[r.id] = r.proposed === undefined ? null : String(r.proposed);
    applied++;
  }
  if (!applied) return { ok: false, code: 'nothing-selected', message: 'Nothing selected to apply.' };
  return { ok: true, change: { settings, shortcuts }, applied, skipped: plan.rows.length - applied };
}

/** Typed adapters supplied by the host. Each write must be all-or-nothing on its own. */
export interface Adapters {
  saveSnapshot(s: Snapshot): Promise<void>;
  writeSettings(values: Readonly<Record<string, unknown>>): Promise<void>;
  /** value null = remove the override entirely. */
  writeShortcuts(map: Readonly<Record<string, string | null>>): Promise<void>;
}
export type ApplyOutcome =
  | { status: 'applied'; snapshot: Snapshot; applied: number }
  | { status: 'blocked'; reason: 'backup-failed' }
  | { status: 'rolled-back'; failed: 'settings' | 'shortcuts' }
  | { status: 'rollback-failed'; failed: 'settings' | 'shortcuts'; incomplete: readonly ('settings' | 'shortcuts')[] };

/** Snapshot first (failure stops everything), then write; any failure rolls every adapter back to the snapshot. */
export async function applyChange(change: Change, target: Target, a: Adapters, now: number): Promise<ApplyOutcome & { applied?: number }> {
  const snap = takeSnapshot(target, now);
  try { await a.saveSnapshot(snap); } catch { return { status: 'blocked', reason: 'backup-failed' }; }
  const done: ('settings' | 'shortcuts')[] = [];
  const undo = async (failed: 'settings' | 'shortcuts'): Promise<ApplyOutcome> => {
    const incomplete: ('settings' | 'shortcuts')[] = [];
    // Roll back the failed adapter too: its write may have been partially visible.
    for (const step of [failed, ...done.slice().reverse()]) {
      try {
        if (step === 'settings') await a.writeSettings(snapshotSettingsFor(snap, change.settings));
        else await a.writeShortcuts(snapshotShortcutsFor(snap, change.shortcuts));
      } catch { incomplete.push(step); }
    }
    return incomplete.length ? { status: 'rollback-failed', failed, incomplete } : { status: 'rolled-back', failed };
  };
  if (Object.keys(change.settings).length) {
    try { await a.writeSettings(change.settings); done.push('settings'); } catch { return undo('settings'); }
  }
  if (Object.keys(change.shortcuts).length) {
    try { await a.writeShortcuts(change.shortcuts); done.push('shortcuts'); } catch { return undo('shortcuts'); }
  }
  return { status: 'applied', snapshot: snap, applied: Object.keys(change.settings).length + Object.keys(change.shortcuts).length };
}
const snapshotSettingsFor = (s: Snapshot, touched: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.keys(touched).map((id) => [id, s.settings[id] ?? SETTINGS_REGISTRY.find((e) => e.id === id)?.default]));
const snapshotShortcutsFor = (s: Snapshot, touched: Readonly<Record<string, string | null>>): Record<string, string | null> =>
  Object.fromEntries(Object.keys(touched).map((id) => [id, Object.prototype.hasOwnProperty.call(s.shortcuts, id) ? s.shortcuts[id] : null]));

/** Restore plan from a snapshot: only values that differ, previewed like any import; revision-checked on apply. */
export function restoreChange(snap: Snapshot, target: Target): { change: Change; revision: string; differing: number } {
  const settings: Record<string, unknown> = {}, shortcuts: Record<string, string | null> = {};
  for (const e of transferableSettings()) { const cur = getSetting(target.state, e); if (Object.prototype.hasOwnProperty.call(snap.settings, e.id) && JSON.stringify(cur) !== JSON.stringify(snap.settings[e.id])) settings[e.id] = snap.settings[e.id]; }
  for (const [id, k] of Object.entries(snap.shortcuts)) if (target.shortcuts[id] !== k) shortcuts[id] = k;
  for (const id of Object.keys(target.shortcuts)) if (!Object.prototype.hasOwnProperty.call(snap.shortcuts, id)) shortcuts[id] = null;
  return { change: { settings, shortcuts }, revision: targetRevision(target), differing: Object.keys(settings).length + Object.keys(shortcuts).length };
}

export const MAX_SNAPSHOTS = 10;
export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
/** Newest first; keep at most 10 snapshots within 10 MiB (UTF-8 of their JSON). */
export function pruneSnapshots(list: readonly Snapshot[]): Snapshot[] {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  const out: Snapshot[] = []; let bytes = 0;
  for (const s of sorted) {
    const n = new TextEncoder().encode(JSON.stringify(s)).length;
    if (out.length >= MAX_SNAPSHOTS || bytes + n > MAX_SNAPSHOT_BYTES) break;
    out.push(s); bytes += n;
  }
  return out;
}
export type { StateLike };
