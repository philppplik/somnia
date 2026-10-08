/**
 * Project scope: `.somnia/settings.json` in the project folder holds overrides for the few settings a project may
 * change (registry scope 'project': units, image save mode, publish options). Chain: default -> user -> project.
 * Pure parsing/merging; reading and writing the file goes through the normal project file layer.
 * Never trusted: unknown keys, wrong types and non-overridable settings are dropped with a warning, so a project
 * file cannot change user-only settings (AI keys, shortcuts, window, updates).
 */
import { SETTINGS_REGISTRY, getSetting, projectOverridable, type SettingEntry, type StateLike } from './settingsRegistry';
import { sanitizeUnitPref } from './units';

export const PROJECT_SETTINGS_PATH = '.somnia/settings.json';
export const PROJECT_SETTINGS_VERSION = 1;
export type ProjectOverrides = Readonly<Record<string, string | number | boolean>>;
export interface ParsedProjectSettings { readonly overrides: ProjectOverrides; readonly warnings: readonly string[] }
const MAX_BYTES = 64 * 1024;

function valid(e: SettingEntry, v: unknown): v is string | number | boolean {
  switch (e.id) {
    case 'workflow.units': return v === sanitizeUnitPref(v);
    case 'workflow.imageSaveMode': return v === 'overwrite' || v === 'copy';
    default: return typeof v === typeof e.default;
  }
}
export function parseProjectSettings(text: string | null | undefined): ParsedProjectSettings {
  const warnings: string[] = [];
  if (!text || !text.trim()) return { overrides: {}, warnings };
  if (text.length > MAX_BYTES) return { overrides: {}, warnings: ['Project settings file is too large and was ignored'] };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { overrides: {}, warnings: ['Project settings file is not valid JSON and was ignored'] }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { overrides: {}, warnings: ['Project settings file must be a JSON object'] };
  const r = raw as Record<string, unknown>;
  if (r.version !== undefined && r.version !== PROJECT_SETTINGS_VERSION) warnings.push(`Unknown settings version ${String(r.version)}; read as version ${PROJECT_SETTINGS_VERSION}`);
  const src = r.settings;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return { overrides: {}, warnings };
  const ok = new Map(projectOverridable().map((e) => [e.id, e]));
  const out: Record<string, string | number | boolean> = {};
  for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
    const e = ok.get(id);
    if (!e) { warnings.push(SETTINGS_REGISTRY.some((x) => x.id === id) ? `"${id}" is user-only and was ignored` : `Unknown setting "${id}" was ignored`); continue; }
    if (!valid(e, v)) { warnings.push(`"${id}" has an invalid value and was ignored`); continue; }
    out[id] = v;
  }
  return { overrides: Object.freeze(out), warnings };
}
export function serializeProjectSettings(overrides: ProjectOverrides): string {
  const keys = Object.keys(overrides).sort();
  const settings: Record<string, unknown> = {};
  for (const k of keys) settings[k] = overrides[k];
  return JSON.stringify({ version: PROJECT_SETTINGS_VERSION, settings }, null, 2) + '\n';
}
/** Effective value: project override if present, else the user's value. */
export function effectiveSetting(state: StateLike, e: SettingEntry, overrides: ProjectOverrides): unknown {
  return e.scope === 'project' && Object.hasOwn(overrides, e.id) ? overrides[e.id] : getSetting(state, e);
}
export type Source = 'default' | 'user' | 'project';
export function settingSource(state: StateLike, e: SettingEntry, overrides: ProjectOverrides): Source {
  if (e.scope === 'project' && Object.hasOwn(overrides, e.id)) return 'project';
  return JSON.stringify(getSetting(state, e)) !== JSON.stringify(e.default) ? 'user' : 'default';
}
/** AppState patch of the effective prefs: user prefs with project overrides laid on top (not persisted as user prefs). */
export function effectivePrefs(state: StateLike, overrides: ProjectOverrides): { workflowPrefs: Record<string, unknown>; documentPrefs: Record<string, unknown> } {
  const w: Record<string, unknown> = { ...state.workflowPrefs }, d: Record<string, unknown> = { ...state.documentPrefs };
  for (const e of projectOverridable()) {
    if (!Object.hasOwn(overrides, e.id) || !e.field) continue;
    (e.group === 'workflowPrefs' ? w : e.group === 'documentPrefs' ? d : {})[e.field] = overrides[e.id];
  }
  return { workflowPrefs: w, documentPrefs: d };
}
/** Set (or with `inherit` true, remove) one project override. Non-overridable ids are rejected. */
export function withOverride(overrides: ProjectOverrides, id: string, value: unknown, inherit = false): ProjectOverrides {
  const e = projectOverridable().find((x) => x.id === id);
  if (!e) throw new Error(`"${id}" cannot be overridden per project`);
  const next = { ...overrides };
  if (inherit) delete next[id];
  else { if (!valid(e, value)) throw new Error(`Invalid value for ${id}`); next[id] = value; }
  return Object.freeze(next);
}
