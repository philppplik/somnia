/**
 * Portable setup file: build and parse. Pure. Format described in docs/concepts/settings-import-export.md and
 * docs/SETTINGS-TRANSFER.md. Parsing never writes anything; it returns a normalized, validated Setup plus the
 * entries it had to skip (with a reason, never with the skipped value).
 */
import { SETTINGS_REGISTRY, getSetting, isModified, type StateLike } from '../settingsRegistry';
import { validSettingValue } from '../settingsExport';
import { isValidShortcut } from '../shortcutTransfer';
import { categoryOf, isTransferable, TRANSFER_CATEGORIES, type TransferCategory } from './classify';
import { parseStrictJson } from './strictJson';

export const SETUP_SCHEMA_VERSION = 1;
export const SETUP_FILE_SUFFIX = '.somnia-settings.json';
export const MAX_LABEL_LENGTH = 80;

export interface Setup {
  readonly label: string;
  /** Overrides only: values that differ from the default. Absent = not part of the setup. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** Command ID -> shortcut. "" is an explicit unbind and differs from omission. */
  readonly shortcuts: Readonly<Record<string, string>>;
  /** Categories present in the file. */
  readonly categories: readonly TransferCategory[];
  readonly legacy?: 'settings-v1' | 'shortcuts' | 'sync-v1';
}
export interface Skipped { readonly kind: 'setting' | 'shortcut' | 'category' | 'entry'; readonly reason: 'unknown' | 'invalid' | 'not-transferable' | 'unknown-command' }
export type ParseOutcome =
  | { readonly ok: true; readonly setup: Setup; readonly skipped: readonly Skipped[] }
  | { readonly ok: false; readonly code: 'empty' | 'malformed' | 'not-somnia' | 'unsupported-newer' | 'unsupported-scope' | 'invalid'; readonly message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function sortedDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortedDeep);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortedDeep(v[k])]));
  return v;
}
export const cleanLabel = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, MAX_LABEL_LENGTH) : '';

export interface BuildInput {
  readonly state: StateLike;
  readonly shortcuts: Readonly<Record<string, string>>;
  readonly categories: readonly TransferCategory[];
  readonly label?: string;
}
/** Deterministic export: sorted keys, two-space indent, trailing newline. Only overrides of selected, transferable categories. */
export function buildSetup(input: BuildInput): string {
  const want = new Set(input.categories);
  const values: Record<string, unknown> = {};
  for (const e of SETTINGS_REGISTRY) {
    const c = categoryOf(e.id);
    if (!c || !isTransferable(e.id) || !want.has(c) || !isModified(input.state, e)) continue;
    values[e.id] = getSetting(input.state, e);
  }
  const categories: Record<string, unknown> = {};
  if (Object.keys(values).length) categories.settings = { mode: 'overrides', values };
  if (want.has('keybindings')) {
    const common: Record<string, string> = {};
    for (const [id, s] of Object.entries(input.shortcuts)) if (isValidShortcut(s)) common[id] = s;
    if (Object.keys(common).length) categories.keybindings = { common, platforms: {} };
  }
  const doc: Record<string, unknown> = { app: 'somnia', kind: 'setup', schemaVersion: SETUP_SCHEMA_VERSION, scope: 'user', categories };
  const label = cleanLabel(input.label);
  if (label) doc.label = label;
  return JSON.stringify(sortedDeep(doc), null, 2) + '\n';
}

function readSettings(raw: unknown, skipped: Skipped[]): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  if (!isObj(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const e = SETTINGS_REGISTRY.find((x) => x.id === id);
    if (!e) { skipped.push({ kind: 'setting', reason: 'unknown' }); continue; }
    if (!isTransferable(id)) { skipped.push({ kind: 'setting', reason: 'not-transferable' }); continue; }
    if (!validSettingValue(e, v)) { skipped.push({ kind: 'setting', reason: 'invalid' }); continue; }
    out[id] = v;
  }
  return out;
}
function readShortcuts(raw: unknown, known: ReadonlySet<string>, skipped: Skipped[]): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  if (!isObj(raw)) return out;
  for (const [id, s] of Object.entries(raw)) {
    if (!known.has(id)) { skipped.push({ kind: 'shortcut', reason: 'unknown-command' }); continue; }
    if (!isValidShortcut(s)) { skipped.push({ kind: 'shortcut', reason: 'invalid' }); continue; }
    out[id] = s;
  }
  return out;
}
const categoriesOf = (settings: Record<string, unknown>, hasShortcuts: boolean): TransferCategory[] => {
  const present = new Set<TransferCategory>();
  for (const id of Object.keys(settings)) { const c = categoryOf(id); if (c) present.add(c); }
  if (hasShortcuts) present.add('keybindings');
  return TRANSFER_CATEGORIES.filter((c) => present.has(c));
};

