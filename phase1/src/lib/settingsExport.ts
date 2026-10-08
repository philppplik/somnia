/** Export only the settings that differ from the default, and import them again with validation. Pure. */
import { SETTINGS_REGISTRY, modifiedSettings, getSetting, resetPatch, type SettingEntry, type StateLike } from './settingsRegistry';

export const SETTINGS_FILE_VERSION = 1;
const ENUMS: Record<string, readonly string[]> = {
  'workflow.startup': ['last', 'welcome', 'blank'], 'workflow.imageSaveMode': ['overwrite', 'copy'], 'workflow.units': ['auto', 'metric', 'imperial'], 'document.font': ['system', 'serif', 'monospace'],
};
const RANGES: Record<string, [number, number]> = { 'workflow.draftSeconds': [1, 300] };
export function validSettingValue(e: SettingEntry, v: unknown): boolean {
  if (ENUMS[e.id]) return typeof v === 'string' && ENUMS[e.id].includes(v);
  if (typeof e.default === 'number') { const r = RANGES[e.id]; return typeof v === 'number' && Number.isFinite(v) && (!r || (v >= r[0] && v <= r[1])); }
  if (e.id === 'workflow.documentTitle') return typeof v === 'string' && v.trim().length > 0 && v.length <= 160;
  return typeof v === typeof e.default;
}
export function exportSettings(state: StateLike): string {
  const settings: Record<string, unknown> = {};
  for (const e of modifiedSettings(state)) settings[e.id] = getSetting(state, e);
  return JSON.stringify({ app: 'somnia', kind: 'settings', version: SETTINGS_FILE_VERSION, settings }, null, 2) + '\n';
}
export interface ImportResult { readonly accepted: Readonly<Record<string, unknown>>; readonly warnings: readonly string[] }
export function parseSettingsImport(text: string): ImportResult {
  const fail = (m: string): ImportResult => ({ accepted: {}, warnings: [m] });
  if (!text || text.length > 256 * 1024) return fail('File is empty or too large');
  let raw: any;
  try { raw = JSON.parse(text); } catch { return fail('Not a valid JSON file'); }
  if (!raw || typeof raw !== 'object' || raw.kind !== 'settings' || !raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) return fail('Not a Somnia settings file');
  const accepted: Record<string, unknown> = {}, warnings: string[] = [];
  for (const [id, v] of Object.entries(raw.settings as Record<string, unknown>)) {
    const e = SETTINGS_REGISTRY.find((x) => x.id === id);
    if (!e) { warnings.push(`Unknown setting "${id}" skipped`); continue; }
    if (!validSettingValue(e, v)) { warnings.push(`Invalid value for "${id}" skipped`); continue; }
    accepted[id] = v;
  }
  return { accepted, warnings };
}
/** Import = the file's settings win, everything not in the file goes back to default (an export holds only changes). */
export function importPatch(state: StateLike, accepted: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const patch: Record<string, any> = resetPatch(state, modifiedSettings(state));
  for (const [id, v] of Object.entries(accepted)) {
    const e = SETTINGS_REGISTRY.find((x) => x.id === id)!;
    if (!e.field) { patch[e.group] = v; continue; }
    patch[e.group] = { ...(patch[e.group] ?? state[e.group]), [e.field]: v };
  }
  return patch;
}
