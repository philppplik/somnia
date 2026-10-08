/** One search over settings (registry, with synonyms) and commands/shortcuts, with @filters. Pure. */
import { SETTINGS_REGISTRY, isModified, searchRegistry, type SettingEntry, type StateLike } from './settingsRegistry';

export interface CommandLike { readonly id: string; readonly title: string; readonly category?: string; readonly shortcut?: string; readonly keywords?: readonly string[] }
export type UnifiedResult =
  | { readonly kind: 'setting'; readonly entry: SettingEntry; readonly modified: boolean }
  | { readonly kind: 'command'; readonly command: CommandLike };
export type Filter = 'modified' | 'project' | 'user' | 'restart' | 'shortcut';
const FILTERS = new Set<Filter>(['modified', 'project', 'user', 'restart', 'shortcut']);

/** "@modified units" -> { filters: ['modified'], text: 'units' }. Unknown @words stay in the text. */
export function parseQuery(raw: string): { filters: Filter[]; text: string } {
  const filters: Filter[] = [], rest: string[] = [];
  for (const w of raw.trim().split(/\s+/).filter(Boolean)) {
    const f = w.startsWith('@') ? (w.slice(1).toLowerCase() as Filter) : null;
    if (f && FILTERS.has(f)) { if (!filters.includes(f)) filters.push(f); } else rest.push(w);
  }
  return { filters, text: rest.join(' ') };
}
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function unifiedSearch(raw: string, state: StateLike, labelOf: (key: string) => string, commands: readonly CommandLike[], limit = 12): UnifiedResult[] {
  const { filters, text } = parseQuery(raw);
  if (!filters.length && !text) return [];
  const has = (f: Filter) => filters.includes(f);
  let entries: readonly SettingEntry[] = SETTINGS_REGISTRY;
  if (has('modified')) entries = entries.filter((e) => isModified(state, e));
  if (has('project')) entries = entries.filter((e) => e.scope === 'project');
  if (has('user')) entries = entries.filter((e) => e.scope === 'user');
  if (has('restart')) entries = entries.filter((e) => e.restart);
  const settingOnly = has('modified') || has('project') || has('user') || has('restart');
  const settings = has('shortcut') && !settingOnly ? [] : (text ? searchRegistry(text, labelOf, entries) : [...entries]).map((entry): UnifiedResult => ({ kind: 'setting', entry, modified: isModified(state, entry) }));
  // Commands only join when no setting-only filter is active.
  let cmds: UnifiedResult[] = [];
  if (!settingOnly) {
    const words = norm(text).split(/\s+/).filter(Boolean);
    cmds = commands
      .filter((c) => (!has('shortcut') || !!c.shortcut) && words.every((w) => norm(`${c.title} ${c.category ?? ''} ${(c.keywords ?? []).join(' ')} ${c.shortcut ?? ''}`).includes(w)))
      .map((command): UnifiedResult => ({ kind: 'command', command }));
  }
  return [...settings, ...cmds].slice(0, limit);
}
