// Deliberate best-effort failures on the renderer side. Counted in memory, never logged per occurrence.
// Rust twin: phase1/src-tauri/src/ignore.rs (IgnoreReason). Keep the shared keys in sync.
// SwallowReason lives here until log.types.ts (D1-B) lands; it then re-exports from there.
export const SWALLOW_REASONS = [
  'storage-unavailable', 'clipboard-denied', 'pointer-capture', 'best-effort-cleanup',
  'expected-cancel', 'ime-composition', 'resize-observer', 'best-effort-window',
] as const;
export type SwallowReason = (typeof SWALLOW_REASONS)[number];

const counts = Object.fromEntries(SWALLOW_REASONS.map((r) => [r, 0])) as Record<SwallowReason, number>;

export function getSwallowCounts(): Readonly<Record<SwallowReason, number>> { return { ...counts }; }
export function resetSwallowCounts(): void { for (const r of SWALLOW_REASONS) counts[r] = 0; }

/** Runs `x` (function or promise); a throw/rejection is counted under `reason` and turned into undefined. */
export function swallow<T>(reason: SwallowReason, x: Promise<T>): Promise<T | undefined>;
export function swallow<T>(reason: SwallowReason, x: () => T): T | undefined;
export function swallow<T>(reason: SwallowReason, x: Promise<T> | (() => T)): Promise<T | undefined> | T | undefined {
  if (typeof x === 'function') {
    try { return x(); } catch { counts[reason]++; return undefined; }
  }
  return x.catch(() => { counts[reason]++; return undefined; });
}
