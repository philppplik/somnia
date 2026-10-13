import type { LifecycleEvent, LifecycleEventType, StudioLifecycleStatus } from './types';

export interface TelemetryOptions {
  /** Ring capacity; older events are dropped. */
  capacity?: number;
  now?: () => number;
}

export interface TelemetryMark {
  name: string;
  at: number;
}

/**
 * Local-only lifecycle instrumentation (concept section 10). A bounded ring
 * buffer with monotonic marks and transition events. No paths, document
 * names, prompts, keys or payload content ever enter the buffer; diagnostic
 * export is explicit and shows exactly what would be shared.
 */
export class LifecycleTelemetry {
  private readonly capacity: number;
  private readonly now: () => number;
  private ring: LifecycleEvent[] = [];
  private marks: TelemetryMark[] = [];

  constructor(options: TelemetryOptions = {}) {
    this.capacity = options.capacity ?? 500;
    this.now = options.now ?? (() => Date.now());
  }

  /** Monotonic timing mark (launch, activation, snapshot commit, resume). */
  mark(name: string): void {
    this.marks.push({ name, at: this.now() });
    if (this.marks.length > this.capacity) this.marks.splice(0, this.marks.length - this.capacity);
  }

  event(event: Omit<LifecycleEvent, 'at'>): void {
    this.ring.push({ ...event, at: this.now() });
    if (this.ring.length > this.capacity) this.ring.splice(0, this.ring.length - this.capacity);
  }

  transition(studioId: string, from: StudioLifecycleStatus, to: StudioLifecycleStatus, reason: string, ms?: number): void {
    this.event({ type: 'transition', studioId, from, to, reason, ms });
  }

  events(): readonly LifecycleEvent[] {
    return this.ring;
  }

  recentMarks(): readonly TelemetryMark[] {
    return this.marks;
  }

  countsByType(): Record<LifecycleEventType, number> {
    const counts = {} as Record<LifecycleEventType, number>;
    for (const e of this.ring) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }

  /** Explicit diagnostic export: JSON of counts, marks and the bounded ring. */
  exportDiagnostics(states?: Record<string, StudioLifecycleStatus>): string {
    return JSON.stringify({
      kind: 'somnia-lifecycle-diagnostics',
      version: 1,
      states: states ?? {},
      counts: this.countsByType(),
      events: this.ring,
      marks: this.marks,
    });
  }

  clear(): void {
    this.ring = [];
    this.marks = [];
  }
}

/** Process-wide telemetry sink, installed by integration.ts. */
let shared: LifecycleTelemetry | null = null;
export const getLifecycleTelemetry = (): LifecycleTelemetry => (shared ??= new LifecycleTelemetry());
/** Test hook: replace the shared sink. */
export const setLifecycleTelemetry = (t: LifecycleTelemetry | null): void => {
  shared = t;
};
