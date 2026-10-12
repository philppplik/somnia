/**
 * Command-to-tool bridge (engine-hardening plan, step 1.6).
 *
 * Agent and MCP tools for `read` and `propose` commands are generated from CommandSpecs
 * instead of being maintained by hand. Every call goes through the dispatcher with origin
 * `agent` or `mcp`, so params are validated by the spec's schema and each run lands in the
 * dispatcher activity log.
 *
 * Safety model (unchanged):
 * - Only specs with level `read` or `propose` become tools. `ui` specs are never exposed.
 * - The generated tools use the registry levels `read` and `propose`; nothing here can create
 *   an `execute` tool. The level is checked again at call time against the live spec.
 * - The dispatcher refuses `ui` specs from agent and MCP origins as a second barrier.
 *
 * Names: `cmd_` + the spec id in snake case (`design.getState` becomes `cmd_design_get_state`).
 * The prefix keeps generated names apart from the hand-written tools (`get_selection`,
 * `code_read_range`, `studio_inspect`, ...), which keep their names and implementations.
 * Ids that cannot form a valid tool name or collide are skipped and reported, never renamed.
 *
 * Consent: grants bind to `toolSchemaHash(name, description, parameters)`. The description is
 * built only from the spec title and id, so a hash changes exactly when the id, title or params
 * schema changes. A changed hash invalidates the grant (fail closed) and the user must approve
 * again. See docs/agent/TOOL-REGISTRY.md.
 */
import type { CommandDispatcher } from '../commandDispatcher';
import type { CommandOrigin, CommandSpec } from '../commandSpec';
import type { AgentToolDefinition } from './types';
import type { AgentToolRegistry, AgentToolSpec } from './toolRegistry';

export const COMMAND_TOOL_PREFIX = 'cmd_';
const TOOL_NAME = /^[a-z][a-z0-9_]{1,47}$/;
const MAX_RESULT_CHARS = 256 * 1024;
const EMPTY_PARAMS = { type: 'object', properties: {}, additionalProperties: false } as const;

export type CommandToolOrigin = Extract<CommandOrigin, 'agent' | 'mcp'>;

/** Specs that may become tools. `ui` never does. */
export function isBridgeable(spec: Pick<CommandSpec, 'level'>): boolean {
  return spec.level === 'read' || spec.level === 'propose';
}

/** Stable tool name for a command id, or undefined when it cannot form a valid name. */
export function commandToolName(id: string): string | undefined {
  const snake = id.replace(/\./g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const name = COMMAND_TOOL_PREFIX + snake;
  return TOOL_NAME.test(name) ? name : undefined;
}

/** The tool definition for a spec. Deterministic: its hash is what consent binds to. */
export function commandToolDefinition(spec: CommandSpec<unknown, unknown>): AgentToolDefinition | undefined {
  const name = commandToolName(spec.id);
  if (!name) return undefined;
  return {
    name,
    description: `${spec.title}. Somnia command ${spec.id} (${spec.level}${spec.level === 'propose' ? ', the user reviews every change' : ''}).`,
    parameters: spec.params ? { ...spec.params } : { ...EMPTY_PARAMS },
  };
}

export interface CommandToolOptions {
  origin?: CommandToolOrigin;
  /** Optional scope check run before each call (for example the pinned-document assertion). */
  guard?: () => void;
  /** Optional filter on top of the level rule. */
  include?: (spec: CommandSpec<unknown, unknown>) => boolean;
}

export interface CommandToolSkip { id: string; reason: 'not-bridgeable' | 'invalid-name' | 'name-taken' | 'excluded' }

function toolFor(spec: CommandSpec<unknown, unknown>, dispatcher: CommandDispatcher, opts: CommandToolOptions): AgentToolSpec | undefined {
  const definition = commandToolDefinition(spec);
  if (!definition) return undefined;
  const origin = opts.origin ?? 'agent';
  return {
    definition,
    level: spec.level === 'propose' ? 'propose' : 'read',
    async run(args, _ctx, signal) {
      opts.guard?.();
      const live = dispatcher.get(spec.id);
      if (!live || !isBridgeable(live)) throw Error('Unknown agent tool.');
      const result = await dispatcher.runCommand(spec.id, args, { origin, signal });
      const text = JSON.stringify(result ?? null) ?? 'null';
      if (text.length > MAX_RESULT_CHARS) throw Error('Command result exceeds the context limit.');
      return text;
    },
  };
}

/**
 * Registers a tool for every bridgeable spec currently in the dispatcher. Returns what was
 * registered and what was skipped. A name already used by another tool is skipped, not replaced.
 */
export function registerCommandTools(registry: AgentToolRegistry, dispatcher: CommandDispatcher, opts: CommandToolOptions = {}): { registered: string[]; skipped: CommandToolSkip[] } {
  const registered: string[] = [];
  const skipped: CommandToolSkip[] = [];
  for (const spec of dispatcher.list()) {
    const r = addOne(registry, dispatcher, spec, opts);
    if (r.ok) registered.push(r.name); else skipped.push({ id: spec.id, reason: r.reason });
  }
  return { registered, skipped };
}

function addOne(registry: AgentToolRegistry, dispatcher: CommandDispatcher, spec: CommandSpec<unknown, unknown>, opts: CommandToolOptions): { ok: true; name: string } | { ok: false; reason: CommandToolSkip['reason'] } {
  if (!isBridgeable(spec)) return { ok: false, reason: 'not-bridgeable' };
  if (opts.include && !opts.include(spec)) return { ok: false, reason: 'excluded' };
  const tool = toolFor(spec, dispatcher, opts);
  if (!tool) return { ok: false, reason: 'invalid-name' };
  if (registry.has(tool.definition.name)) return { ok: false, reason: 'name-taken' };
  registry.register(tool);
  return { ok: true, name: tool.definition.name };
}

/**
 * Keeps a long-lived registry in sync with the dispatcher: registers current specs and follows
 * later additions and removals (studios that register on canvas mount, vector's late
 * `vectorCommandsReady` registration). Returns a disposer that also removes the generated tools.
 * Sound's host-bound dispatcher is a separate instance: bind it with its own call.
 */
export function bindCommandTools(registry: AgentToolRegistry, dispatcher: CommandDispatcher, opts: CommandToolOptions = {}): () => void {
  const owned = new Map<string, string>(); // spec id -> tool name we registered
  const sync = (spec: CommandSpec<unknown, unknown>) => {
    if (owned.has(spec.id)) return;
    const r = addOne(registry, dispatcher, spec, opts);
    if (r.ok) owned.set(spec.id, r.name);
  };
  const drop = (id: string) => {
    const name = owned.get(id);
    if (name) { registry.unregister(name); owned.delete(id); }
  };
  for (const spec of dispatcher.list()) sync(spec);
  const off = dispatcher.subscribeRegistry(change => {
    if (change.type === 'removed') { drop(change.id); return; }
    const spec = dispatcher.get(change.id);
    if (spec) { drop(change.id); sync(spec); }
  });
  return () => { off(); for (const id of [...owned.keys()]) drop(id); };
}
