/**
 * Transfer classification: every registry setting is either assigned a transfer category or explicitly excluded.
 * Default is deny. A coverage test fails when a registry entry has no classification, so new settings cannot
 * slip into (or silently out of) a setup file. Pure data.
 *
 * Sensitivity classes follow docs/concepts/settings-import-export.md: public preference, private text, secret,
 * device, executable. Only 'public' entries are transferable in stage 1.
 */
import { SETTINGS_REGISTRY, type SettingEntry } from '../settingsRegistry';

export type TransferCategory = 'general' | 'editor' | 'typography' | 'publish' | 'keybindings';
export type Sensitivity = 'public' | 'private-text' | 'secret' | 'device' | 'executable';
export interface Classification { readonly category?: TransferCategory; readonly sensitivity: Sensitivity; readonly reason?: string }

/** Categories in stable display/export order. */
export const TRANSFER_CATEGORIES: readonly TransferCategory[] = ['general', 'editor', 'typography', 'publish', 'keybindings'];
/** Selected by default in the export checklist. */
export const DEFAULT_CATEGORIES: readonly TransferCategory[] = TRANSFER_CATEGORIES;

const pub = (category: TransferCategory): Classification => ({ category, sensitivity: 'public' });
const CLASSIFICATION: Readonly<Record<string, Classification>> = Object.freeze({
  // A preview-script switch changes what runs in the preview. It is never moved between machines.
  previewScripts: { sensitivity: 'executable', reason: 'enables script execution' },
  'workflow.startup': pub('general'),
  'workflow.documentTitle': pub('general'),
  'workflow.confirmDelete': pub('general'),
  'workflow.draftAutosave': pub('general'),
  'workflow.draftSeconds': pub('general'),
  'workflow.imageSaveMode': pub('general'),
  'workflow.units': pub('general'),
  'editor.wrapLines': pub('editor'),
  'editor.autocomplete': pub('editor'),
  'editor.closeTags': pub('editor'),
  'editor.closeBrackets': pub('editor'),
  'editor.lint': pub('editor'),
  'editor.emmet': pub('editor'),
  'editor.lineNumbers': pub('editor'),
  'editor.autoIndent': pub('editor'),
  'editor.selectionScroll': pub('editor'),
  'editor.mathMarkdown': pub('editor'),
  'editor.texBanner': pub('editor'),
  'document.font': pub('typography'),
  'document.stripEditorIds': pub('publish'),
  'document.keepComments': pub('publish'),
});

export function classify(id: string): Classification {
  return Object.prototype.hasOwnProperty.call(CLASSIFICATION, id) ? CLASSIFICATION[id] : { sensitivity: 'device', reason: 'unclassified' };
}
export const isTransferable = (id: string): boolean => { const c = classify(id); return c.sensitivity === 'public' && c.category !== undefined; };
export const categoryOf = (id: string): TransferCategory | undefined => classify(id).category;
export const transferableSettings = (): SettingEntry[] => SETTINGS_REGISTRY.filter((e) => isTransferable(e.id));
/** Registry ids with no classification at all (must stay empty; enforced by a test). */
export const unclassifiedSettings = (): string[] => SETTINGS_REGISTRY.filter((e) => !Object.prototype.hasOwnProperty.call(CLASSIFICATION, e.id)).map((e) => e.id);

/** Coverage report: counts and reasons only, never values or field names of excluded entries. */
export interface CoverageReport { readonly included: Readonly<Record<TransferCategory, number>>; readonly excluded: Readonly<Record<string, number>> }
export function coverageReport(): CoverageReport {
  const included = Object.fromEntries(TRANSFER_CATEGORIES.map((c) => [c, 0])) as Record<TransferCategory, number>;
  const excluded: Record<string, number> = {};
  for (const e of SETTINGS_REGISTRY) {
    const c = classify(e.id);
    if (isTransferable(e.id)) included[c.category!]++;
    else excluded[c.reason ?? c.sensitivity] = (excluded[c.reason ?? c.sensitivity] ?? 0) + 1;
  }
  return { included, excluded };
}
