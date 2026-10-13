/**
 * Pure helpers for the Publish panel: error codes to plain language, progress steps, release labels
 * and the server form. React-free and secret-free: nothing here ever sees key material.
 */
import type { DeployTarget, DeployTargetKind, DeployTargetState, DeployTargetStatus } from './contract';

/** Every error code the Rust side can return (`deploy:<code>`), see DeployError::code. */
export const DEPLOY_ERROR_CODES = [
  'invalid-input', 'target-not-found', 'storage', 'key-missing', 'key-exists', 'key-backend', 'host-key-unknown', 'host-key-changed',
  'host-key-already-pinned', 'host-key-mismatch', 'not-acknowledged', 'unknown-plan', 'confirmation-invalid', 'plan-changed', 'busy',
  'connect-failed', 'auth-failed', 'host-key-rejected', 'preflight-failed', 'upload-failed', 'switch-failed', 'health-failed-rolled-back',
  'health-failed-rollback-failed', 'no-such-release', 'engine-failed',
] as const;
export type DeployErrorCode = typeof DEPLOY_ERROR_CODES[number];

/** What the person can do next. The panel renders one button per action. */
export type DeployErrorAction = 'retry' | 'edit' | 'showKey' | 'createKey' | 'trust' | 'replaceKey' | 'rollbackList' | 'dismiss';
export interface DeployErrorInfo { code: DeployErrorCode | 'unknown' | 'build'; /** Offending relative path of a refused artifact (build failures only). */ path?: string; messageKey: string; actions: DeployErrorAction[]; /** Nothing went live and nothing changed on the server. */ safe: boolean }

const TABLE: Record<DeployErrorCode, { actions: DeployErrorAction[]; safe: boolean }> = {
  'invalid-input': { actions: ['edit'], safe: true },
  'target-not-found': { actions: ['dismiss'], safe: true },
  'storage': { actions: ['retry'], safe: true },
  'key-missing': { actions: ['createKey'], safe: true },
  'key-exists': { actions: ['showKey'], safe: true },
  'key-backend': { actions: ['retry'], safe: true },
  'host-key-unknown': { actions: ['trust'], safe: true },
  'host-key-changed': { actions: ['replaceKey'], safe: true },
  'host-key-already-pinned': { actions: ['retry'], safe: true },
  'host-key-mismatch': { actions: ['retry'], safe: true },
  'not-acknowledged': { actions: ['dismiss'], safe: true },
  'unknown-plan': { actions: ['retry'], safe: true },
  'confirmation-invalid': { actions: ['retry'], safe: true },
  'plan-changed': { actions: ['retry'], safe: true },
  'busy': { actions: ['dismiss'], safe: true },
  'connect-failed': { actions: ['retry', 'edit'], safe: true },
  'auth-failed': { actions: ['showKey', 'retry'], safe: true },
  'host-key-rejected': { actions: ['replaceKey'], safe: true },
  'preflight-failed': { actions: ['retry'], safe: true },
  'upload-failed': { actions: ['retry'], safe: true },
  'switch-failed': { actions: ['retry', 'rollbackList'], safe: false },
  'health-failed-rolled-back': { actions: ['retry'], safe: true },
  'health-failed-rollback-failed': { actions: ['rollbackList', 'retry'], safe: false },
  'no-such-release': { actions: ['rollbackList'], safe: true },
  'engine-failed': { actions: ['retry'], safe: true },
};

/** Maps any thrown value to plain-language info. Raw messages are never shown; unknown input becomes a generic sentence. */
export function describeDeployError(error: unknown): DeployErrorInfo {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const m = /deploy:([a-z-]+)/.exec(raw);
  const code = m && (DEPLOY_ERROR_CODES as readonly string[]).includes(m[1]!) ? m[1] as DeployErrorCode : null;
  if (!code) return { code: 'unknown', messageKey: 'deploy.err.unknown', actions: ['retry'], safe: true };
  return { code, messageKey: `deploy.err.${code}`, ...TABLE[code] };
}

/** Steps the engine reports through `deploy-progress`. Order is the order shown. */
export const PROGRESS_STEPS = ['connect', 'check', 'upload', 'switch', 'health'] as const;
export type ProgressStepId = typeof PROGRESS_STEPS[number];
export interface ProgressInfo { step: ProgressStepId | 'other'; done?: number; total?: number }

const STEP_ALIASES: Record<string, ProgressStepId> = {
  connect: 'connect', connecting: 'connect', check: 'check', checking: 'check', preflight: 'check', upload: 'upload', uploading: 'upload', stage: 'upload',
  switch: 'switch', activate: 'switch', live: 'switch', health: 'health', verify: 'health', smoke: 'health',
};
/** Accepts `upload`, `upload:7/12`, `upload 7/12` and `uploading 7 of 12`. Unknown words never reach the screen. */
export function parseProgress(step: string): ProgressInfo {
  const m = /^\s*([a-z-]{1,24})(?:\s*[: ]\s*(\d{1,7})\s*(?:\/|of)\s*(\d{1,7}))?\s*$/i.exec(step.slice(0, 80));
  const id = m ? STEP_ALIASES[m[1]!.toLowerCase()] : undefined;
  if (!m || !id) return { step: 'other' };
  const done = m[2] === undefined ? undefined : Number(m[2]);
  const total = m[3] === undefined ? undefined : Number(m[3]);
  return done !== undefined && total !== undefined && total > 0 && done <= total ? { step: id, done, total } : { step: id };
}

