// Typed contracts for commands migrated to the typed boundary (cmd()/invokeCmd).
// Keys are JS argument names (camelCase); Rust params are snake_case and Tauri maps them.
// DTOs are camelCase (serde rename_all = "camelCase" on the Rust side).
// Commands that are not listed here still go through invokeCmd with untyped args/result until migrated.

// ---- D2 single-instance intake (domain intake, boundary B7) ----
export interface OpenRequestItemSummary { ordinal: number; displayName: string; ext: string; size: number }
export interface OpenRequestSummary { id: string; source: string; generation: number; items: OpenRequestItemSummary[] }
export type ClaimItemStatus = 'granted' | 'activated-existing' | 'rejected' | string;
export interface ClaimedItem {
  ordinal: number;
  grant?: string;
  displayName: string;
  ext: string;
  size: number;
  identityToken: string;
  status: ClaimItemStatus;
  existingProjectId?: string;
}
export interface ClaimReply { items: ClaimedItem[] }
export interface GrantRead { name: string; ext: string; size: number; identityToken: string; dataBase64: string }
export type ItemOutcomeStatus = 'opened' | 'failed' | 'cancelled' | 'deferred' | 'activated-existing' | 'rejected';
export interface ItemOutcome { ordinal: number; status: ItemOutcomeStatus; cause?: string }
export interface RetryToken { ordinal: number; token: string }
export interface AckReply { accepted: number[]; retryTokens: RetryToken[] }
export interface IntakePolicy { allowUnc: boolean }

// ---- D3 diagnostics ZIP + crash/incident store (D1 errata 4/5) ----
// DiagnosticsSelection / DiagnosticSnapshot are owned by D3 (diagnostics UI). The shapes below are the
// minimum this boundary relies on; D3 may narrow them by replacing these aliases.
export interface DiagnosticsSelection { [toggle: string]: boolean }
export interface DiagnosticFilePreview { name: string; bytes: number; text: string }
export interface DiagnosticSnapshot {
  snapshotId: string;
  files: DiagnosticFilePreview[];
  reportText: string;
  omissions: string[];
}
export type SaveOutcome = { kind: 'saved'; bytes: number } | { kind: 'cancelled' };
export type IncidentKind = 'native-panic' | 'frontend-fatal' | 'unclean-exit';
export interface CrashMeta {
  incidentId: string;
  kind: IncidentKind;
  occurredAt: string;
  errorId: string;
  reviewedAt: string | null;
  build: Record<string, unknown>;
  recovery: Array<Record<string, unknown>>;
  artifacts: Array<{ kind: 'incident' | 'log'; bytes: number; available: boolean }>;
}
/** Allowlist DTO for a renderer-side fatal (boot reporter / error boundary). */
export interface FrontendFatalEntry { errorId: string; ts: string; message: string; boundary?: string; corr?: string }

type Contract<A, R> = { args: A; result: R };

export interface CommandContracts {
  drain_open_requests: Contract<undefined, OpenRequestSummary[]>;
  claim_open_request: Contract<{ requestId: string }, ClaimReply>;
  read_by_grant: Contract<{ grant: string }, GrantRead>;
  ack_open_request: Contract<{ requestId: string; outcomes: ItemOutcome[] }, AckReply>;
  release_candidate: Contract<{ requestId: string }, null>;
  retry_open_item: Contract<{ requestId: string; ordinal: number; retryToken: string }, ClaimReply>;
  get_intake_policy: Contract<undefined, IntakePolicy>;
  set_intake_policy: Contract<{ allowUnc: boolean }, null>;
  build_diagnostic_zip: Contract<{ selection: DiagnosticsSelection; rendererEntries: unknown[] }, DiagnosticSnapshot>;
  write_diagnostic_zip: Contract<{ snapshotId: string }, SaveOutcome>;
  discard_diagnostic_snapshot: Contract<{ snapshotId: string }, null>;
  list_crash_reports: Contract<undefined, CrashMeta[]>;
  mark_crash_reports_reviewed: Contract<{ ids: string[] }, null>;
  delete_crash_reports: Contract<{ ids: string[] }, null>;
  record_frontend_fatal: Contract<{ entry: FrontendFatalEntry }, null>;
}
