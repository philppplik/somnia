/**
 * Import planning. Pure: builds a reviewable plan from a parsed Setup and a snapshot of the target. Nothing is
 * written here. The plan carries the target revision so apply can detect that state changed after review.
 */
import { SETTINGS_REGISTRY, getSetting, type SettingEntry, type StateLike } from '../settingsRegistry';
import { categoryOf, isTransferable, transferableSettings, TRANSFER_CATEGORIES, type TransferCategory } from './classify';
import type { Setup } from './format';

export type ImportMode = 'merge' | 'replace';
export type RowStatus = 'add' | 'change' | 'same' | 'reset' | 'conflict';
export interface PlanRow {
  readonly key: string;            // "setting:<id>" or "shortcut:<commandId>"
  readonly kind: 'setting' | 'shortcut';
  readonly id: string;
  readonly category: TransferCategory;
  readonly status: RowStatus;
  readonly current: unknown;       // stored value in the target (undefined = not set)
  readonly incoming: unknown;      // value in the file (undefined for a reset row)
  readonly proposed: unknown;      // value after apply
  /** Shortcut rows: other commands that currently hold the incoming key. */
  readonly conflictsWith?: readonly string[];
}
export interface Target {
  readonly state: StateLike;
  /** Stored shortcut overrides ('' = unbound). */
  readonly shortcuts: Readonly<Record<string, string>>;
  /** Built-in default shortcut per command, so collisions with unchanged defaults are found. Optional. */
  readonly defaults?: Readonly<Record<string, string>>;
}
export interface Plan {
  readonly mode: ImportMode;
  readonly revision: string;
  readonly rows: readonly PlanRow[];
  readonly counts: Readonly<Record<RowStatus, number>>;
  readonly resetCount: number;
}
/** Stable string of everything an import can touch; changes whenever a reviewed value changes. */
export function targetRevision(t: Target): string {
  const s: Record<string, unknown> = {};
  for (const e of transferableSettings()) s[e.id] = getSetting(t.state, e);
  const sc = Object.fromEntries(Object.entries(t.shortcuts).sort(([a], [b]) => (a < b ? -1 : 1)));
  const text = JSON.stringify({ s, sc });
  let h = 0x811c9dc5; // FNV-1a, enough to detect change; not a security hash
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${text.length}:${h.toString(16)}`;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const entryOf = (id: string): SettingEntry => SETTINGS_REGISTRY.find((e) => e.id === id)!;
const normKey = (s: string): string => s.toLowerCase();
/** Markdown commands live in their own shortcut scope, as in the Shortcuts settings. */
const scopeOf = (cmd: string): string => (cmd.startsWith('md.') ? 'md' : 'main');

export interface PlanOptions { readonly mode: ImportMode; readonly categories: readonly TransferCategory[] }
export function planImport(setup: Setup, target: Target, opts: PlanOptions): Plan {
  const selected = new Set(opts.categories);
  const rows: PlanRow[] = [];
  // Settings present in the file.
  for (const [id, incoming] of Object.entries(setup.settings)) {
    const cat = categoryOf(id);
    if (!cat || !isTransferable(id) || !selected.has(cat)) continue;
    const e = entryOf(id), current = getSetting(target.state, e);
    rows.push({ key: `setting:${id}`, kind: 'setting', id, category: cat, status: same(current, incoming) ? 'same' : (same(current, e.default) ? 'add' : 'change'), current, incoming, proposed: incoming });
  }
  // Replace: reset omitted, currently modified settings, only inside selected categories.
  if (opts.mode === 'replace') {
    for (const e of transferableSettings()) {
      const cat = categoryOf(e.id)!;
      if (!selected.has(cat) || cat === 'keybindings' || Object.prototype.hasOwnProperty.call(setup.settings, e.id)) continue;
      const current = getSetting(target.state, e);
      if (same(current, e.default)) continue;
      rows.push({ key: `setting:${e.id}`, kind: 'setting', id: e.id, category: cat, status: 'reset', current, incoming: undefined, proposed: e.default });
    }
  }
  // Shortcuts.
  if (selected.has('keybindings')) {
    const defaults = target.defaults ?? {};
    // Effective bindings after import: built-in defaults, then this machine's overrides, then the file ('' = unbound).
    const final: Record<string, string> = { ...defaults };
    for (const [id, k] of Object.entries(target.shortcuts)) { if (k) final[id] = k; else delete final[id]; }
    const before = { ...final };
    for (const [id, k] of Object.entries(setup.shortcuts)) { if (k) final[id] = k; else delete final[id]; }
    if (opts.mode === 'replace') for (const id of Object.keys(target.shortcuts)) if (!Object.prototype.hasOwnProperty.call(setup.shortcuts, id)) { if (defaults[id]) final[id] = defaults[id]; else delete final[id]; }
    const holders = new Map<string, string[]>();
    for (const [cmd, k] of Object.entries(final)) { const n = scopeOf(cmd) + '|' + normKey(k); holders.set(n, [...(holders.get(n) ?? []), cmd]); }
    for (const [id, incoming] of Object.entries(setup.shortcuts)) {
      const current = target.shortcuts[id];
      const unchanged = current !== undefined ? current === incoming : (incoming === '' ? before[id] === undefined : false);
      if (unchanged) { rows.push({ key: `shortcut:${id}`, kind: 'shortcut', id, category: 'keybindings', status: 'same', current, incoming, proposed: incoming }); continue; }
      const clash = incoming ? (holders.get(scopeOf(id) + '|' + normKey(incoming)) ?? []).filter((c) => c !== id) : [];
      rows.push({ key: `shortcut:${id}`, kind: 'shortcut', id, category: 'keybindings', status: clash.length ? 'conflict' : (current === undefined ? 'add' : 'change'), current, incoming, proposed: incoming, ...(clash.length ? { conflictsWith: clash.sort() } : {}) });
    }
    if (opts.mode === 'replace') {
      for (const [id, current] of Object.entries(target.shortcuts)) {
        if (Object.prototype.hasOwnProperty.call(setup.shortcuts, id)) continue;
        rows.push({ key: `shortcut:${id}`, kind: 'shortcut', id, category: 'keybindings', status: 'reset', current, incoming: undefined, proposed: undefined });
      }
    }
  }
  const out = rows;
  out.sort((a, b) => TRANSFER_CATEGORIES.indexOf(a.category) - TRANSFER_CATEGORIES.indexOf(b.category) || (a.key < b.key ? -1 : 1));
  const counts: Record<RowStatus, number> = { add: 0, change: 0, same: 0, reset: 0, conflict: 0 };
  for (const r of out) counts[r.status]++;
  return { mode: opts.mode, revision: targetRevision(target), rows: out, counts, resetCount: counts.reset };
}
