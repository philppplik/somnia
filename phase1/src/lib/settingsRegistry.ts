/**
 * Settings registry: one record per user-visible setting with id, section, label key, search synonyms, default,
 * scope and restart flag. Pure data and pure helpers; the Settings dialog, search, Modified view, reset and
 * project overrides all read from here instead of scraping the DOM. Add new settings here (a test enforces
 * defaults and label keys exist).
 *
 * Scope: 'user' = global only. 'project' = a project may override it (units, save mode, publish options; decided by Philipp).
 */
import { DEFAULT_WORKFLOW_PREFS } from './workflowPrefs';
import { DEFAULT_EDITOR_PREFS } from './editorPrefs';
import { DEFAULT_DOCUMENT_PREFS } from './documentPrefs';

export type SettingScope = 'user' | 'project';
export type SettingGroup = 'workflowPrefs' | 'editorPrefs' | 'documentPrefs' | 'wrapLines';
export interface SettingEntry {
  readonly id: string;
  /** Settings dialog section name (matches the sidebar item). */
  readonly section: string;
  readonly labelKey: string;
  /** Extra words that should find this setting. English; the label itself is matched in the UI language. */
  readonly keywords: readonly string[];
  /** Key in AppState; for group 'wrapLines' the value lives directly at state.wrapLines. */
  readonly group: SettingGroup;
  readonly field?: string;
  readonly default: unknown;
  readonly scope: SettingScope;
  readonly restart: boolean;
}
type Spec = [id: string, section: string, labelKey: string, keywords: string, group: SettingGroup, field: string | undefined, def: unknown, scope?: SettingScope];
const SPECS: Spec[] = [
  ['workflow.startup', 'General', 'redesign.startup', 'launch open welcome last project start', 'workflowPrefs', 'startup', DEFAULT_WORKFLOW_PREFS.startup],
  ['workflow.documentTitle', 'General', 'redesign.defaultTitle', 'name new document untitled', 'workflowPrefs', 'documentTitle', DEFAULT_WORKFLOW_PREFS.documentTitle],
  ['workflow.confirmDelete', 'General', 'redesign.confirmDelete', 'trash remove ask warning', 'workflowPrefs', 'confirmDelete', DEFAULT_WORKFLOW_PREFS.confirmDelete],
  ['workflow.draftAutosave', 'Editing', 'redesign.draftAutosave', 'recovery backup crash autosave', 'workflowPrefs', 'draftAutosave', DEFAULT_WORKFLOW_PREFS.draftAutosave],
  ['workflow.draftSeconds', 'Editing', 'redesign.draftInterval', 'recovery interval seconds autosave', 'workflowPrefs', 'draftSeconds', DEFAULT_WORKFLOW_PREFS.draftSeconds],
  ['workflow.imageSaveMode', 'Editing', 'redesign.imageSaveMode', 'overwrite copy original save picture photo', 'workflowPrefs', 'imageSaveMode', DEFAULT_WORKFLOW_PREFS.imageSaveMode, 'project'],
  ['workflow.units', 'Editing', 'redesign.units', 'metric imperial inches millimeters mm paper a4 letter locale measurement', 'workflowPrefs', 'units', DEFAULT_WORKFLOW_PREFS.units, 'project'],
  ['editor.wrapLines', 'Code editor', 'set.ce.wrap', 'word wrap long lines', 'wrapLines', undefined, false],
  ['editor.autocomplete', 'Code editor', 'set.ce.autocomplete', 'suggest completion intellisense', 'editorPrefs', 'autocomplete', DEFAULT_EDITOR_PREFS.autocomplete],
  ['editor.closeTags', 'Code editor', 'set.ce.closeTags', 'html tag auto close', 'editorPrefs', 'closeTags', DEFAULT_EDITOR_PREFS.closeTags],
  ['editor.closeBrackets', 'Code editor', 'set.ce.closeBrackets', 'brackets quotes pairs auto close', 'editorPrefs', 'closeBrackets', DEFAULT_EDITOR_PREFS.closeBrackets],
  ['editor.lint', 'Code editor', 'set.ce.lint', 'errors warnings problems diagnostics check', 'editorPrefs', 'lint', DEFAULT_EDITOR_PREFS.lint],
  ['editor.emmet', 'Code editor', 'set.ce.emmet', 'abbreviation expand snippets tab', 'editorPrefs', 'emmet', DEFAULT_EDITOR_PREFS.emmet],
  ['editor.lineNumbers', 'Code editor', 'redesign.lineNumbers', 'gutter numbers', 'editorPrefs', 'lineNumbers', DEFAULT_EDITOR_PREFS.lineNumbers],
  ['editor.autoIndent', 'Code editor', 'redesign.autoIndent', 'indentation tabs spaces', 'editorPrefs', 'autoIndent', DEFAULT_EDITOR_PREFS.autoIndent],
  ['editor.selectionScroll', 'Code editor', 'redesign.selectionScroll', 'scroll selection follow', 'editorPrefs', 'selectionScroll', DEFAULT_EDITOR_PREFS.selectionScroll],
  ['editor.mathMarkdown', 'Code editor', 'set.ce.math', 'latex formulas katex equations markdown', 'editorPrefs', 'mathMarkdown', DEFAULT_EDITOR_PREFS.mathMarkdown],
  ['editor.texBanner', 'Code editor', 'set.ce.texBanner', 'latex tex pdf compile banner', 'editorPrefs', 'texBanner', DEFAULT_EDITOR_PREFS.texBanner],
  ['document.font', 'Typography', 'docPref.font', 'typeface serif sans mono preview font', 'documentPrefs', 'font', DEFAULT_DOCUMENT_PREFS.font],
  ['document.stripEditorIds', 'Export & Publish', 'docPref.stripIds', 'publish export clean ids attributes', 'documentPrefs', 'stripEditorIds', DEFAULT_DOCUMENT_PREFS.stripEditorIds, 'project'],
  ['document.keepComments', 'Export & Publish', 'docPref.comments', 'publish export html comments', 'documentPrefs', 'keepComments', DEFAULT_DOCUMENT_PREFS.keepComments, 'project'],
];
export const SETTINGS_REGISTRY: readonly SettingEntry[] = Object.freeze(SPECS.map(([id, section, labelKey, kw, group, field, def, scope]) =>
  Object.freeze({ id, section, labelKey, keywords: Object.freeze(kw.split(' ')), group, field, default: def, scope: scope ?? 'user', restart: false })));

