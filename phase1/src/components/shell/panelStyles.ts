/**
 * Shared class strings for studio panel, rail and inspector surfaces (shell wave 2 consolidation).
 * One canonical look for labels, fields, sections and sliders; studios import these instead of
 * redeclaring the same strings per file. Geometry-only: behavior, test ids and aria stay with the caller.
 */

/** Bordered text/number input inside a panel (regular density). */
export const panelField='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Same field at compact density (inspectors with many rows). */
export const panelFieldCompact='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** Same field at mini density (tight tool rows). */
export const panelFieldMini='h-6 min-w-0 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink select-text';
/** One bordered inspector section with a vertical rhythm. */
export const panelSection='grid gap-1.5 border-b border-subtle px-3 py-3 text-xs text-ink-2';
/** Uppercase section heading inside an inspector or panel stack. */
export const panelSectionTitle='m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3';
/** Label above a control, with the control as its child. */
export const panelLabel='grid gap-1 text-[11px] text-ink-3';
/** Muted hint or empty-state paragraph. */
export const panelHint='m-0 text-ink-3';
/** Padded muted hint or loading state. */
export const panelHintPadded='p-3 text-xs text-ink-3';
/** Full-width range slider in accent colour. */
export const panelSlider='w-full accent-[var(--accent)]';
/** Fixed-size checkbox in accent colour. */
export const panelCheck='!size-4 !w-4 shrink-0 accent-[var(--accent)]';
