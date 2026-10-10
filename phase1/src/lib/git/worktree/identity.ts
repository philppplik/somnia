import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {sha256} from './fsutil';
import type {GateOutcome, RepoContext} from './types';

const run = promisify(execFile);

/**
 * Process-scoped identity. Worktrees share .git/config, so we NEVER write user.name/user.email
 * (or anything else) there. Identity travels as env vars of the single child process plus `-c` flags.
 */
export interface ResolvedIdentity {name: string; email: string; source: 'task' | 'git-config-read' | 'explicit'}
export interface AttributionPolicy {enabled: boolean; trailer?: string}

const SAFE_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'USER', 'USERNAME'];
const SENSITIVE = /^(GH_|GITHUB_|GIT_ASKPASS|SSH_ASKPASS|.*TOKEN|.*SECRET|.*PASSWORD)/i;

/** Env for a git child: allowlisted base + identity. Inherited tokens are dropped. */
export function gitEnv(id: ResolvedIdentity, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of SAFE_ENV_KEYS) if (base[k] !== undefined && !SENSITIVE.test(k)) env[k] = base[k];
  Object.assign(env, {
    GIT_AUTHOR_NAME: id.name, GIT_AUTHOR_EMAIL: id.email, GIT_COMMITTER_NAME: id.name, GIT_COMMITTER_EMAIL: id.email,
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  });
  return env;
}

/** Reject any argv that would persist configuration shared across worktrees. */
export function assertNoSharedConfigWrite(args: string[]): void {
  const i = args.indexOf('config');
  if (i >= 0) {
    const rest = args.slice(i + 1);
    const readOnly = rest.some(a => ['--get', '--get-all', '--list', '-l', '--get-regexp', '--show-origin'].includes(a));
    if (!readOnly) throw new Error('git config writes are forbidden for agent ops (shared across worktrees)');
  }
  if (args.some(a => a === '--global' || a === '--system')) throw new Error('global/system git config is forbidden');
  if (args.some(a => /^user\.(name|email)=/.test(a))) throw new Error('identity must travel via process env, not config');
  if (args.some(a => /https?:\/\/[^/\s]*:[^/\s]*@/.test(a) || /(ghp_|github_pat_|gho_)/.test(a))) throw new Error('credentials must not appear in argv');
}

export async function runGit(cwd: string, args: string[], id: ResolvedIdentity, stdin?: string): Promise<{stdout: string; stderr: string}> {
  assertNoSharedConfigWrite(args);
  const child = run('git', args, {cwd, env: gitEnv(id), maxBuffer: 16 * 1024 * 1024});
  if (stdin !== undefined) (child.child.stdin as NodeJS.WritableStream).end(stdin);
  const r = await child;
  return {stdout: String(r.stdout), stderr: String(r.stderr)};
}

/** Read-only resolve of the human identity; absence is a typed `identity` outcome, never a config write. */
export async function resolveHumanIdentity(ctx: RepoContext, explicit?: {name: string; email: string}): Promise<GateOutcome<ResolvedIdentity>> {
  if (explicit?.name && explicit.email) return {ok: true, value: {...explicit, source: 'explicit'}};
  try {
    const n = (await run('git', ['config', '--get', 'user.name'], {cwd: ctx.root})).stdout.trim();
    const e = (await run('git', ['config', '--get', 'user.email'], {cwd: ctx.root})).stdout.trim();
    if (n && e) return {ok: true, value: {name: n, email: e, source: 'git-config-read'}};
  } catch { /* fall through */ }
  return {ok: false, outcome: 'identity', reason: 'no git identity configured; provide one for this task (it is not written to git config)'};
}

/** Opt-in (D2) trailer appended to the message; author stays the human. */
export function applyAttribution(message: string, policy: AttributionPolicy): string {
  if (!policy.enabled || !policy.trailer) return message;
  const t = policy.trailer.replace(/[\r\n]/g, ' ').trim();
  return message.includes(t) ? message : `${message.replace(/\s+$/, '')}\n\n${t}\n`;
}

/** Fingerprint of the shared config files so tests/guards can prove nothing wrote there. */
export async function sharedConfigFingerprint(ctx: RepoContext): Promise<string> {
  const files = [join(ctx.commonDir, 'config'), join(ctx.commonDir, 'config.worktree'), join(ctx.gitDir, 'config.worktree')];
  const parts: string[] = [];
  for (const f of files) { try { parts.push(f + ':' + sha256(await fs.readFile(f))); } catch { parts.push(f + ':absent'); } }
  return sha256(parts.join('|'));
}
