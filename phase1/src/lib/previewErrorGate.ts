/**
 * Caps script-error traffic from the live preview bridge. A page script that throws in a
 * loop (rAF, timers, resize handlers) otherwise posts one message per throw and re-renders
 * the error overlay continuously. First occurrences pass through up to the cap; repeats and
 * everything past the cap is dropped, and the overlay shows a single suppression notice.
 */
export interface PreviewErrorGate {
  /** 'show' a first occurrence under the cap; 'drop' repeats and over-cap errors. */
  accept(message: string): 'show' | 'drop';
  /** True exactly once, once distinct errors exceeded the cap. */
  takeSuppressionNotice(): boolean;
}
export function createPreviewErrorGate(cap = 30): PreviewErrorGate {
  if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('Invalid preview error cap');
  let shown = 0, overCap = false, notified = false;
  const seen = new Set<string>();
  return {
    accept(message) {
      const key = message.slice(0, 300);
      if (seen.has(key)) return 'drop';
      if (shown >= cap) { overCap = true; return 'drop'; }
      seen.add(key); shown++;
      return 'show';
    },
    takeSuppressionNotice() {
      if (!overCap || notified) return false;
      notified = true;
      return true;
    },
  };
}
