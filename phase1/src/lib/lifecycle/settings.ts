import type { ResourceProfileSetting } from './budgets';

export interface LifecycleSettings {
  /** Master switch. Off = every studio stays resident (pre-lifecycle behavior). */
  enabled: boolean;
  profile: ResourceProfileSetting;
}

export const LIFECYCLE_SETTINGS_KEY = 'somnia.lifecycle.v1';

export const DEFAULT_LIFECYCLE_SETTINGS: LifecycleSettings = { enabled: true, profile: 'auto' };

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): Reader & Writer | undefined => {
  try {
    return typeof globalThis !== 'undefined' ? (globalThis as { localStorage?: Storage }).localStorage : undefined;
  } catch {
    return undefined;
  }
};

const PROFILES: readonly ResourceProfileSetting[] = ['auto', 'low', 'normal', 'high'];

export function readLifecycleSettings(storage?: Reader): LifecycleSettings {
  try {
    const raw = (storage ?? defaultStorage())?.getItem(LIFECYCLE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LIFECYCLE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LifecycleSettings>;
    return {
      enabled: parsed.enabled !== false,
      profile: PROFILES.includes(parsed.profile as ResourceProfileSetting)
        ? (parsed.profile as ResourceProfileSetting)
        : 'auto',
    };
  } catch {
    return { ...DEFAULT_LIFECYCLE_SETTINGS };
  }
}

export function writeLifecycleSettings(patch: Partial<LifecycleSettings>, storage?: Writer): LifecycleSettings {
  const next = { ...readLifecycleSettings(storage), ...patch };
  try {
    (storage ?? defaultStorage())?.setItem(LIFECYCLE_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: session-only setting */
  }
  return next;
}