export type StateLike = Readonly<Record<string, any>>;
export const getSetting = (state: StateLike, e: SettingEntry): unknown => (e.field ? state[e.group]?.[e.field] : state[e.group]);
export const isModified = (state: StateLike, e: SettingEntry): boolean => JSON.stringify(getSetting(state, e)) !== JSON.stringify(e.default);
export const modifiedSettings = (state: StateLike): SettingEntry[] => SETTINGS_REGISTRY.filter((e) => isModified(state, e));
export function modifiedCountBySection(state: StateLike): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of modifiedSettings(state)) out[e.section] = (out[e.section] ?? 0) + 1;
  return out;
}
/** State patch that puts the given entries back to their defaults (keeps untouched fields of each group). */
export function resetPatch(state: StateLike, entries: readonly SettingEntry[]): Record<string, unknown> {
  const patch: Record<string, any> = {};
  for (const e of entries) {
    if (!e.field) { patch[e.group] = e.default; continue; }
    patch[e.group] = { ...(patch[e.group] ?? state[e.group]), [e.field]: e.default };
  }
  return patch;
}
/** Registry search: label (translated by the caller), id, section and synonyms. Every query word must match somewhere. */
export function searchRegistry(query: string, labelOf: (key: string) => string, entries: readonly SettingEntry[] = SETTINGS_REGISTRY): SettingEntry[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: [number, SettingEntry][] = [];
  for (const e of entries) {
    const label = norm(labelOf(e.labelKey)), kw = e.keywords.join(' '), rest = norm(`${e.id} ${e.section} ${kw}`);
    if (!words.every((w) => label.includes(w) || rest.includes(w))) continue;
    scored.push([words.every((w) => label.includes(w)) ? (label.startsWith(words[0]) ? 0 : 1) : 2, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}
export const displayValue = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
export const projectOverridable = (): SettingEntry[] => SETTINGS_REGISTRY.filter((e) => e.scope === 'project');
