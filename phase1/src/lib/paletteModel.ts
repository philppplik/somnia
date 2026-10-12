/**
 * Pure model behind the command palette (engine-hardening plan, wave B: palette).
 *
 * The dispatcher is the source of truth: every spec registered through registerCommandSpec
 * is listed from `dispatcher.list()` (title, keywords, shortcut, params). Commands that have
 * not been migrated yet exist only in the legacy registry; they are appended so the palette
 * keeps showing everything while areas migrate. The legacy list already carries translated
 * titles, scoped overrides and user shortcut overrides, so it supplies those for both kinds.
 * No React and no app imports here: the palette component stays a thin UI over this.
 */
import type { CommandCategory, CommandSpec } from './commandSpec';

/** Structural view of a legacy registry entry (see commands.ts Command). */
export interface PaletteLegacyCommand { id: string; title: string; category: CommandCategory; shortcut?: string; keywords?: string[] }

/** One simple prompt per required param. */
export interface PaletteParam { name: string; label: string; type: 'string' | 'number' | 'integer' | 'boolean'; enum?: readonly unknown[] }

export interface PaletteEntry {
  id: string;
  title: string;
  category: CommandCategory;
  shortcut?: string;
  keywords: readonly string[];
  /** Required params that must be asked for before running. Empty for most commands. */
  params: readonly PaletteParam[];
  /** True when the entry comes from a dispatcher spec (false: legacy-only). */
  spec: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Required params of a spec as prompts. Only simple scalar types are promptable; others are skipped (callers pass them programmatically). */
export function paramPrompts(schema: Record<string, unknown> | undefined): PaletteParam[] {
  if (!schema || !isObj(schema.properties) || !Array.isArray(schema.required)) return [];
  const out: PaletteParam[] = [];
  for (const name of schema.required) {
    if (typeof name !== 'string') continue;
    const prop = schema.properties[name];
    if (!isObj(prop)) continue;
    const type = prop.type;
    if (type !== 'string' && type !== 'number' && type !== 'integer' && type !== 'boolean') continue;
    const label = typeof prop.title === 'string' && prop.title ? prop.title : name;
    out.push({ name, label, type, ...(Array.isArray(prop.enum) ? { enum: prop.enum } : {}) });
  }
  return out;
}

/** Builds the palette list: dispatcher specs first, then legacy-only commands. */
export function buildPaletteEntries(specs: readonly CommandSpec<unknown, unknown>[], legacy: readonly PaletteLegacyCommand[]): PaletteEntry[] {
  const legacyById = new Map(legacy.map(c => [c.id, c]));
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const spec of specs) {
    seen.add(spec.id);
    const mirrored = legacyById.get(spec.id);
    const shortcut = mirrored ? mirrored.shortcut : spec.shortcut;
    out.push({
      id: spec.id,
      title: mirrored?.title ?? spec.title,
      category: spec.category,
      ...(shortcut ? { shortcut } : {}),
      keywords: spec.keywords ?? mirrored?.keywords ?? [],
      params: paramPrompts(spec.params),
      spec: true,
    });
  }
  for (const c of legacy) {
    if (seen.has(c.id)) continue;
    out.push({ id: c.id, title: c.title, category: c.category, ...(c.shortcut ? { shortcut: c.shortcut } : {}), keywords: c.keywords ?? [], params: [], spec: false });
  }
  return out;
}

/** Ordered-subsequence fuzzy score (lower is better, -1 = no match). Same rule the palette always used. */
export function fuzzyScore(text: string, query: string): number {
  let position = 0, total = 0;
  for (const character of query) {
    const at = text.indexOf(character, position);
    if (at < 0) return -1;
    total += at - position;
    position = at + 1;
  }
  return total;
}

export function rankEntries(entries: readonly PaletteEntry[], rawQuery: string, recent: readonly string[]): PaletteEntry[] {
  const query = rawQuery.toLowerCase().replace(/^>/, '').trim();
  const rank = (id: string) => recent.indexOf(id) + 1 || 99;
  return entries
    .map(entry => ({ entry, score: fuzzyScore(`${entry.title} ${entry.keywords.join(' ')}`.toLowerCase(), query) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => (query ? a.score - b.score : rank(a.entry.id) - rank(b.entry.id)))
    .map(item => item.entry);
}

/** Converts one typed answer to the param's JSON type. Returns undefined when it does not parse. */
export function coerceParam(param: PaletteParam, text: string): unknown {
  const value = text.trim();
  let out: unknown;
  if (param.type === 'string') out = text;
  else if (param.type === 'boolean') out = /^(true|yes|y|1|on)$/i.test(value) ? true : /^(false|no|n|0|off)$/i.test(value) ? false : undefined;
  else {
    const n = Number(value);
    out = value !== '' && Number.isFinite(n) && (param.type === 'number' || Number.isInteger(n)) ? n : undefined;
  }
  if (out === undefined) return undefined;
  if (param.type === 'string' && out === '') return undefined;
  if (param.enum && !param.enum.includes(out)) return undefined;
  return out;
}
