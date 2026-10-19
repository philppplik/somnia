/**
 * PDF studio command specs (engine-hardening wave B). The inline editor registers these for
 * the open PDF through registerCommandSpec; palette, shortcuts and menus keep working through
 * the legacy bridge, and agents/MCP reach the non-`ui` levels through the dispatcher.
 *
 * - pdf.saveCopy    ui       opens a save dialog, so interactive origins only.
 * - pdf.export.advanced ui   opens the Advanced Export dialog (editable copy, flattened print or screen copy).
 * - pdf.page.rotate propose  edits the in-memory editing copy only; nothing reaches disk until
 *                            the user saves a copy, and undo reverts it. Optional 0-based `page`
 *                            (defaults to the page currently shown).
 * - pdf.undo/redo   ui       walk the session history, which is the PDF area's own history.
 *
 * Pure of app wiring: session functions are injected, so the specs are unit-testable.
 */
import type { CommandSpec } from '../commandSpec';
import type { PdfSession } from './session';

export interface PdfCommandDeps {
  /** Name (key) of the open PDF session this registration belongs to. */
  name: string;
  getSession: () => Pick<PdfSession, 'editing' | 'busy' | 'page' | 'undo' | 'redo' | 'bytes'> | null | undefined;
  exportCopy: (name: string) => Promise<unknown>;
  /** Opens the Advanced Export dialog for this PDF. */
  openAdvanced?: (name: string) => void;
  rotate: (name: string, page: number) => Promise<unknown>;
  history: (name: string, dir: 'undo' | 'redo') => Promise<unknown>;
}

const noParams = { type: 'object', properties: {}, additionalProperties: false } as const;

export function pdfCommandSpecs(d: PdfCommandDeps): CommandSpec<any, unknown>[] {
  const s = () => d.getSession();
  return [
    {
      id: 'pdf.saveCopy', title: 'PDF: Save edited copy', category: 'Project', shortcut: 'Mod+Shift+S',
      level: 'ui', params: noParams,
      run: () => d.exportCopy(d.name),
    },
    ...(d.openAdvanced ? ([{
      id: 'pdf.export.advanced', title: 'PDF: Advanced export', category: 'Project',
      level: 'ui' as const, params: noParams,
      enabled: () => !!s()?.bytes && !s()!.busy,
      run: () => d.openAdvanced!(d.name),
    }] as CommandSpec<any, unknown>[]) : []),
    {
      id: 'pdf.page.rotate', title: 'PDF: Rotate page clockwise', category: 'Tools',
      level: 'propose',
      params: {
        type: 'object',
        properties: { page: { type: 'integer', minimum: 0 } },
        additionalProperties: false,
      },
      enabled: () => !!s()?.editing && !s()!.busy,
      run: (params: { page?: number } | undefined) => d.rotate(d.name, params?.page ?? (s()?.page ?? 1) - 1),
    },
    {
      id: 'pdf.undo', title: 'PDF: Undo', category: 'Edit', level: 'ui', params: noParams,
      enabled: () => !!s()?.undo.length && !s()!.busy,
      run: () => d.history(d.name, 'undo'),
    },
    {
      id: 'pdf.redo', title: 'PDF: Redo', category: 'Edit', level: 'ui', params: noParams,
      enabled: () => !!s()?.redo.length && !s()!.busy,
      run: () => d.history(d.name, 'redo'),
    },
  ];
}
