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
/** Single-use token for one item. `expiresAt` is epoch milliseconds (UTC); the host mints a 60 s TTL. After it, no retry. */
export interface RetryToken { ordinal: number; token: string; expiresAt: number }
export interface AckReply { accepted: number[]; retryTokens: RetryToken[] }
export interface IntakePolicy { allowUnc: boolean }

// ---- D3 diagnostics ZIP + crash/incident store (D1 errata 4/5) ----
// D1-owned native diagnostics DTOs; canonical save tag is kind.
export interface DiagnosticsSelection {
  incidentIds: readonly string[];
  includeLogs: boolean;
  includeIncidentDetails: boolean;
  includeCapabilityHealth: boolean;
}
export interface DiagnosticFilePreview {
  name: 'manifest.json'|'incidents.jsonl'|'logs.jsonl'|'swallow-counters.json'|'health.json';
  utf8Bytes: number;
  text: string;
}
export interface DiagnosticSnapshot {
  snapshotId: string;
  createdAt: string;
  selection: DiagnosticsSelection;
  files: readonly DiagnosticFilePreview[];
  reportText: string;
  totalUncompressedBytes: number;
  expiresAt: string;
  health: 'complete'|'partial'|'unavailable';
  omissions: readonly string[];
}
export type SaveOutcome = { kind: 'saved'; bytes: number } | { kind: 'cancelled' };
export type IncidentKind = 'native-panic' | 'frontend-fatal' | 'unclean-exit';
export interface CrashMeta {
  incidentId: string;
  kind: IncidentKind;
  occurredAt: string;
  errorId: string;
  reviewedAt: string | null;
  build: import('./diagnostics/ids').BuildIdentity;
  recovery: import('./diagnostics/ids').RecoveryEvidence[];
  artifacts: Array<{ kind: 'incident' | 'log'; bytes: number; available: boolean }>;
}
/** Fatal export-safe event; no free-text exception payload is accepted. */
export type FrontendFatalEntry = import('./diagnostics/ids').SafeLogEvent & {fatal:true};

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
  deploy_targets_list: Contract<undefined, import('./deploy/contract').DeployTargetStatus[]>;
  deploy_target_save: Contract<{ target: import('./deploy/contract').DeployTarget }, null>;
  deploy_target_delete: Contract<{ targetId: string; deleteKey: boolean }, null>;
  deploy_plan: Contract<{ targetId: string }, import('./deploy/contract').DeployPlan>;
  deploy_plan_rollback: Contract<{ targetId: string; releaseId: string }, import('./deploy/contract').DeployPlan>;
  deploy_confirm_issue: Contract<{ planHash: string }, string>;
  deploy_publish: Contract<{ targetId: string; planHash: string; token: string }, import('./deploy/contract').DeployOutcome>;
  deploy_rollback: Contract<{ targetId: string; releaseId: string; planHash: string; token: string }, import('./deploy/contract').DeployOutcome>;
  deploy_hostkey_probe: Contract<{ targetId: string }, import('./deploy/contract').DeployHostKeyInfo>;
  deploy_hostkey_trust: Contract<{ targetId: string; fingerprint: string }, null>;
  deploy_hostkey_replace: Contract<{ targetId: string; oldFingerprint: string; newFingerprint: string; acknowledged: boolean }, null>;
  deploy_key_create: Contract<{ targetId: string }, string>;
  deploy_releases: Contract<{ targetId: string }, string[]>;
  deploy_key_public: Contract<{ targetId: string }, string>;
  deploy_live_release: Contract<{ targetId: string }, string | null>;
  deploy_cancel: Contract<{ targetId: string }, boolean>;
  deploy_bootstrap_script: Contract<{ targetId: string }, string>;
  deploy_bootstrap_run: Contract<import('./deploy/setup').DeployBootstrapInput, import('./deploy/setup').DeployBootstrapReport>;
  deploy_dns_check: Contract<{ targetId: string }, import('./deploy/setup').DeployDnsCheck>;
  deploy_open_site: Contract<{ targetId: string }, null>;
  deploy_node_env_keys: Contract<{ targetId: string }, string[]>;
  deploy_node_env_apply: Contract<{ targetId: string; set: Array<{ key: string; value: string }>; remove: string[] }, string[]>;
  deploy_node_logs: Contract<{ targetId: string; lines: number }, string[]>;
  deploy_node_status: Contract<{ targetId: string }, NodeStatusView>;
  deploy_node_artifact_collect: Contract<{ targetId: string }, NodeArtifactView>;
}

export interface NodeStatusView {
  active: string;
  restarts: number;
  port: number | null;
  current: string | null;
  nodeVersion: string | null;
  lastHealth: { release: string; status: string; at: number } | null;
}
export interface NodeArtifactView {
  framework: string;
  entry: string;
  install: boolean;
  fileCount: number;
  totalBytes: number;
  nodeRange: string | null;
  buildId: string;
}
