/**
 * Renderer-side contract for live deployment commands (docs/concepts/live-deployment.md, section 11).
 * Mirrors the serde camelCase shapes of src-tauri/src/deploy_guard.rs and deploy_targets.rs.
 * Nothing here carries key material: targets are identified by id, keys by slot, hosts by fingerprint.
 */
export type DeployTargetKind = 'static' | 'node' | 'upload-only' | 'ftp';
export type FtpSecurity = 'explicit-tls' | 'plain';
export type FtpVerify = 'ca' | 'pinned';
/** FTP/FTPS targets only. Mirrors FtpSettings in deploy_targets.rs. The password lives in the keychain, never here. */
export interface DeployFtpSettings { security: FtpSecurity; verify: FtpVerify; allowPlain: boolean; remotePath: string }
/** One row of the read-only remote listing. */
export interface DeployRemoteEntry { name: string; kind: 'file' | 'dir' | 'other'; size: number | null }

export interface DeployTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  domain?: string;
  kind: DeployTargetKind;
  /** Always `deploy-key:<id>`. */
  keySlot: string;
  spa?: boolean;
  /** Node targets: loopback port of the app. */
  appPort?: number;
  /** Kind `ftp` only. */
  ftp?: DeployFtpSettings;
}

export type DeployTargetState = 'key-missing' | 'needs-trust' | 'ready';
export interface DeployTargetStatus { target: DeployTarget; state: DeployTargetState; fingerprint?: string }

export type DeployAction = 'publish' | 'rollback';
export type DeployChange = 'added' | 'changed' | 'removed' | 'unchanged';
export interface DeployPlanFile { path: string; size: number; sha256: string; change: DeployChange }

/** What the human approves. `planHash` binds target, pinned fingerprint, build and exact file list. */
export interface DeployPlan {
  planHash: string;
  action: DeployAction;
  targetId: string;
  fingerprint: string;
  buildId: string;
  liveRelease?: string | null;
  releaseId?: string | null;
  files: DeployPlanFile[];
}

export interface DeployOutcome { releaseId: string; url?: string | null; rolledBack: boolean }
export interface DeployHostKeyInfo { algorithm: string; fingerprint: string }

/** Everything the renderer may ask the Rust deploy service. No call takes or returns a secret. */
export interface DeployBackend {
  /** Additive D7 adapters. Missing support is a real error, never a simulated result. */
  keyPublic?(targetId: string): Promise<string>;
  /** FTP targets: stores the password in the keychain. It is never returned. */
  ftpPasswordSet?(targetId: string, password: string): Promise<void>;
  /** FTP targets: read-only listing of one remote directory. */
  remoteList?(targetId: string, path: string): Promise<DeployRemoteEntry[]>;
  liveRelease?(targetId: string): Promise<string | null>;
  cancel?(targetId: string): Promise<boolean>;
  bootstrapScript?(targetId: string): Promise<string>;
  bootstrapRun?(input: import('./setup').DeployBootstrapInput): Promise<import('./setup').DeployBootstrapReport>;
  dnsCheck?(targetId: string): Promise<import('./setup').DeployDnsCheck>;
  targetsList(): Promise<DeployTargetStatus[]>;
  targetSave(target: DeployTarget): Promise<void>;
  targetDelete(targetId: string, deleteKey: boolean): Promise<void>;
  plan(targetId: string): Promise<DeployPlan>;
  planRollback(targetId: string, releaseId: string): Promise<DeployPlan>;
  /** Mints the one-time token for a plan hash the Rust side produced. Only the confirmation path calls this. */
  confirmIssue(planHash: string): Promise<string>;
  publish(args: { targetId: string; planHash: string; token: string }): Promise<DeployOutcome>;
  rollback(args: { targetId: string; releaseId: string; planHash: string; token: string }): Promise<DeployOutcome>;
  hostkeyProbe(targetId: string): Promise<DeployHostKeyInfo>;
  hostkeyTrust(targetId: string, fingerprint: string): Promise<void>;
  hostkeyReplace(args: { targetId: string; oldFingerprint: string; newFingerprint: string; acknowledged: boolean }): Promise<void>;
  /** Returns the public key line. The private key goes straight into the OS keychain. */
  keyCreate(targetId: string): Promise<string>;
  /** Release ids that exist on the server, for the rollback list. Read-only. */
  releasesList(targetId: string): Promise<string[]>;
  /** Opens https://<domain> of the target in the system browser. The URL is built in Rust. */
  openSite(targetId: string): Promise<void>;
}

export const DEPLOY_PROGRESS_EVENT = 'deploy-progress';

/** Payload of the `deploy-progress` event. `step` is a short engine word such as `upload` or `upload:7/12`. */
export interface DeployProgressEvent { targetId: string; step: string }
