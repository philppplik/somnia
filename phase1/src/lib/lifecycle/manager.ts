import {
  PRESSURE_CRITICAL_RATIO,
  PRESSURE_ENTER_RATIO,
  PRESSURE_EXIT_HOLD_MS,
  PRESSURE_EXIT_RATIO,
  type ResourceBudgetProfile,
} from './budgets';
import { CheckpointStore } from './checkpoints';
import { LifecycleTelemetry } from './telemetry';
import type {
  StudioLifecycleAdapter,
  StudioLifecycleState,
  StudioLifecycleStatus,
  StudioSnapshot,
} from './types';

export interface LifecycleClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: LifecycleClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as Parameters<typeof clearTimeout>[0]),
};

/** Initial warm grace from the concept: 30 seconds, tuned from measured return intervals later. */
export const WARM_GRACE_MS = 30_000;
/** After three resumes inside this window the studio is treated as churning. */
export const CHURN_WINDOW_MS = 60_000;
export const CHURN_RESUME_COUNT = 3;
/** Churning studios get a longer grace so rebuild/evict cycles settle. */
export const CHURN_GRACE_FACTOR = 4;
/** Re-check pinned studios after this delay. */
export const PIN_RECHECK_MS = 30_000;

export type PressureLevel = 'normal' | 'pressure' | 'critical';

interface StudioRecord {
  id: string;
  state: StudioLifecycleState;
  adapter?: StudioLifecycleAdapter;
  adapterResolved: boolean;
  generation: number;
  warmTimer?: unknown;
  pinRecheckTimer?: unknown;
  pinReasons: readonly string[];
  resumeTimes: number[];
  churnedUntil: number;
  lastError?: string;
}

export interface StudioLifecycleManagerOptions {
  /** Resolve the registered adapter for a studio (from its manifest hooks). */
  resolveAdapter(studioId: string): StudioLifecycleAdapter | undefined;
  /** Master switch, read live so Settings changes apply without restart. */
  isEnabled(): boolean;
  /** Active budget profile, read live. */
  profile(): ResourceBudgetProfile;
  telemetry?: LifecycleTelemetry;
  checkpoints?: CheckpointStore;
  clock?: LifecycleClock;
  warmGraceMs?: number;
  /** Failure reporting seam (integration wires the app log / Problems). */
  onProblem?(message: string): void;
}

/**
 * Application-owned studio lifecycle coordinator (concept section 3).
 * One active view, at most one warm studio (profile permitting), 30 second
 * warm grace, checkpoint-based suspension, pressure handling with hysteresis
 * and churn protection. Documents, unsaved edits and jobs outlive views:
 * suspension requires a verified checkpoint, eviction is refused while a
 * studio holds the sole recoverable copy of unsaved edits, and registered
 * job-lease providers (the job scheduler) block suspension of leased work.
 */
export class StudioLifecycleManager {
  private readonly records = new Map<string, StudioRecord>();
  private readonly leaseProviders = new Set<(resourceId: string) => boolean>();
  private readonly opts: StudioLifecycleManagerOptions;
  private readonly telemetry: LifecycleTelemetry;
  private readonly checkpoints: CheckpointStore;
  private readonly clock: LifecycleClock;
  private readonly warmGraceMs: number;
  private active: string | null = null;
  private activationPromises = new Map<string, Promise<void>>();
  private inPressure = false;
  private pressureExitSince: number | null = null;

  constructor(options: StudioLifecycleManagerOptions) {
    this.opts = options;
    this.telemetry = options.telemetry ?? new LifecycleTelemetry();
    this.clock = options.clock ?? systemClock;
    this.warmGraceMs = options.warmGraceMs ?? WARM_GRACE_MS;
    this.checkpoints = options.checkpoints ?? new CheckpointStore(64 * 1024 * 1024);
  }

  /** Register a job-lease lookup (perf/lazy-hosts-jobs wires scheduler.hasLease here). */
  registerJobLeaseProvider(provider: (resourceId: string) => boolean): () => void {
    this.leaseProviders.add(provider);
    return () => this.leaseProviders.delete(provider);
  }

  activeId(): string | null {
    return this.active;
  }

  stateOf(studioId: string): StudioLifecycleStatus {
    return this.records.get(studioId)?.state ?? 'cold';
  }

  /** Current states for diagnostics and tests. */
  states(): Record<string, StudioLifecycleStatus> {
    const out: Record<string, StudioLifecycleStatus> = {};
    for (const [id, r] of this.records) out[id] = r.state;
    return out;
  }

  lastErrorOf(studioId: string): string | undefined {
    return this.records.get(studioId)?.lastError;
  }

  pinReasonsOf(studioId: string): readonly string[] {
    return this.records.get(studioId)?.pinReasons ?? [];
  }