/** `20261012T143015Z-ab12cd` to a Date, or null for hand-named ids. */
export function releaseDate(id: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z(?:-[a-z0-9]{1,16})?$/.exec(id);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
  const ok = d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]! && d.getUTCHours() === +m[4]! && d.getUTCMinutes() === +m[5]! && d.getUTCSeconds() === +m[6]!;
  return ok ? d : null;
}
/** Newest first. Ids that are not timestamps sort last, in their given order. */
export function sortReleases(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const da = releaseDate(a)?.getTime(), db = releaseDate(b)?.getTime();
    if (da !== undefined && db !== undefined) return db - da;
    return da !== undefined ? -1 : db !== undefined ? 1 : 0;
  });
}

/** Short form of a fingerprint for lists. The full value always stays in the dialogs. */
export function shortFingerprint(fp: string): string { return fp.length > 24 ? `${fp.slice(0, 15)}...${fp.slice(-6)}` : fp; }

export type TargetNext = 'createKey' | 'trust' | 'publish';
export function nextStep(state: DeployTargetState): TargetNext { return state === 'key-missing' ? 'createKey' : state === 'needs-trust' ? 'trust' : 'publish'; }
/** Upload-only targets have no site to open. */
export function liveUrl(target: Pick<DeployTarget, 'domain' | 'kind'>): string | null { return target.domain ? `https://${target.domain.toLowerCase()}` : null; }

// ---- server form ----

export interface TargetForm { name: string; host: string; port: string; user: string; domain: string; kind: DeployTargetKind; spa: boolean; appPort: string }
export const emptyTargetForm = (): TargetForm => ({ name: '', host: '', port: '22', user: 'somnia', domain: '', kind: 'static', spa: false, appPort: '3000' });
export type FormField = 'name' | 'host' | 'port' | 'user' | 'domain' | 'appPort';
export type FormErrors = Partial<Record<FormField, string>>;

const HOST = /^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
export function isDomain(s: string): boolean {
  return s.length <= 253 && s.includes('.') && s.split('.').every(l => LABEL.test(l));
}
/** Mirrors Target::validate in deploy_targets.rs. Messages are i18n keys. */
export function validateTargetForm(f: TargetForm): FormErrors {
  const e: FormErrors = {};
  const name = f.name.trim();
  if (!name || name.length > 80) e.name = 'deploy.form.err.name';
  if (!HOST.test(f.host.trim())) e.host = 'deploy.form.err.host';
  const port = Number(f.port);
  if (!/^\d{1,5}$/.test(f.port.trim()) || port < 1 || port > 65535) e.port = 'deploy.form.err.port';
  if (!USER.test(f.user.trim())) e.user = 'deploy.form.err.user';
  const domain = f.domain.trim();
  if (domain && !isDomain(domain)) e.domain = 'deploy.form.err.domain';
  if (f.kind === 'node') { const p = Number(f.appPort); if (!/^\d{1,5}$/.test(f.appPort.trim()) || p < 1024 || p > 65535) e.appPort = 'deploy.form.err.appPort'; }
  return e;
}
export function slugTargetId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'server';
  let id = base, n = 2;
  while (taken.includes(id)) { const suffix = `-${n++}`; id = base.slice(0, 40 - suffix.length) + suffix; }
  return id;
}
/** Builds the exact object `deploy.target.save` takes. Call only when validateTargetForm returned no errors. */
export function buildTarget(f: TargetForm, id: string): DeployTarget {
  const domain = f.domain.trim().toLowerCase();
  return {
    id, name: f.name.trim(), host: f.host.trim(), port: Number(f.port), user: f.user.trim(), kind: f.kind, keySlot: `deploy-key:${id}`,
    ...(domain ? { domain } : {}), ...(f.kind === 'static' && f.spa ? { spa: true } : {}), ...(f.kind === 'node' ? { appPort: Number(f.appPort) } : {}),
  };
}
export function formFromTarget(t: DeployTarget): TargetForm {
  return { name: t.name, host: t.host, port: String(t.port), user: t.user, domain: t.domain ?? '', kind: t.kind, spa: t.spa === true, appPort: String(t.appPort ?? 3000) };
}
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export const statusSummary = (s: DeployTargetStatus): TargetNext => nextStep(s.state);

/** The build step that comes before every publish of a framework project. Mirrors StaticBuildPhase. */
export type BuildPhase = 'installing' | 'building' | 'collecting' | 'done';
export interface BuildSummary { fileCount: number; totalBytes: number }
/** A failed or refused build becomes a plain failure card. Only catalogue keys reach the screen; nothing is uploaded. */
export function describeBuildFailure(errorKey: string | undefined, path?: string): DeployErrorInfo {
  const key = errorKey && /^frameworks\.(artifact\.[A-Za-z]+|build\.(failed|timeout))$/.test(errorKey) ? errorKey : 'frameworks.build.failed';
  return { code: 'build', messageKey: key, path, actions: ['retry', 'dismiss'], safe: true };
}

/**
 * Install runs once per project and dependency list per session. A later publish of the same
 * package.json/lockfile skips it; any failed build forgets the memo so the next try installs again.
 */
export function createInstallMemo() {
  const done = new Map<string, string>();
  return {
    needsInstall: (projectId: string, depsFingerprint: string) => done.get(projectId) !== depsFingerprint,
    record: (projectId: string, depsFingerprint: string, ok: boolean) => { if (ok) done.set(projectId, depsFingerprint); else done.delete(projectId); },
  };
}
