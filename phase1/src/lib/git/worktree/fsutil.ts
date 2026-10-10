import {promises as fs} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, join} from 'node:path';
import {hostname} from 'node:os';
import type {Env, RepoContext} from './types';

export const defaultEnv: Env = {
  now: () => Date.now(),
  host: hostname(),
  isPidAlive(pid) {
    try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
  },
};

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
/** Safe file-name component for ids. */
export const safeId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || '_';
export const stateDir = (ctx: RepoContext, ...parts: string[]) => join(ctx.commonDir, 'somnia', ...parts);

export async function writeAtomic(path: string, data: string) {
  await fs.mkdir(dirname(path), {recursive: true});
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data, {mode: 0o600});
  await fs.rename(tmp, path);
}
export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(path, 'utf8')) as T; } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (e instanceof SyntaxError) return null; // torn/corrupt file counts as absent; callers treat absent as "unknown"
    throw e;
  }
}
/** Exclusive create. Returns false when the file already exists. */
export async function createExclusive(path: string, data: string): Promise<boolean> {
  await fs.mkdir(dirname(path), {recursive: true});
  try { await fs.writeFile(path, data, {flag: 'wx', mode: 0o600}); return true; } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
}