  private record(studioId: string): StudioRecord {
    let r = this.records.get(studioId);
    if (!r) {
      r = {
        id: studioId,
        state: 'evicted',
        adapterResolved: false,
        generation: 0,
        pinReasons: [],
        resumeTimes: [],
        churnedUntil: 0,
      };
      this.records.set(studioId, r);
    }
    return r;
  }

  private adapterOf(r: StudioRecord): StudioLifecycleAdapter | undefined {
    if (r.adapterResolved) return r.adapter;
    // Only memoize a hit: a studio module may register its adapter after the
    // first resolve (lazy session code), and a later retry must find it.
    try {
      r.adapter = this.opts.resolveAdapter(r.id);
    } catch {
      r.adapter = undefined;
    }
    if (r.adapter) r.adapterResolved = true;
    return r.adapter;
  }

  private setState(r: StudioRecord, to: StudioLifecycleState, reason: string, ms?: number): void {
    const from: StudioLifecycleStatus = r.state;
    if (from === to) return;
    r.state = to;
    this.telemetry.transition(r.id, from, to, reason, ms);
  }

  private cancelWarmTimer(r: StudioRecord): void {
    if (r.warmTimer !== undefined) {
      this.clock.clearTimeout(r.warmTimer);
      r.warmTimer = undefined;
    }
  }

  private cancelPinRecheck(r: StudioRecord): void {
    if (r.pinRecheckTimer !== undefined) {
      this.clock.clearTimeout(r.pinRecheckTimer);
      r.pinRecheckTimer = undefined;
    }
  }

  /**
   * Switch the active studio. The previous studio becomes warm (profile
   * permitting); a warm target returns instantly; a suspended target resumes
   * from its verified checkpoint. Resumed adapters re-register their sessions
   * synchronously so the host mount path never rebuilds from stale source.
   */
  activate(studioId: string): Promise<void> {
    const pending = this.activationPromises.get(studioId);
    if (pending) return pending;
    const run = this.activateInternal(studioId).finally(() => {
      this.activationPromises.delete(studioId);
    });
    this.activationPromises.set(studioId, run);
    return run;
  }

  private async activateInternal(studioId: string): Promise<void> {
    if (!this.opts.isEnabled()) {
      this.active = studioId;
      return;
    }
    const started = this.clock.now();
    const target = this.record(studioId);
    target.generation++;
    const previous = this.active;

    if (previous === studioId && target.state === 'active') return;

    if (previous && previous !== studioId) {
      const prev = this.record(previous);
      if (prev.state === 'active') this.demoteToWarm(prev, 'studio-switch', studioId);
    }

    this.active = studioId;
    this.cancelWarmTimer(target);
    this.cancelPinRecheck(target);
    target.pinReasons = [];

    if (target.state === 'warm') {
      this.setState(target, 'active', 'warm-return', this.clock.now() - started);
      return;
    }
    if (target.state === 'suspended') {
      await this.resumeInternal(target);
      return;
    }
    // Cold or evicted: the host builds fresh runtime from the durable source.
    this.setState(target, 'active', 'cold-open', this.clock.now() - started);
  }

  private demoteToWarm(r: StudioRecord, reason: string, incomingId?: string): void {
    const profile = this.opts.profile();
    this.setState(r, 'warm', reason);
    if (profile.warmSlots < 1 || !this.adapterOf(r)?.snapshot) {
      // No warm slot (low-memory profile) or nothing to checkpoint: settle now.
      void this.suspend(r.id, 'no-warm-slot');
      return;
    }
    // Enforce the warm cap: suspend every other warm studio immediately,
    // except the studio that is being activated right now.
    const warm = [...this.records.values()].filter((x) => x.state === 'warm' && x.id !== r.id && x.id !== incomingId);
    const excess = warm.length - (profile.warmSlots - 1);
    if (excess > 0) for (const x of warm) void this.suspend(x.id, 'warm-cap');
    const grace = this.clock.now() < r.churnedUntil ? this.warmGraceMs * CHURN_GRACE_FACTOR : this.warmGraceMs;
    this.cancelWarmTimer(r);
    r.warmTimer = this.clock.setTimeout(() => {
      r.warmTimer = undefined;
      void this.suspend(r.id, 'warm-grace-expired');
    }, grace);
  }

  /** Suspension blockers: adapter pins plus active job leases on studio resources. */
  private blockers(r: StudioRecord): readonly string[] {
    const adapter = this.adapterOf(r);
    const reasons = [...(adapter?.pinReasons?.() ?? [])];
    if (this.leaseProviders.size && adapter?.resourceIds) {
      for (const resourceId of adapter.resourceIds()) {
        for (const has of this.leaseProviders) {
          try {
            if (has(resourceId)) reasons.push(`job-lease:${resourceId}`);
          } catch {
            /* a failing provider must not leak resources or block suspension */
          }
        }
      }
    }
    return [...new Set(reasons)];
  }

