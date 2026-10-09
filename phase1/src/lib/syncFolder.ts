/** Sync folder: one portable file (somnia-sync.json) with user settings and shortcuts. Newer version wins. Pure core, host calls injected. */
import { exportSettings, importPatch, parseSettingsImport } from './settingsExport';
import { parseShortcutFile } from './shortcutTransfer';
import type { StateLike } from './settingsRegistry';

export interface SyncPayload { readonly updatedAt: number; readonly settings: Record<string, unknown>; readonly shortcuts: Record<string, string> }
export type SyncAction = 'write' | 'apply' | 'noop';
export interface SyncMeta { readonly lastSynced: string | null; readonly localSnapshot: string | null; readonly localChangedAt: number }

const EMPTY = '{"settings":{},"shortcuts":{}}';
/** Canonical, time-free content: the thing that is compared. */
export function snapshot(state: StateLike, shortcuts: Record<string, string>): string {
  const settings = JSON.parse(exportSettings(state)).settings as Record<string, unknown>;
  const sc = Object.fromEntries(Object.entries(shortcuts).sort(([a], [b]) => (a < b ? -1 : 1)));
  const sorted = Object.fromEntries(Object.entries(settings).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({ settings: sorted, shortcuts: sc });
}
export function payloadText(snap: string, updatedAt: number): string {
  const { settings, shortcuts } = JSON.parse(snap);
  return JSON.stringify({ app: 'somnia', kind: 'sync', version: 1, updatedAt, settings, shortcuts }, null, 2) + '\n';
}
export interface ParsedRemote { readonly snap: string; readonly updatedAt: number; readonly accepted: Record<string, unknown>; readonly shortcuts: Record<string, string>; readonly warnings: string[] }
/** Validates through the same parsers as manual import: unknown or invalid entries are skipped, never installed. */
export function parseRemote(text: string, modifiedMs: number, knownCommands: readonly string[]): ParsedRemote | null {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || raw.app !== 'somnia' || raw.kind !== 'sync' || raw.version !== 1) return null;
  const s = parseSettingsImport(JSON.stringify({ app: 'somnia', kind: 'settings', version: 1, settings: raw.settings ?? {} }));
  const warnings = [...s.warnings];
  let shortcuts: Record<string, string> = {};
  try { shortcuts = parseShortcutFile(JSON.stringify(raw.shortcuts ?? {}), knownCommands); } catch (e) { warnings.push(String((e as Error).message)); }
  const sorted = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : modifiedMs;
  return { snap: JSON.stringify({ settings: sorted(s.accepted), shortcuts: sorted(shortcuts) }), updatedAt, accepted: s.accepted, shortcuts, warnings };
}
/** The rule: absent -> write; equal -> nothing; only one side changed since the last sync -> that side wins; both changed -> newer wins. */
export function decide(localSnap: string, remote: { snap: string; updatedAt: number } | null, meta: SyncMeta, now: number): { action: SyncAction; both: boolean; localChangedAt: number } {
  const localChangedAt = meta.localSnapshot === localSnap ? meta.localChangedAt : now;
  if (!remote) return { action: 'write', both: false, localChangedAt };
  if (remote.snap === localSnap) return { action: 'noop', both: false, localChangedAt };
  // First link: the baseline is "all defaults", so a machine without changes never overwrites the folder.
  const base = meta.lastSynced ?? EMPTY;
  const localChanged = localSnap !== base, remoteChanged = remote.snap !== base;
  if (localChanged && !remoteChanged) return { action: 'write', both: false, localChangedAt };
  if (!localChanged && remoteChanged) return { action: 'apply', both: false, localChangedAt };
  return { action: remote.updatedAt > localChangedAt ? 'apply' : 'write', both: true, localChangedAt };
}
export { importPatch };

export interface SyncHost {
  status(): Promise<string | null>; choose(): Promise<string | null>; clear(): Promise<void>;
  read(): Promise<{ content: string; modifiedMs: number } | null>; write(content: string): Promise<void>;
}
export function nativeSyncHost(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): SyncHost {
  return {
    status: () => invoke('sync_status') as Promise<string | null>,
    choose: () => invoke('sync_choose') as Promise<string | null>,
    clear: async () => { await invoke('sync_clear'); },
    read: () => invoke('sync_read') as Promise<{ content: string; modifiedMs: number } | null>,
    write: async (content) => { await invoke('sync_write', { content }); },
  };
}
const META_KEY = 'somnia.sync.meta';
export function loadMeta(): SyncMeta {
  try { const v = JSON.parse(localStorage.getItem(META_KEY) || 'null'); if (v && typeof v.localChangedAt === 'number') return { lastSynced: v.lastSynced ?? null, localSnapshot: v.localSnapshot ?? null, localChangedAt: v.localChangedAt }; } catch { /* fresh */ }
  return { lastSynced: null, localSnapshot: null, localChangedAt: 0 };
}
export function saveMeta(m: SyncMeta) { localStorage.setItem(META_KEY, JSON.stringify(m)); }
export function clearMeta() { localStorage.removeItem(META_KEY); }

export interface SyncOutcome { readonly action: SyncAction; readonly both: boolean; readonly warnings: string[]; readonly patch?: Record<string, unknown>; readonly shortcuts?: Record<string, string> }
/** One sync pass. Applying remote returns a patch + shortcuts for the caller to install; writing sends local to the folder. */
export async function syncOnce(host: SyncHost, state: StateLike, shortcuts: Record<string, string>, known: readonly string[], now = Date.now()): Promise<SyncOutcome> {
  const local = snapshot(state, shortcuts);
  const meta = loadMeta();
  const file = await host.read();
  const remote = file ? parseRemote(file.content, file.modifiedMs, known) : null;
  const d = decide(local, remote, meta, now);
  if (d.action === 'write') {
    await host.write(payloadText(local, now));
    saveMeta({ lastSynced: local, localSnapshot: local, localChangedAt: now });
    return { action: 'write', both: d.both, warnings: [] };
  }
  if (d.action === 'apply' && remote) {
    saveMeta({ lastSynced: remote.snap, localSnapshot: remote.snap, localChangedAt: remote.updatedAt });
    return { action: 'apply', both: d.both, warnings: remote.warnings, patch: importPatch(state, remote.accepted), shortcuts: remote.shortcuts };
  }
  saveMeta({ lastSynced: local, localSnapshot: local, localChangedAt: d.localChangedAt });
  return { action: 'noop', both: false, warnings: remote?.warnings ?? [] };
}
