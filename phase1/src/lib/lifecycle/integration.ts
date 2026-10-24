import { NORMAL_PROFILE, resolveProfile } from './budgets';
import { CheckpointStore } from './checkpoints';
import { createMemoryProbe, type MemoryProbe } from './probe';
import { IdbCheckpointSpill } from './idbSpill';
import { StudioLifecycleManager, type PressureLevel } from './manager';
import { readLifecycleSettings } from './settings';
import { getLifecycleTelemetry } from './telemetry';
import type { StudioLifecycleAdapter } from './types';
import { jobScheduler, type JobScheduler } from '../jobs/scheduler';
import { applyJobBudget, wireJobLeases } from '../jobs/lifecycleBridge';

/**
 * Wiring seam between the lifecycle core and the app shell. Kept free of
 * store imports (layer rules): main.tsx injects the store accessors and the
 * manifest adapter resolver. Job lease protection, pressure and profile budgets
 * are installed here before the first studio activation.
 */
export interface LifecycleWiring {
  /** Store subscription; fires after every state patch. */
  subscribe(fn: () => void): () => void;
  getActiveStudio(): string;
  /** Resolve a studio's lifecycle adapter factory from its manifest. */
  resolveAdapter(studioId: string): StudioLifecycleAdapter | undefined;
  onProblem?(message: string): void;
  /**
   * Optional observer of pressure-level changes. The installed scheduler
   * always receives pressure directly, even when this callback is omitted.
   */
  onPressure?(level: PressureLevel): void;
  /** Application scheduler; injectable for isolated tests. */
  scheduler?: JobScheduler;
  /** Pressure re-evaluation cadence; defaults to 5 seconds. */
  pressureIntervalMs?: number;
  /**
   * Memory probe (native RSS/system on desktop, JS heap on web). Defaults to
   * createMemoryProbe(); injectable for tests and harness runs.
   */
  probe?: MemoryProbe;
}

let current: StudioLifecycleManager | null = null;

/** The installed manager, or null before install / after dispose. */
export const getStudioLifecycle = (): StudioLifecycleManager | null => current;

let currentPressure: PressureLevel = 'normal';

/** Latest evaluated memory pressure ('normal' until the first probe runs). Read-only for consumers like extension idle-suspend. */
export const currentLifecyclePressure = (): PressureLevel => currentPressure;

export function installStudioLifecycle(wiring: LifecycleWiring): () => void {
  // Suspended checkpoints share the concept's 64 MiB bucket; overflow spills
  // to IndexedDB (local, private, 7-day retention) instead of being refused.
  const checkpoints = new CheckpointStore(NORMAL_PROFILE.buckets.suspended, {
    spill: IdbCheckpointSpill.available() ? new IdbCheckpointSpill() : undefined,
    onSpillError: () => wiring.onProblem?.('Recovery checkpoints could not be written to local storage; affected studios stay in memory.'),
  });
  const profile = () => {
    const settings = readLifecycleSettings();
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    return resolveProfile(settings.profile, {
      deviceMemory: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
      hardwareConcurrency: nav?.hardwareConcurrency,
    });
  };
  const scheduler = wiring.scheduler ?? jobScheduler;
  let lastPressure: PressureLevel = 'normal';
  let disposed = false;
  let evaluating = false;
  const manager = new StudioLifecycleManager({
    resolveAdapter: wiring.resolveAdapter,
    checkpoints,
    isEnabled: () => readLifecycleSettings().enabled,
    profile,
    telemetry: getLifecycleTelemetry(),
    onProblem: wiring.onProblem,
  });
  current = manager;
  const unlease = wireJobLeases(manager, scheduler);
  applyJobBudget(profile(), lastPressure, scheduler);

  let last = wiring.getActiveStudio();
  void manager.activate(last);
  const unsubscribe = wiring.subscribe(() => {
    applyJobBudget(profile(), lastPressure, scheduler);
    const id = wiring.getActiveStudio();
    if (id !== last) {
      last = id;
      void manager.activate(id);
    }
  });
  const probe = wiring.probe ?? createMemoryProbe();
  const evaluate = async (): Promise<void> => {
    if (disposed || evaluating) return;
    evaluating = true;
    try {
      const sample = await probe.sample().catch(() => null);
      if (disposed) return; // An old probe must not alter a new installation.
      const budget = profile();
      const trackedRatio = (manager.trackedBytes() + scheduler.reservedBytes()) / budget.envelopeBytes;
      const externalRatio = sample && Number.isFinite(sample.totalBytes) && sample.totalBytes > 0
        && Number.isFinite(sample.usedBytes) && sample.usedBytes >= 0
        ? sample.usedBytes / sample.totalBytes : 0;
      const level = manager.evaluatePressure(Math.max(trackedRatio, externalRatio));
      applyJobBudget(budget, level, scheduler);
      if (level !== lastPressure) {
        lastPressure = level;
        currentPressure = level;
        wiring.onPressure?.(level);
      }
    } finally { evaluating = false; }
  };
  void evaluate();
  const pressureTimer = setInterval(() => void evaluate(), wiring.pressureIntervalMs ?? 5_000);

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    unlease();
    clearInterval(pressureTimer);
    void manager.disable();
    if (current === manager) {
      current = null;
      applyJobBudget(NORMAL_PROFILE, 'normal', scheduler);
    }
  };
}