  /**
   * Suspend a warm studio: capture a verified checkpoint, then release
   * view-owned resources. Pinned or leased studios stay warm and are
   * re-checked; a failed checkpoint pins the studio and is reported.
   */
  async suspend(studioId: string, reason: string): Promise<boolean> {
    const r = this.records.get(studioId);
    if (!r || r.state !== 'warm' || !this.opts.isEnabled()) return false;
    const adapter = this.adapterOf(r);
    if (!adapter?.snapshot || !adapter.suspend) {
      this.setState(r, 'evicted', 'no-adapter');
      return true;
    }
    const blockers = this.blockers(r);
    if (blockers.length) {
      r.pinReasons = blockers;
      this.telemetry.event({ type: 'pin', studioId, reason: blockers.join(',') });
      this.cancelPinRecheck(r);
      r.pinRecheckTimer = this.clock.setTimeout(() => {
        r.pinRecheckTimer = undefined;
        if (r.state === 'warm') void this.suspend(r.id, 'pin-recheck');
      }, PIN_RECHECK_MS);
      return false;
    }
    r.pinReasons = [];
    const generation = r.generation;
    const started = this.clock.now();
    let snapshot: StudioSnapshot | null = null;
    try {
      snapshot = await adapter.snapshot();
    } catch (error) {
      snapshot = null;
      r.lastError = error instanceof Error ? error.message : String(error);
    }
    if (!snapshot) {
      r.lastError ??= 'snapshot returned null';
      r.pinReasons = ['snapshot-failed'];
      this.telemetry.event({ type: 'snapshot-failed', studioId, reason: r.lastError });
      this.opts.onProblem?.(`Studio ${studioId} could not checkpoint its state; it stays in memory. Save your work to free it.`);
      return false;
    }
    if (r.generation !== generation || r.state !== 'warm') return false; // reactivated mid-snapshot
    if (!(await this.checkpoints.put(snapshot))) {
      this.telemetry.event({ type: 'checkpoint-refused', studioId, bytes: snapshot.bytesEstimate });
      r.pinReasons = ['checkpoint-budget'];
      return false;
    }
    try {
      await adapter.suspend();
    } catch (error) {
      r.lastError = error instanceof Error ? error.message : String(error);
      this.checkpoints.delete(studioId);
      this.telemetry.event({ type: 'snapshot-failed', studioId, reason: r.lastError });
      this.opts.onProblem?.(`Studio ${studioId} failed to release its resources cleanly.`);
      return false;
    }
    if (r.generation !== generation || r.state !== 'warm') {
      // Reactivated during release: keep the checkpoint for the next suspend.
      return false;
    }
    this.telemetry.mark(`suspend:${studioId}`);
    this.setState(r, 'suspended', reason, this.clock.now() - started);
    return true;
  }

  private async resumeInternal(r: StudioRecord): Promise<boolean> {
    const adapter = this.adapterOf(r);
    if (!this.checkpoints.get(r.id)) await this.checkpoints.hydrate(r.id);
    const snapshot = this.checkpoints.get(r.id);
    if (!adapter?.resume || !snapshot) {
      this.checkpoints.delete(r.id);
      this.setState(r, 'active', 'resume-without-checkpoint');
      return true;
    }
    const generation = r.generation;
    const started = this.clock.now();
    try {
      await adapter.resume(snapshot);
    } catch (error) {
      r.lastError = error instanceof Error ? error.message : String(error);
      this.telemetry.event({ type: 'resume-failed', studioId: r.id, reason: r.lastError });
      this.opts.onProblem?.(`Studio ${r.id} could not restore its suspended session; the checkpoint is kept for retry.`);
      return false; // checkpoint retained for retry, never silently replaced
    }
    if (r.generation !== generation) return false;
    this.checkpoints.delete(r.id);
    r.lastError = undefined;
    const now = this.clock.now();
    r.resumeTimes = [...r.resumeTimes.filter((t) => now - t < CHURN_WINDOW_MS), now];
    if (r.resumeTimes.length >= CHURN_RESUME_COUNT && now >= r.churnedUntil) {
      r.churnedUntil = now + CHURN_WINDOW_MS;
      this.telemetry.event({ type: 'churn', studioId: r.id, reason: 'repeated suspend/resume cycles' });
    }
    this.telemetry.mark(`resume:${r.id}`);
    this.setState(r, 'active', 'resume', this.clock.now() - started);
    return true;
  }

