/** Application-owned jobs. A view lifetime is never a cancellation signal. */
export type JobPriority = 0 | 1 | 2 | 3;
export type JobState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
export type JobPressure = 'normal' | 'pressure' | 'critical';
export interface JobSpec {
  id?: string;
  kind: 'save' | 'playback' | 'activation' | 'export' | 'ai' | 'maintenance';
  documentId?: string;
  revision?: number;
  priority: JobPriority;
  estimatedBytes?: number;
  resources?: readonly string[];
  /** Serialize access to singleton engines without pinning the studio view. */
  exclusive?: readonly string[];
  signal?: AbortSignal;
  cancellable?: boolean;
}
export interface JobRecord {
  id: string;
  kind: JobSpec['kind'];
  documentId?: string;
  revision?: number;
  priority: JobPriority;
  state: JobState;
  estimatedBytes: number;
  resources: readonly string[];
  progress: number | null;
  cancellable: boolean;
  cancellationRequested?: boolean;
}
export interface JobLease {
  id: string;
  signal: AbortSignal;
  progress(ratio: number): void;
  release(state?: 'completed' | 'failed' | 'cancelled'): void;
}
interface Pending {
  spec: JobSpec;
  record: JobRecord;
  controller: AbortController;
  resolve: (lease: JobLease) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
  order: number;
  enqueuedAt: number;
}
export interface JobSchedulerOptions {
  backgroundConcurrency?: number;
  interactiveConcurrency?: number;
  realtimeConcurrency?: number;
  maxQueued?: number;
  maxBytes?: number;
  historyLimit?: number;
  agingMs?: number;
  now?: () => number;
}
export interface JobAdmission {
  maxBytes: number;
  backgroundConcurrency: number;
  pressure: JobPressure;
}
const positiveInteger = (n: number, name: string): number => {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid job limit: ${name}`);
  return n;
};

export class JobScheduler {
  private queue: Pending[] = [];
  private active = new Map<string, Pending>();
  private history: JobRecord[] = [];
  private listeners = new Set<() => void>();
  private counter = 0;
  private snapshot: readonly JobRecord[] = Object.freeze([]);
  private pressure: JobPressure = 'normal';
  private interaction = false;
  private draining = false;
  private drainAgain = false;
  private readonly limits;
  private readonly now: () => number;

  constructor(options: JobSchedulerOptions = {}) {
    this.limits = {
      background: options.backgroundConcurrency ?? 2,
      interactive: options.interactiveConcurrency ?? 2,
      realtime: options.realtimeConcurrency ?? 2,
      queue: options.maxQueued ?? 64,
      bytes: options.maxBytes ?? 256 * 1024 * 1024,
      history: options.historyLimit ?? 32,
      aging: options.agingMs ?? 30_000,
    };
    for (const [key, n] of Object.entries(this.limits)) positiveInteger(n, key);
    this.now = options.now ?? (() => performance.now());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  list = (): readonly JobRecord[] => this.snapshot;
  hasLease(resourceId: string): boolean {
    return [...this.active.values()].some(p => p.record.resources.includes(resourceId));
  }
  /** Pending dependencies also prohibit disposal before their job is admitted. */
  needsResource(resourceId: string): boolean {
    return this.hasLease(resourceId) || this.queue.some(p => p.record.resources.includes(resourceId));
  }
  reservedBytes(): number {
    return [...this.active.values()].reduce((sum, p) => sum + p.record.estimatedBytes, 0);
  }
  /** Apply profile and pressure together, without a transient admission window.
   * Shrinking a profile never aborts active work. Oversized queued jobs wait
   * for a larger profile or explicit cancellation; new oversized jobs reject.
   */
  setAdmission(value: JobAdmission): void {
    const bytes = positiveInteger(value.maxBytes, 'bytes');
    const background = positiveInteger(value.backgroundConcurrency, 'background');
    if (!['normal', 'pressure', 'critical'].includes(value.pressure)) throw new Error('Invalid job pressure');
    if (bytes === this.limits.bytes && background === this.limits.background && value.pressure === this.pressure) return;
    this.limits.bytes = bytes;
    this.limits.background = background;
    this.pressure = value.pressure;
    this.drain();
  }
  setPressure(pressure: JobPressure): void {
    this.setAdmission({ maxBytes: this.limits.bytes, backgroundConcurrency: this.limits.background, pressure });
  }
  setInteracting(value: boolean): void {
    if (this.interaction === value) return;
    this.interaction = value;
    this.drain();
  }
  private emit(): void {
    this.snapshot = Object.freeze([
      ...[...this.active.values()].map(p => p.record),
      ...this.queue.map(p => p.record), ...this.history,
    ].map(r => Object.freeze({ ...r, resources: Object.freeze([...r.resources]) })));
    for (const fn of this.listeners) {
      try { fn(); } catch { /* observers do not own jobs */ }
    }
  }
  private remember(p: Pending, state: JobState): void {
    p.record.state = state;
    p.cleanup();
    this.history.push({ ...p.record });
    if (this.history.length > this.limits.history) this.history.shift();
  }
  acquire(spec: JobSpec): Promise<JobLease> {
    if (![0, 1, 2, 3].includes(spec.priority)) return Promise.reject(new Error('Invalid job priority'));
    const bytes = spec.estimatedBytes ?? 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.limits.bytes) {
      return Promise.reject(new Error('Job reservation exceeds budget'));
    }
    if (this.queue.length >= this.limits.queue) return Promise.reject(new Error('Job queue is full'));
    if (spec.signal?.aborted) return Promise.reject(spec.signal.reason ?? new DOMException('Job cancelled', 'AbortError'));
    const exists = (id: string) => this.active.has(id) || this.queue.some(p => p.record.id === id);
    let id = spec.id;
    if (id === undefined) do { id = `job-${++this.counter}`; } while (exists(id));
    if (exists(id)) return Promise.reject(new Error('Duplicate job id'));
    const jobId = id;
    return new Promise((resolve, reject) => {
      const signal = spec.signal;
      const p: Pending = {
        spec: { ...spec, resources: [...(spec.resources ?? [])], exclusive: [...(spec.exclusive ?? [])] },
        record: {
          id: jobId, kind: spec.kind, documentId: spec.documentId, revision: spec.revision,
          priority: spec.priority, state: 'queued', estimatedBytes: bytes,
          resources: [...new Set([...(spec.resources ?? []), ...(spec.exclusive ?? [])])],
          progress: null, cancellable: spec.cancellable !== false, cancellationRequested: false,
        },
        controller: new AbortController(), resolve, reject, cleanup: () => {},
        order: ++this.counter, enqueuedAt: this.now(),
      };
      const abort = () => { this.cancel(jobId, signal?.reason); };
      signal?.addEventListener('abort', abort, { once: true });
      p.cleanup = () => signal?.removeEventListener('abort', abort);
      this.queue.push(p);
      this.drain();
    });
  }
  cancel(id: string, reason: unknown = new DOMException('Job cancelled', 'AbortError')): boolean {
    const i = this.queue.findIndex(p => p.record.id === id);
    if (i >= 0) {
      const p = this.queue[i];
      if (!p.record.cancellable) return false;
      this.queue.splice(i, 1);
      p.record.cancellationRequested = true;
      p.controller.abort(reason);
      this.remember(p, 'cancelled');
      p.reject(reason);
      this.drain();
      return true;
    }
    const p = this.active.get(id);
    if (!p || !p.record.cancellable) return false;
    if (!p.controller.signal.aborted) {
      p.record.cancellationRequested = true;
      p.controller.abort(reason);
      this.emit();
    }
    return true;
    // Running reservations remain held until the operation acknowledges cancellation.
  }
  async run<T>(spec: JobSpec, operation: (lease: JobLease) => Promise<T>): Promise<T> {
    const lease = await this.acquire(spec);
    try {
      lease.signal.throwIfAborted();
      const result = await operation(lease);
      lease.signal.throwIfAborted();
      lease.release();
      return result;
    } catch (e) {
      lease.release(lease.signal.aborted ? 'cancelled' : 'failed');
      throw e;
    }
  }
  private admissible(p: Pending): boolean {
    const running = [...this.active.values()];
    const lane = (priority: JobPriority) => priority === 0 ? 'realtime' : priority === 1 ? 'interactive' : 'background';
    const group = lane(p.record.priority);
    if (running.filter(a => lane(a.record.priority) === group).length >= this.limits[group]) return false;
    if (p.record.priority === 3 && (this.pressure !== 'normal' || this.interaction)) return false;
    if (p.record.priority >= 2 && this.pressure === 'critical') return false;
    if (this.reservedBytes() + p.record.estimatedBytes > this.limits.bytes) return false;
    return !running.some(a => p.spec.exclusive!.some(id => a.spec.exclusive!.includes(id)));
  }
  private drain(): void {
    if (this.draining) { this.drainAgain = true; return; }
    this.draining = true;
    try {
      do {
        this.drainAgain = false;
        const now = this.now();
        // P0/P1 are never demoted. Aging gives maintenance equal rank to P2.
        const effective = (p: Pending) => p.record.priority < 2 ? p.record.priority
          : Math.max(2, p.record.priority - Math.floor((now - p.enqueuedAt) / this.limits.aging));
        this.queue.sort((a, b) => effective(a) - effective(b) || a.order - b.order);
        for (let i = 0; i < this.queue.length;) {
          const p = this.queue[i];
          if (!this.admissible(p)) { i++; continue; }
          this.queue.splice(i, 1);
          p.record.state = 'running';
          this.active.set(p.record.id, p);
          let released = false;
          p.resolve({
            id: p.record.id, signal: p.controller.signal,
            progress: ratio => {
              if (released || !Number.isFinite(ratio)) return;
              p.record.progress = Math.min(1, Math.max(0, ratio));
              this.emit();
            },
            release: (state = 'completed') => {
              if (released) return;
              released = true;
              this.active.delete(p.record.id);
              this.remember(p, p.controller.signal.aborted ? 'cancelled' : state);
              this.drain();
            },
          });
        }
        this.emit();
      } while (this.drainAgain);
    } finally { this.draining = false; }
  }
}
export const jobScheduler = new JobScheduler();
