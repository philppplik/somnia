/**
 * Web control hook (engine-hardening plan, step 2.2). DEV/TEST ONLY.
 *
 * `window.__somniaControl` lets an agent drive the web build from Playwright: inspect the app,
 * run a command through the shared dispatcher (origin `control`) and read values from the
 * inspect snapshot. It is installed only when the bundle is built with VITE_SOMNIA_CONTROL=1.
 * main.tsx guards the dynamic import with that flag, so release bundles contain neither this
 * module nor the symbol; `npm run check:no-control` asserts that against a built dist/.
 *
 * This channel is separate from the user-facing MCP server, which stays read + propose. It
 * never exposes file contents: inspect() returns names, counts and flags only.
 */
import type { CommandDispatcher } from '../commandDispatcher';
import { isCommandDispatchError } from '../commandDispatcher';

export interface ControlInspectSource {
  activeStudio: string;
  activeFile: string;
  openFiles: readonly string[];
  selectedElementIds: readonly string[];
  isDirty: boolean;
  projectName: string;
  panels: Record<string, boolean>;
  problems: readonly { severity: string; studio: string; message: string; file?: string }[];
}

export interface ControlDeps {
  dispatcher: Pick<CommandDispatcher, 'has' | 'tryRunCommand' | 'list' | 'recentActivity'>;
  readState: () => ControlInspectSource;
  /** Legacy registry fallback for commands that are not specs yet. */
  legacy?: { has: (id: string) => boolean; run: (id: string, params?: unknown) => Promise<void> };
}

export type ControlRunResult =
  | { ok: true; result: unknown; legacy?: boolean }
  | { ok: false; code: string; message: string };

export interface SomniaControl {
  readonly version: 1;
  inspect(): ControlInspectSource;
  runCommand(id: string, params?: unknown): Promise<ControlRunResult>;
  getState(path: string): unknown;
  listCommands(): { id: string; level: string; title: string }[];
  recentActivity(): ReturnType<CommandDispatcher['recentActivity']>;
}

/** Reads a dotted path ("panels.agentOpen", "openFiles.0") from the inspect snapshot. */
export function readPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function createControl(deps: ControlDeps): SomniaControl {
  return {
    version: 1,
    inspect: () => structuredClone(deps.readState()),
    getState: (path) => structuredClone(readPath(deps.readState(), String(path))),
    listCommands: () => deps.dispatcher.list().map(s => ({ id: s.id, level: s.level, title: s.title })),
    recentActivity: () => deps.dispatcher.recentActivity(),
    async runCommand(id, params) {
      if (deps.dispatcher.has(id)) {
        const r = await deps.dispatcher.tryRunCommand(id, params, { origin: 'control' });
        if (r.ok) return { ok: true, result: r.result ?? null };
        return { ok: false, code: isCommandDispatchError(r.error) ? r.error.code : 'failed', message: r.error.message };
      }
      if (deps.legacy?.has(id)) {
        try { await deps.legacy.run(id, params); return { ok: true, result: null, legacy: true }; }
        catch (e) { return { ok: false, code: 'failed', message: e instanceof Error ? e.message : 'Command failed.' }; }
      }
      return { ok: false, code: 'unknown-command', message: `Unknown command: ${id}` };
    },
  };
}
