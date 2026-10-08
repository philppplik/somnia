/** Pure helpers for the image editor History panel. The dialog owns the snapshots; this only labels and rewrites them. */
export interface OpLike { readonly id: string; readonly type: string; readonly enabled: boolean }
export interface SnapLike<O extends OpLike = OpLike> { readonly stack: readonly O[]; readonly adjust: unknown; readonly filter: O | null }
export interface TimelineEntry { readonly index: number; readonly labelKey: string; readonly future: boolean; readonly current: boolean }

const KNOWN = new Set(['crop', 'resize', 'rotate', 'flip', 'adjust', 'selection-cut', 'selection-fill', 'blur', 'sharpen', 'grayscale', 'sepia', 'invert', 'vignette']);
/** i18n key for an operation type; unknown types fall back to a generic key. */
export const opLabelKey = (type: string): string => (KNOWN.has(type) ? `imageeditor.op.${type}` : 'imageeditor.op.other');

/** What changed between two snapshots, as an i18n key. */
export function stepLabelKey(prev: SnapLike | undefined, next: SnapLike): string {
  if (!prev) return 'imageeditor.history.original';
  if (next.stack.length > prev.stack.length) return opLabelKey(next.stack[next.stack.length - 1].type);
  if (next.stack.length < prev.stack.length) return 'imageeditor.history.removed';
  if (next.stack.some((o, i) => o.enabled !== prev.stack[i].enabled)) return 'imageeditor.history.toggled';
  if (next.filter?.id !== prev.filter?.id || (next.filter && prev.filter && next.filter !== prev.filter)) return 'imageeditor.op.filter';
  if (next.adjust !== prev.adjust) return opLabelKey('adjust');
  return 'imageeditor.history.changed';
}
/** Timeline over past + current + future, with the current snapshot at index past.length. */
export function timeline(past: readonly SnapLike[], now: SnapLike, future: readonly SnapLike[]): TimelineEntry[] {
  const all = [...past, now, ...future];
  return all.map((s, i) => ({ index: i, labelKey: stepLabelKey(all[i - 1], s), future: i > past.length, current: i === past.length }));
}
/** Jump to timeline index i. Nothing is lost: later states stay available as redo. */
export function jumpTo<S>(past: readonly S[], now: S, future: readonly S[], i: number): { past: S[]; now: S; future: S[] } | null {
  const all = [...past, now, ...future];
  if (!Number.isInteger(i) || i < 0 || i >= all.length) return null;
  return { past: all.slice(0, i), now: all[i], future: all.slice(i + 1) };
}
export const toggleOp = <O extends OpLike>(stack: readonly O[], id: string): O[] => stack.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o));
export const removeOp = <O extends OpLike>(stack: readonly O[], id: string): O[] => stack.filter((o) => o.id !== id);
