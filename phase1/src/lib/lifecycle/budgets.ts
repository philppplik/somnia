/**
 * Resource budget profiles from docs/concepts/performance-resource-architecture.md
 * section 5. These are soft tracked-resource allowances, not OS RSS caps:
 * native/WebView overhead and GPU residency sit outside this estimate.
 */
const MiB = 1024 * 1024;

export type ResourceProfileId = 'low' | 'normal' | 'high';

export interface ResourceBudgetBuckets {
  shell: number;
  active: number;
  warm: number;
  suspended: number;
  jobs: number;
  extensions: number;
}

export interface ResourceBudgetProfile {
  id: ResourceProfileId;
  /** Admission envelope: bucket total plus 256 MiB transient/estimation margin. */
  envelopeBytes: number;
  buckets: ResourceBudgetBuckets;
  /** Warm studios retained for fast return. Low memory disables the warm slot. */
  warmSlots: number;
  /** Heavy background jobs admitted concurrently. */
  heavyJobs: number;
}

const NORMAL_BUCKETS: ResourceBudgetBuckets = {
  shell: 256 * MiB,
  active: 512 * MiB,
  warm: 128 * MiB,
  suspended: 64 * MiB,
  jobs: 256 * MiB,
  extensions: 64 * MiB,
};

const half = (b: ResourceBudgetBuckets): ResourceBudgetBuckets =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.floor(v / 2)])) as unknown as ResourceBudgetBuckets;

export const LOW_PROFILE: ResourceBudgetProfile = {
  id: 'low',
  envelopeBytes: 768 * MiB,
  buckets: half(NORMAL_BUCKETS),
  warmSlots: 0,
  heavyJobs: 1,
};

export const NORMAL_PROFILE: ResourceBudgetProfile = {
  id: 'normal',
  envelopeBytes: 1536 * MiB,
  buckets: NORMAL_BUCKETS,
  warmSlots: 1,
  heavyJobs: 2,
};

/** Candidate only: the concept allows expansion with measured headroom. */
export const HIGH_PROFILE: ResourceBudgetProfile = {
  id: 'high',
  envelopeBytes: 3072 * MiB,
  buckets: {
    shell: 256 * MiB,
    active: 1024 * MiB,
    warm: 256 * MiB,
    suspended: 128 * MiB,
    jobs: 512 * MiB,
    extensions: 64 * MiB,
  },
  warmSlots: 1,
  heavyJobs: 2,
};

export const PROFILES: Record<ResourceProfileId, ResourceBudgetProfile> = {
  low: LOW_PROFILE,
  normal: NORMAL_PROFILE,
  high: HIGH_PROFILE,
};

/** Pressure enters at 80% of the envelope, exits below 65% held for ten
 * seconds, and blocks optional admission at 95% (concept section 3). */
export const PRESSURE_ENTER_RATIO = 0.8;
export const PRESSURE_EXIT_RATIO = 0.65;
export const PRESSURE_EXIT_HOLD_MS = 10_000;
export const PRESSURE_CRITICAL_RATIO = 0.95;

export type ResourceProfileSetting = 'auto' | ResourceProfileId;

export interface DeviceHints {
  /** navigator.deviceMemory: a hint, not exact desktop capacity. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/**
 * Pick a profile from the user's setting and device hints. Unknown hints fall
 * back to the normal profile: Somnia targets desktop (reference 16 GiB) and
 * the envelope already carries a 256 MiB estimation margin; users on small
 * machines can force the low-memory profile in Settings > Advanced.
 */
export function resolveProfile(setting: ResourceProfileSetting, hints: DeviceHints = {}): ResourceBudgetProfile {
  if (setting !== 'auto') return PROFILES[setting];
  const mem = hints.deviceMemory;
  if (typeof mem === 'number' && mem > 0 && mem <= 6) return LOW_PROFILE;
  return NORMAL_PROFILE;
}