  /**
   * Evict a suspended studio's remaining runtime data. Refused while the
   * studio holds the sole recoverable copy of unsaved edits (concept: never
   * evict it; the checkpoint pins the session instead).
   */
  async evict(studioId: string, reason: string): Promise<boolean> {
    const r = this.records.get(studioId);
    if (!r || r.state !== 'suspended') return false;
    const adapter = this.adapterOf(r);
    if (adapter?.hasUnsavedChanges?.()) {
      this.telemetry.event({ type: 'evict-refused', studioId, reason: 'unsaved-changes' });
      return false;
    }
    try {
      await adapter?.dispose?.();
    } catch (error) {
      r.lastError = error instanceof Error ? error.message : String(error);
      this.opts.onProblem?.(`Studio ${studioId} failed during eviction cleanup.`);
      return false;
    }
    // Keep the checkpoint: it is the durable recovery record for evicted state.
    this.setState(r, 'evicted', reason);
    return true;
  }

  /** Tracked bytes: active and warm estimates plus suspended checkpoint bytes. */
  trackedBytes(): number {
    let total = this.checkpoints.bytes();
    for (const r of this.records.values()) {
      if (r.state === 'active' || r.state === 'warm') {
        try {
          total += this.adapterOf(r)?.estimateBytes?.() ?? 0;
        } catch {
          /* estimation must never break the coordinator */
        }
      }
    }
    return total;
  }

  /**
   * Pressure handling (concept section 3): enter at 80% of the envelope,
   * exit below 65% held for ten seconds, critical at 95%. Pressure bypasses
   * the warm grace and suspends warm studios. An external memory-probe ratio
   * (see probe.ts) merges by maximum into the same thresholds.
   */
  evaluatePressure(externalRatio?: number | null): PressureLevel {
    if (!this.opts.isEnabled()) return 'normal';
    const envelope = this.opts.profile().envelopeBytes;
    const estimated = envelope > 0 ? this.trackedBytes() / envelope : 0;
    // External signal from the memory probe (native RSS/system on desktop, JS
    // heap vs limit on web). Merged by maximum: either signal raises
    // pressure, and both must subside before pressure exits.
    const external =
      typeof externalRatio === 'number' && Number.isFinite(externalRatio) && externalRatio > 0
        ? Math.min(externalRatio, 1)
        : null;
    const ratio = Math.max(estimated, external ?? 0);
    const now = this.clock.now();
    if (!this.inPressure && ratio >= PRESSURE_ENTER_RATIO) {
      this.inPressure = true;
      this.pressureExitSince = null;
      this.telemetry.event({ type: 'pressure-enter', bytes: this.trackedBytes(), externalRatio: external ?? undefined });
      for (const r of this.records.values()) {
        if (r.state === 'warm') {
          this.cancelWarmTimer(r);
          void this.suspend(r.id, 'pressure');
        }
      }
    } else if (this.inPressure) {
      if (ratio < PRESSURE_EXIT_RATIO) {
        this.pressureExitSince ??= now;
        if (now - this.pressureExitSince >= PRESSURE_EXIT_HOLD_MS) {
          this.inPressure = false;
          this.pressureExitSince = null;
          this.telemetry.event({ type: 'pressure-exit', bytes: this.trackedBytes(), externalRatio: external ?? undefined });
        }
      } else {
        this.pressureExitSince = null;
      }
    }
    return ratio >= PRESSURE_CRITICAL_RATIO ? 'critical' : this.inPressure ? 'pressure' : 'normal';
  }

  /**
   * Admission gate for optional heavy work (speculative decode, prefetch,
   * thumbnail sweeps). P0 integrity work (saves, recovery commits, recording,
   * playback) is never gated here.
   */
  admissionAllowed(): boolean {
    if (!this.opts.isEnabled()) return true;
    const envelope = this.opts.profile().envelopeBytes;
    const allowed = envelope <= 0 || this.trackedBytes() / envelope < PRESSURE_CRITICAL_RATIO;
    if (!allowed) this.telemetry.event({ type: 'admission-blocked', bytes: this.trackedBytes() });
    return allowed;
  }

  /** Drop all checkpoints (memory and durable spill). User-initiated cleanup. */
  clearCheckpoints(): void {
    this.checkpoints.clear();
  }

  /**
   * Turn lifecycle management off (Settings opt-out): cancel timers and
   * restore suspended studios from their checkpoints so nothing user-visible
   * depends on a disabled subsystem.
   */
  async disable(): Promise<void> {
    for (const r of this.records.values()) {
      this.cancelWarmTimer(r);
      this.cancelPinRecheck(r);
    }
    for (const r of this.records.values()) {
      if (r.state === 'suspended') {
        r.generation++;
        await this.resumeInternal(r);
      }
    }
    this.inPressure = false;
    this.pressureExitSince = null;
  }
}
