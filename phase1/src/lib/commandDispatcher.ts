/**
 * Shared command dispatcher (engine-hardening plan, step 1.3).
 *
 * Every command execution goes through `runCommand(id, params, {origin})`: palette, keyboard
 * shortcuts, native menus, extensions, agent tools, MCP and the test control channel. The
 * dispatcher checks the origin against the spec's level, validates params against the spec's
 * JSON Schema with the fail-closed mcpSchema interpreter, runs the command and records one
 * activity entry per call (id, origin, outcome, milliseconds - never argument or result
 * contents).
 *
 * Failures are CommandDispatchError, the UI-side counterpart of the AppCommandError wire
 * shape used at the Tauri boundary: a stable `code`, a message and the `expected` flag the
 * existing executeCommand catch already honours (expected errors never reach the error log).
 */
import { checkMcpArgs, type McpArgIssue } from './agent/mcpSchema';
import {
  INTERACTIVE_ORIGINS,
  assertCommandId,
  type CommandContext,
  type CommandLevel,
  type CommandOrigin,
  type CommandSpec,
} from './commandSpec';

export type CommandErrorCode = 'unknown-command' | 'forbidden-origin' | 'disabled' | 'invalid-params' | 'invalid-result' | 'aborted' | 'failed';

export class CommandDispatchError extends Error {
  readonly name = 'CommandDispatchError';
  readonly code: CommandErrorCode;
  /** Expected outcomes (disabled, validation, unknown id) never create an incident. */
  readonly expected: boolean;
  readonly issues?: readonly McpArgIssue[];
  constructor(code: CommandErrorCode, message: string, opts: { expected?: boolean; issues?: readonly McpArgIssue[]; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.code = code;
    this.expected = opts.expected ?? true;
    if (opts.issues) this.issues = opts.issues;
  }
}

export function isCommandDispatchError(error: unknown): error is CommandDispatchError {
  return error instanceof CommandDispatchError;
}

export type CommandOutcome = 'ok' | 'disabled' | 'invalid' | 'forbidden' | 'error' | 'aborted';

/** One activity entry. Carries no argument values and no result contents by design. */
export interface CommandActivity {
  readonly ts: string;
  readonly id: string;
  readonly origin: CommandOrigin;
  readonly outcome: CommandOutcome;
  readonly ms: number;
  readonly code?: CommandErrorCode;
}

export type CommandResult<R> = { ok: true; result: R } | { ok: false; error: CommandDispatchError };

export interface CommandDispatcherOptions {
  /** Called for every dispatched command after the activity entry is recorded. */
  onActivity?: (entry: CommandActivity) => void;
  /** Clock seam for tests. */
  now?: () => number;
}

const ACTIVITY_MAX = 200;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Origin/level policy: read and propose are open to every origin; ui is interactive-only. */
export function originAllows(level: CommandLevel, origin: CommandOrigin): boolean {
  return level !== 'ui' || INTERACTIVE_ORIGINS.includes(origin);
}

export class CommandDispatcher {
  private readonly specs = new Map<string, CommandSpec<unknown, unknown>>();
  private readonly activity: CommandActivity[] = [];
  private readonly subscribers = new Set<(entry: CommandActivity) => void>();

  constructor(private readonly options: CommandDispatcherOptions = {}) {}

  /** Registers a spec. Ids are strict (dotted) and unique. Returns the unregister function. */
  register<P, R>(spec: CommandSpec<P, R>): () => void {
    assertCommandId(spec.id);
    if (this.specs.has(spec.id)) throw new Error(`Command already registered: ${spec.id}`);
    if (spec.params !== undefined && !isObj(spec.params)) throw new Error(`Command ${spec.id}: params schema must be an object.`);
    if (spec.result !== undefined && !isObj(spec.result)) throw new Error(`Command ${spec.id}: result schema must be an object.`);
    const stored = spec as CommandSpec<unknown, unknown>;
    this.specs.set(spec.id, stored);
    return () => { if (this.specs.get(spec.id) === stored) this.specs.delete(spec.id); };
  }

  has(id: string): boolean { return this.specs.has(id); }
  get(id: string): CommandSpec<unknown, unknown> | undefined { return this.specs.get(id); }
  list(): CommandSpec<unknown, unknown>[] { return [...this.specs.values()]; }

  isEnabled(id: string, ctx: CommandContext = { origin: 'ui' }): boolean {
    const spec = this.specs.get(id);
    if (!spec) return false;
    try { return spec.enabled?.(ctx) ?? true; } catch { return false; }
  }

