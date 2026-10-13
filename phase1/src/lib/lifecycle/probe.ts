import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Native memory probing seam (concept section 3: pressure from real memory
 * signals, not only the tracked-byte estimate). The probe samples the best
 * available source and reports a used/total pair; the manager merges the
 * external ratio with its estimate by taking the maximum, so either signal
 * can raise pressure and both must subside before pressure exits.
 *
 * Desktop (Tauri) is the primary source: the native side can read real
 * process RSS and system memory. The Rust command is a follow-up on the
 * native branch; until it exists the invoke fails and the probe degrades to
 * the JS heap signal without retry storms.
 */
export const NATIVE_MEMORY_SAMPLE_COMMAND = 'lifecycle_memory_sample';

export type MemoryProbeSource = 'tauri-native' | 'js-heap';

export interface DeviceMemorySample {
  usedBytes: number;
  totalBytes: number;
  source: MemoryProbeSource;
}

export interface MemoryProbe {
  /** Best-effort sample; null when no source is available. Never throws. */
  sample(): Promise<DeviceMemorySample | null>;
}

export interface MemoryProbeDeps {
  isTauri?: () => boolean;
  invokeNative?: (command: string) => Promise<unknown>;
  /** Chrome's performance.memory; absent on Firefox/Safari and in workers. */
  jsHeap?: () => { usedBytes: number; totalBytes: number } | null;
}

const defaultJsHeap = (): { usedBytes: number; totalBytes: number } | null => {
  const memory = (globalThis.performance as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } } | undefined)
    ?.memory;
  if (!memory) return null;
  const used = memory.usedJSHeapSize;
  const limit = memory.jsHeapSizeLimit;
  if (typeof used !== 'number' || typeof limit !== 'number' || used <= 0 || limit <= 0) return null;
  return { usedBytes: used, totalBytes: limit };
};

const parseNativeSample = (value: unknown): DeviceMemorySample | null => {
  if (!value || typeof value !== 'object') return null;
  const { usedBytes, totalBytes } = value as { usedBytes?: unknown; totalBytes?: unknown };
  if (typeof usedBytes !== 'number' || typeof totalBytes !== 'number') return null;
  if (!(usedBytes >= 0) || !(totalBytes > 0) || usedBytes > totalBytes) return null;
  return { usedBytes, totalBytes, source: 'tauri-native' };
};

export function createMemoryProbe(deps: MemoryProbeDeps = {}): MemoryProbe {
  const inTauri = deps.isTauri ?? isTauri;
  const invokeNative = deps.invokeNative ?? ((command: string) => invoke(command));
  const jsHeap = deps.jsHeap ?? defaultJsHeap;
  // A missing/failed native command is remembered for the session: sampling
  // runs on a few-second cadence and the Rust command either exists for the
  // whole run or not at all.
  let nativeBroken = false;

  return {
    async sample(): Promise<DeviceMemorySample | null> {
      if (!nativeBroken && inTauri()) {
        try {
          const native = parseNativeSample(await invokeNative(NATIVE_MEMORY_SAMPLE_COMMAND));
          if (native) return native;
          nativeBroken = true;
        } catch {
          nativeBroken = true;
        }
      }
      const heap = jsHeap();
      return heap ? { ...heap, source: 'js-heap' } : null;
    },
  };
}
