import type {DesignToolId} from './panelContract';
export interface DesignToolDef {id: DesignToolId; labelKey: string; hintKey: string; shortcut: string; icon: DesignToolId}
/** Toolbox order = display order. Only tools the core implements are listed (artboard, rectangle, text); extend together with the core. Single-key shortcuts follow common design-tool conventions. */
export const DESIGN_TOOLS: readonly DesignToolDef[] = [
  {id: 'select', labelKey: 'design.tool.select', hintKey: 'design.tool.select.hint', shortcut: 'V', icon: 'select'},
  {id: 'hand', labelKey: 'design.tool.hand', hintKey: 'design.tool.hand.hint', shortcut: 'H', icon: 'hand'},
  {id: 'frame', labelKey: 'design.tool.frame', hintKey: 'design.tool.frame.hint', shortcut: 'F', icon: 'frame'},
  {id: 'rectangle', labelKey: 'design.tool.rectangle', hintKey: 'design.tool.rectangle.hint', shortcut: 'R', icon: 'rectangle'},
  {id: 'text', labelKey: 'design.tool.text', hintKey: 'design.tool.text.hint', shortcut: 'T', icon: 'text'},
];
/** Resolves a keydown to a tool. Ignores modifier combos and typing in inputs. */
export function toolForKey(e: {key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown}): DesignToolId | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as {tagName?: string; isContentEditable?: boolean} | null | undefined;
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes((t.tagName ?? '').toUpperCase()))) return null;
  const k = e.key.length === 1 ? e.key.toUpperCase() : '';
  return DESIGN_TOOLS.find(d => d.shortcut === k)?.id ?? null;
}
