/**
 * Studio lifecycle contract (performance and resource architecture).
 * See docs/concepts/performance-resource-architecture.md (binding concept) and
 * docs/studio-lifecycle.md (this implementation).
 *
 * States: active (visible, full resources), warm (recently used, retained for
 * fast return, no continuous work), suspended (verified checkpoint, view-owned
 * workers/timers/decoders released), evicted (no runtime data, durable source
 * or recovery checkpoint remains).
 */
export type StudioLifecycleState = 'active' | 'warm' | 'suspended' | 'evicted';

/** States a studio can be in before the manager has ever seen it. */
export type StudioLifecycleStatus = StudioLifecycleState | 'cold';

/**
 * Versioned semantic checkpoint of one studio's recoverable state.
 * The payload must never contain secrets, API keys, Blob URLs, worker handles
 * or other transient pointers; those are recreated on resume.
 */
export interface StudioSnapshot {
  studioId: string;
  schemaVersion: number;
  /** Identity of the durable source the checkpoint was taken against. */
  sourceFingerprint?: string;
  /** Studio-defined revision counter; new edits must invalidate older snapshots. */
  revision: number;
  /** Wall-clock capture time (Date.now). */
  capturedAt: number;
  /** Estimated retained bytes of the payload. */
  bytesEstimate: number;
  /** Integrity checksum over the identity fields and payload; see checksum.ts. */
  checksum: string;
  /** Studio-defined recovery data. */
  payload: unknown;
  /** Replaceable view state (caret, scroll, selection, tool, viewport). */
  viewState?: unknown;
}

/**
 * Optional per-studio hooks. All hooks are optional; a studio without an
 * adapter stays fully resident (current behavior). Adapters must be safe to
 * call from the studio's own UI thread and must never block on user input.
 */
export interface StudioLifecycleAdapter {
  /** Estimated exclusive bytes of reconstructible runtime resources. */
  estimateBytes?(): number;
  /**
   * Resource identities used for job-lease lookups. The manager asks every
   * registered lease provider (for example the job scheduler's hasLease)
   * before suspending. Convention: 'studio:<id>' plus studio-owned ids.
   */
  resourceIds?(): readonly string[];
  /**
   * Owned reasons that currently forbid suspension (IME composition, pointer
   * transactions, recording, playback, presentation, non-cancellable writes).
   * Pin with completion handling, never as a permanent exception.
   */
  pinReasons?(): readonly string[];
  /** True while this studio holds the sole recoverable copy of unsaved edits. */
  hasUnsavedChanges?(): boolean;
  /**
   * Capture a verified, current checkpoint. Return null to refuse suspension;
   * the manager then pins the studio warm and reports the failure.
   */
  snapshot?(): Promise<StudioSnapshot | null>;
  /** Release view-owned workers, timers, decoders, GPU surfaces and caches. */
  suspend?(): Promise<void>;
  /**
   * Restore from a verified checkpoint. Implementations must re-register
   * their session entries synchronously (before the first await) so the
   * regular mount path does not recreate a session from stale source bytes.
   */
  resume?(snapshot: StudioSnapshot): Promise<void>;
  /** Drop all runtime data. Never called while hasUnsavedChanges() is true. */
  dispose?(): Promise<void>;
}

export type LifecycleEventType =
  | 'transition'
  | 'pin'
  | 'churn'
  | 'pressure-enter'
  | 'pressure-exit'
  | 'admission-blocked'
  | 'snapshot-failed'
  | 'resume-failed'
  | 'evict-refused'
  | 'checkpoint-refused';

/** Telemetry event. Carries studio ids and counters only, never document
 * names, paths, prompts or payload content. */
export interface LifecycleEvent {
  type: LifecycleEventType;
  at: number;
  studioId?: string;
  from?: StudioLifecycleStatus;
  to?: StudioLifecycleStatus;
  reason?: string;
  /** Duration of the transition in milliseconds, when measured. */
  ms?: number;
  bytes?: number;
  /** External memory-probe ratio (0..1) that contributed to a pressure event. */
  externalRatio?: number;
}
