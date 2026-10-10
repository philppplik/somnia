import { TaskError } from './errors';
import type { SessionRecord, TaskRecord } from './schema';
import { TASK_SCHEMA_VERSION, TASK_STATUSES, isSafeId, isSha, isProjectRelative } from './schema';

export interface TaskStore {
  getTask(taskId: string): Promise<TaskRecord | null>;
  putTask(t: TaskRecord): Promise<void>;
  listTasks(repoId?: string): Promise<TaskRecord[]>;
  getSession(taskId: string): Promise<SessionRecord | null>;
  putSession(s: SessionRecord): Promise<void>;
}

export class MemoryTaskStore implements TaskStore {
  private tasks = new Map<string, TaskRecord>();
  private sessions = new Map<string, SessionRecord>();
  async getTask(id: string) { const t = this.tasks.get(id); return t ? structuredClone(t) : null; }
  async putTask(t: TaskRecord) { this.tasks.set(t.taskId, structuredClone(t)); }
  async listTasks(repoId?: string) { return [...this.tasks.values()].filter(t => !repoId || t.repoId === repoId).map(t => structuredClone(t)); }
  async getSession(id: string) { const s = this.sessions.get(id); return s ? structuredClone(s) : null; }
  async putSession(s: SessionRecord) { this.sessions.set(s.taskId, structuredClone(s)); }
}

/** Minimal fs port; the desktop adapter implements it over Tauri. Paths are absolute. */
export interface FsPort {
  readText(path: string): Promise<string | null>;
  /** Must write atomically (tmp + rename) or fail. */
  writeTextAtomic(path: string, text: string): Promise<void>;
  listDirs(path: string): Promise<string[]>;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
/**
 * D6: session records are private app storage. Refuse any storage root inside the repository
 * working tree (which would let `git add -A` capture them) unless git-excluded by the caller.
 */
export function assertPrivateLocation(storageRoot: string, repoRoot: string, gitExcluded = false): void {
  const s = norm(storageRoot).toLowerCase(), r = norm(repoRoot).toLowerCase();
  if ((s === r || s.startsWith(r + '/')) && !gitExcluded) throw new TaskError('private-storage');
}

/** Layout: <appData>/agent-sessions/<repoId>/<taskId>/{task,session}.json. Never under the repo. */
export class FsTaskStore implements TaskStore {
  constructor(private readonly fs: FsPort, private readonly root: string) { }
  private dir(repoId: string, taskId: string) { if (!isSafeId(repoId) || !isSafeId(taskId)) throw new TaskError('invalid-record'); return `${norm(this.root)}/${repoId}/${taskId}`; }
  async getTask(taskId: string) {
    for (const repo of await this.fs.listDirs(this.root)) {
      const txt = await this.fs.readText(`${this.dir(repo, taskId)}/task.json`);
      if (txt) return parseTaskRecord(JSON.parse(txt));
    }
    return null;
  }
  async putTask(t: TaskRecord) { validateTaskRecord(t); await this.fs.writeTextAtomic(`${this.dir(t.repoId, t.taskId)}/task.json`, JSON.stringify(t, null, 2)); }
  async listTasks(repoId?: string) {
    const out: TaskRecord[] = [];
    for (const repo of repoId ? [repoId] : await this.fs.listDirs(this.root)) {
      for (const id of await this.fs.listDirs(`${norm(this.root)}/${repo}`)) {
        const txt = await this.fs.readText(`${this.dir(repo, id)}/task.json`);
        if (txt) { try { out.push(parseTaskRecord(JSON.parse(txt))); } catch { /* skip corrupt record */ } }
      }
    }
    return out;
  }
  async getSession(taskId: string) {
    const t = await this.getTask(taskId); if (!t) return null;
    const txt = await this.fs.readText(`${this.dir(t.repoId, taskId)}/session.json`);
    return txt ? JSON.parse(txt) as SessionRecord : null;
  }
  async putSession(s: SessionRecord) {
    const t = await this.getTask(s.taskId); if (!t) throw new TaskError('not-found');
    await this.fs.writeTextAtomic(`${this.dir(t.repoId, s.taskId)}/session.json`, JSON.stringify(s, null, 2));
  }
}

/** Structural validation for records read from disk or received from another producer. */
export function validateTaskRecord(t: unknown): asserts t is TaskRecord {
  const bad = () => { throw new TaskError('invalid-record'); };
  if (!t || typeof t !== 'object') return bad();
  const r = t as Record<string, any>;
  if (r.schemaVersion !== TASK_SCHEMA_VERSION) bad();
  if (!isSafeId(r.taskId) || !isSafeId(r.repoId)) bad();
  if (r.worktreeId !== null && !isSafeId(r.worktreeId)) bad();
  if (r.branch !== `somnia/task/${r.taskId}`) bad();
  if (!isSha(r.baseSha) || (r.headSha !== undefined && !isSha(r.headSha))) bad();
  if (!Number.isInteger(r.workspaceGeneration) || r.workspaceGeneration < 0) bad();
  if (!Array.isArray(r.allowedRoots) || r.allowedRoots.length === 0 || !r.allowedRoots.every((x: unknown) => x === '.' || isProjectRelative(x))) bad();
  if (!r.producer || (r.producer.kind !== 'builtin' && r.producer.kind !== 'external') || typeof r.producer.name !== 'string') bad();
  if (!TASK_STATUSES.includes(r.status)) bad();
  if (!r.gates || (r.gates.level !== 'L0' && r.gates.level !== 'L1')) bad();
  if (!Array.isArray(r.checkpoints) || !Array.isArray(r.requests)) bad();
  if (r.outcome !== 'certain' && r.outcome !== 'uncertain') bad();
}
export function parseTaskRecord(x: unknown): TaskRecord { validateTaskRecord(x); return x; }