/**
 * Parse an untrusted file. `knownCommands` is the host's command-ID list; unknown commands are skipped visibly.
 * Legacy files (settings-v1, plain shortcut object, sync-v1) are accepted only when they match their narrow shape,
 * and are always treated as overrides for Merge preview, never as an implicit "reset everything else".
 */
export function parseSetup(text: string, knownCommands: readonly string[]): ParseOutcome {
  const read = parseStrictJson(text);
  if (!read.ok) return read.error === 'File is empty' ? { ok: false, code: 'empty', message: read.error } : { ok: false, code: 'malformed', message: read.error };
  const raw = read.value;
  if (!isObj(raw)) return { ok: false, code: 'not-somnia', message: 'Not a Somnia setup file' };
  const known = new Set(knownCommands);
  const skipped: Skipped[] = [];

  // Legacy adapters. Explicit detection only.
  if (raw.kind === 'settings' && raw.app === 'somnia' && raw.version === 1 && isObj(raw.settings)) {
    const settings = readSettings(raw.settings, skipped);
    return { ok: true, setup: { label: '', settings, shortcuts: Object.create(null), categories: categoriesOf(settings, false), legacy: 'settings-v1' }, skipped };
  }
  if (raw.kind === 'sync' && raw.app === 'somnia' && raw.version === 1 && isObj(raw.settings) && isObj(raw.shortcuts)) {
    const settings = readSettings(raw.settings, skipped), shortcuts = readShortcuts(raw.shortcuts, known, skipped);
    return { ok: true, setup: { label: '', settings, shortcuts, categories: categoriesOf(settings, Object.keys(shortcuts).length > 0), legacy: 'sync-v1' }, skipped };
  }
  if (!own(raw, 'app') && !own(raw, 'kind') && Object.values(raw).length > 0 && Object.values(raw).every((v) => typeof v === 'string')) {
    const shortcuts = readShortcuts(raw, known, skipped);
    return { ok: true, setup: { label: '', settings: Object.create(null), shortcuts, categories: categoriesOf({}, Object.keys(shortcuts).length > 0), legacy: 'shortcuts' }, skipped };
  }

  if (raw.app !== 'somnia' || raw.kind !== 'setup') return { ok: false, code: 'not-somnia', message: 'Not a Somnia setup file' };
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) return { ok: false, code: 'invalid', message: 'Missing or invalid schemaVersion' };
  if (raw.schemaVersion > SETUP_SCHEMA_VERSION) return { ok: false, code: 'unsupported-newer', message: 'This file needs a newer version of Somnia' };
  if (raw.scope !== 'user') return { ok: false, code: 'unsupported-scope', message: 'Only user-scope setups can be imported here' };
  if (!isObj(raw.categories)) return { ok: false, code: 'invalid', message: 'Missing categories' };

  let settings: Record<string, unknown> = Object.create(null), shortcuts: Record<string, string> = Object.create(null);
  for (const [name, body] of Object.entries(raw.categories)) {
    if (name === 'settings') {
      if (!isObj(body) || body.mode !== 'overrides' || !isObj(body.values)) return { ok: false, code: 'invalid', message: 'Invalid settings category' };
      settings = readSettings(body.values, skipped);
    } else if (name === 'keybindings') {
      if (!isObj(body) || !isObj(body.common)) return { ok: false, code: 'invalid', message: 'Invalid keybindings category' };
      shortcuts = readShortcuts(body.common, known, skipped);
      if (isObj(body.platforms) && Object.keys(body.platforms).length) skipped.push({ kind: 'category', reason: 'unknown' });
    } else skipped.push({ kind: 'category', reason: 'unknown' });
  }
  return { ok: true, setup: { label: cleanLabel(raw.label), settings, shortcuts, categories: categoriesOf(settings, Object.keys(shortcuts).length > 0) }, skipped };
}