  /** Runs a command. Throws CommandDispatchError on every failure path. */
  async runCommand<R = unknown>(id: string, params?: unknown, opts: { origin: CommandOrigin; signal?: AbortSignal } = { origin: 'ui' }): Promise<R> {
    const started = this.clock();
    const ctx: CommandContext = { origin: opts.origin, ...(opts.signal ? { signal: opts.signal } : {}) };
    try {
      const spec = this.specs.get(id);
      if (!spec) throw new CommandDispatchError('unknown-command', `Unknown command: ${id}`);
      if (!originAllows(spec.level, opts.origin)) {
        throw new CommandDispatchError('forbidden-origin', `Command ${id} is interactive-only and cannot run from origin "${opts.origin}".`);
      }
      opts.signal?.throwIfAborted();
      if (spec.enabled && !spec.enabled(ctx)) throw new CommandDispatchError('disabled', `${spec.title} is not available right now.`);
      if (spec.params) {
        const checked = checkMcpArgs(params ?? {}, spec.params);
        if (!checked.ok) throw new CommandDispatchError('invalid-params', `Invalid parameters for ${id}: ${checked.issues.map(i => i.message).join('; ')}.`, { issues: checked.issues });
      }
      const result = await spec.run(params, ctx) as R;
      opts.signal?.throwIfAborted();
      if (spec.result) {
        // checkMcpArgs validates objects; wrap the result so any JSON value can be checked.
        const checked = checkMcpArgs({ result }, { type: 'object', properties: { result: spec.result }, required: ['result'] });
        if (!checked.ok) throw new CommandDispatchError('invalid-result', `Command ${id} returned an invalid result.`, { expected: false, issues: checked.issues });
      }
      this.record(id, opts.origin, 'ok', started);
      return result;
    } catch (error) {
      throw this.fail(id, opts.origin, error, started);
    }
  }

  /** Non-throwing variant for callers that map results onto a wire protocol (MCP, control channel). */
  async tryRunCommand<R = unknown>(id: string, params?: unknown, opts?: { origin: CommandOrigin; signal?: AbortSignal }): Promise<CommandResult<R>> {
    try {
      return { ok: true, result: await this.runCommand<R>(id, params, opts) };
    } catch (error) {
      return { ok: false, error: isCommandDispatchError(error) ? error : new CommandDispatchError('failed', 'Command failed.', { expected: false, cause: error }) };
    }
  }

  /** Recent activity, oldest first. Entries never contain params or results. */
  recentActivity(): CommandActivity[] { return this.activity.slice(); }

  subscribeActivity(fn: (entry: CommandActivity) => void): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  private clock(): number { return (this.options.now ?? Date.now)(); }

  private fail(id: string, origin: CommandOrigin, error: unknown, started: number): CommandDispatchError {
    if (isCommandDispatchError(error)) {
      const outcome: CommandOutcome = error.code === 'disabled' ? 'disabled'
        : error.code === 'invalid-params' || error.code === 'invalid-result' ? 'invalid'
        : error.code === 'forbidden-origin' ? 'forbidden'
        : error.code === 'aborted' ? 'aborted' : 'error';
      this.record(id, origin, outcome, started, error.code);
      return error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      const aborted = new CommandDispatchError('aborted', 'Command was aborted.', { cause: error });
      this.record(id, origin, 'aborted', started, aborted.code);
      return aborted;
    }
    // The legacy convention (commands.ts executeCommand) treats throws marked expected:true
    // as user-facing outcomes, not incidents. Keep that contract inside the wrapper.
    const expected = !!error && typeof error === 'object' && (error as { expected?: unknown }).expected === true;
    const wrapped = new CommandDispatchError('failed', error instanceof Error ? error.message : 'Command failed.', { expected, cause: error });
    this.record(id, origin, 'error', started, wrapped.code);
    return wrapped;
  }

  private record(id: string, origin: CommandOrigin, outcome: CommandOutcome, started: number, code?: CommandErrorCode): void {
    const entry: CommandActivity = { ts: new Date(this.clock()).toISOString(), id, origin, outcome, ms: Math.max(0, this.clock() - started), ...(code ? { code } : {}) };
    this.activity.push(entry);
    if (this.activity.length > ACTIVITY_MAX) this.activity.shift();
    try { this.options.onActivity?.(entry); } catch { /* observers must never break dispatch */ }
    for (const fn of [...this.subscribers]) { try { fn(entry); } catch { /* observers must never break dispatch */ } }
  }
}

/** Shared instance. Studios, the agent bridge and the control channel all dispatch through this one. */
export const commandDispatcher = new CommandDispatcher();
