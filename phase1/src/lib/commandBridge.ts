/**
 * Bridge between the new command dispatcher and the legacy registry in commands.ts.
 *
 * `registerCommandSpec` is the one registration point wave B and later waves use: the spec
 * lands in the shared dispatcher (typed params, levels, activity log) AND in the legacy
 * registry as an adapted Command, so palette, shortcuts, native menus and the shortcut
 * settings UI pick it up unchanged. Legacy `executeCommand` still routes enablement and
 * error notices; execution itself goes through the dispatcher, so every run is validated
 * and logged in one place.
 *
 * Migration path (wave B): turn an area's registerCommand calls into registerCommandSpec
 * calls with real params schemas and levels. The palette/shortcut code does not change.
 * Wave C then reads dispatcher.list() for the toolRegistry/MCP bridge and the
 * check:ui-commands manifest instead of touching per-area code.
 */
import { registerCommand, type Command } from './commands';
import { commandDispatcher, type CommandDispatcher } from './commandDispatcher';
import type { CommandSpec } from './commandSpec';

/** Adapts a spec to the legacy Command shape. Execution is forwarded to the dispatcher. */
export function specToCommand(spec: CommandSpec<unknown, unknown>, dispatcher: CommandDispatcher = commandDispatcher): Command {
  return {
    id: spec.id,
    title: spec.title,
    category: spec.category,
    ...(spec.shortcut !== undefined ? { shortcut: spec.shortcut } : {}),
    ...(spec.keywords ? { keywords: [...spec.keywords] } : {}),
    ...(spec.allowInInput !== undefined ? { allowInInput: spec.allowInInput } : {}),
    enabled: () => dispatcher.isEnabled(spec.id, { origin: 'ui' }),
    run: async (payload) => { await dispatcher.runCommand(spec.id, payload, { origin: 'ui' }); },
  };
}

/**
 * Registers a spec in the dispatcher and mirrors it into the legacy registry.
 * Returns one disposer that removes both registrations.
 */
export function registerCommandSpec<P, R>(spec: CommandSpec<P, R>, dispatcher: CommandDispatcher = commandDispatcher): () => void {
  const offDispatcher = dispatcher.register(spec);
  const offLegacy = registerCommand(specToCommand(spec as CommandSpec<unknown, unknown>, dispatcher));
  return () => { offLegacy(); offDispatcher(); };
}
