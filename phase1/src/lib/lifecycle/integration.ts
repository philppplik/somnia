import { NORMAL_PROFILE, resolveProfile } from './budgets';
import { StudioLifecycleManager, type PressureLevel } from './manager';
import { readLifecycleSettings } from './settings';
import { getLifecycleTelemetry } from './telemetry';
import type { StudioLifecycleAdapter } from './types';

/**
 * Wiring seam between the lifecycle core and the app shell. Kept free of
 * store imports (layer rules): main.tsx injects the store accessors and the
 * manifest adapter resolver. The job scheduler (perf/lazy-hosts-jobs branch)
 * registers its hasLease lookup through getStudioLifecycle().
 */
export interface LifecycleWiring {
  /** Store subscription; fires after every state patch. */
  subscribe(fn: () => void): () => void;
  getActiveStudio(): string;
  /** Resolve a studio's lifecycle adapter factory from its manifest. */
  resolveAdapter(studioId: string): StudioLifecycleAdapter | undefined;
  onProblem?(message: string): void;
  /**
   * Pressure-level changes, for the job scheduler's setPressure(level)
   * (perf/lazy-hosts-jobs). Levels match its contract exactly.
   */
  onPressure?(level: PressureLevel): void;
  /** Pressure re-evaluation cadence; defaults to 5 seconds. */
  pressureIntervalMs?: number;
}

let current: StudioLifecycleManager | null = null;

/** The installed manager, or null before install / after dispose. */
export const getStudioLifecycle = (): StudioLifecycleManager | null => current;

export function installStudioLifecycle(wiring: LifecycleWiring): () => void {
  const manager = new StudioLifecycleManager({
    resolveAdapter: wiring.resolveAdapter,
    isEnabled: () => readLifecycleSettings().enabled,
    profile: () => {
      const settings = readLifecycleSettings();
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      const hints = {
        deviceMemory: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
        hardwareConcurrency: nav?.hardwareConcurrency,
      };
      const profile = resolveProfile(settings.profile, hints);
      return profile ?? NORMAL_PROFILE;
    },
    telemetry: getLifecycleTelemetry(),
    onProblem: wiring.onProblem,
  });
  current = manager;

  let last = wiring.getActiveStudio();
  void manager.activate(last);
  const unsubscribe = wiring.subscribe(() => {
    const id = wiring.getActiveStudio();
    if (id !== last) {
      last = id;
      void manager.activate(id);
    }
  });
  let lastPressure: PressureLevel = 'normal';
  const evaluate = (): void => {
    const level = manager.evaluatePressure();
    if (level !== lastPressure) {
      lastPressure = level;
      wiring.onPressure?.(level);
    }
  };
  evaluate();
  const pressureTimer = setInterval(evaluate, wiring.pressureIntervalMs ?? 5_000);

  return () => {
    unsubscribe();
    clearInterval(pressureTimer);
    void manager.disable();
    if (current === manager) current = null;
  };
}
