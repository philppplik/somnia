import fs from 'node:fs';
import path from 'node:path';
import { validateAgentPath } from '../../src/lib/agent/projectTools';
import type { AgentFileProposal, AgentProjectAccess } from '../../src/lib/agent/projectTools';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 2000;
const SKIP_DIRS = new Set(['.git', '.somnia', 'node_modules', 'dist', 'build', 'target', 'coverage', '.next', '.cache']);

export class ScopeError extends Error { constructor(message: string) { super(message); this.name = 'ScopeError'; } }
export class ConflictError extends Error { constructor(message: string) { super(message); this.name = 'ConflictError'; } }

const norm = (r: string) => r.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
export function inRoots(rel: string, roots: readonly string[]): boolean {
  return roots.some(r => { const x = norm(r); return x === '' || x === '.' || rel === x || rel.startsWith(x + '/'); });
}
const safeRoot = (r: string) => { const x = norm(r); return x === '' || x === '.' || (!x.startsWith('/') && !/^[A-Za-z]:/.test(x) && x.split('/').every(p => p && p !== '.' && p !== '..')); };

/** The agent only ever sees text files below the allowed roots. Symlinks are never followed. */
export class WorkspaceAccess implements AgentProjectAccess {
  readonly projectId: string;
  private cache: Record<string, string> = {};
  readonly roots: string[];
  readonly cwd: string;
  constructor(cwd: string, allowedRoots: readonly string[], projectId: string) {
    this.cwd = fs.realpathSync(cwd);
    this.projectId = projectId;
    const roots = allowedRoots.length ? [...allowedRoots] : ['.'];
    if (!roots.every(safeRoot)) throw new ScopeError('allowed roots must be relative paths inside the project');
    this.roots = roots.map(norm);
    this.reload();
  }
  reload(): void {
    const out: Record<string, string> = {};
    let n = 0;
    const walk = (rel: string) => {
      if (n >= MAX_FILES) return;
      const abs = path.join(this.cwd, rel);
      let st: fs.Stats;
      try { st = fs.lstatSync(abs); } catch { return; }
      if (st.isSymbolicLink()) return;
      if (st.isDirectory()) {
        for (const name of fs.readdirSync(abs).sort()) { if (!SKIP_DIRS.has(name)) walk(rel ? `${rel}/${name}` : name); }
        return;
      }
      if (!st.isFile() || st.size > MAX_FILE_BYTES || !rel) return;
      try { validateAgentPath(rel); } catch { return; }
      if (!inRoots(rel, this.roots)) return;
      const text = fs.readFileSync(abs, 'utf8');
      if (text.includes('\0')) return;
      out[rel] = text; n++;
    };
    for (const r of this.roots) walk(r === '.' ? '' : r);
    this.cache = out;
  }
  files(): Readonly<Record<string, string>> { return this.cache; }
  allowed(p: string): boolean { return inRoots(p, this.roots); }

  /** Writes reviewed-by-nobody proposals to the working tree (the CLI then treats them as uncommitted work). */
  apply(proposals: readonly AgentFileProposal[]): string[] {
    const written: string[] = [];
    // Validate everything first so a bad proposal never leaves a half-applied set.
    const plan = proposals.map(p => {
      validateAgentPath(p.path);
      if (!this.allowed(p.path)) throw new ScopeError(`proposal outside the allowed roots: ${p.path}`);
      const abs = path.join(this.cwd, p.path);
      let parent = path.dirname(abs);
      while (!fs.existsSync(parent)) parent = path.dirname(parent);
      if (!(fs.realpathSync(parent) + path.sep).startsWith(this.cwd + path.sep)) throw new ScopeError(`proposal escapes the project: ${p.path}`);
      let current: string | null = null;
      try {
        const st = fs.lstatSync(abs);
        if (st.isSymbolicLink() || !st.isFile()) throw new ScopeError(`not a regular file: ${p.path}`);
        current = fs.readFileSync(abs, 'utf8');
      } catch (e) { if (e instanceof ScopeError) throw e; }
      if (current !== p.before) throw new ConflictError(`file changed while the agent was working: ${p.path}`);
      return { abs, p };
    });
    for (const { abs, p } of plan) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, p.after, 'utf8');
      written.push(p.path);
    }
    return written;
  }
}
