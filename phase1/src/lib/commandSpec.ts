/**
 * CommandSpec: the typed foundation of the Somnia command layer (engine-hardening plan, step 1.2).
 *
 * One spec describes a command for every client: palette, shortcuts, menus, extensions, the
 * Somnia agent, MCP tools, macros and the CLI all read the same entry. A spec has a stable
 * dotted id, typed params (JSON Schema, validated by the fail-closed mcpSchema interpreter),
 * an optional result schema and a permission level. The legacy `Command` interface from
 * commands.ts stays untouched; `commandToSpec` adapts it so old registrations keep working
 * while areas migrate (wave B migrates one area at a time).
 *
 * This module is pure: no app imports, so studios, agent tools and CI scripts can rely on it
 * from any layer.
 */

/** Menu grouping, shared with the legacy Command type in commands.ts. */
export type CommandCategory = 'Project' | 'Edit' | 'View' | 'Insert' | 'Tools' | 'Help';

/**
 * Who may call a command.
 * - read: returns data, changes nothing. Callable from every origin, including agent and MCP.
 * - propose: stages a change the user reviews in the UI; never writes on its own. Callable
 *   from every origin; agent/MCP callers stay inside the reviewed write path.
 * - ui: interactive application command (toggles, dialogs, edits that apply immediately).
 *   Only local interactive origins may run these; agent and MCP origins are refused. The
 *   developer control channel (test builds only) counts as interactive.
 */
export type CommandLevel = 'read' | 'propose' | 'ui';

/** Where a dispatch came from. `ui` is the generic local origin until call sites migrate. */
export type CommandOrigin = 'ui' | 'palette' | 'shortcut' | 'menu' | 'extension' | 'macro' | 'control' | 'cli' | 'agent' | 'mcp' | 'test';

/** Origins allowed to run `ui` level commands. Agent and MCP are deliberately absent. */
export const INTERACTIVE_ORIGINS: readonly CommandOrigin[] = ['ui', 'palette', 'shortcut', 'menu', 'extension', 'macro', 'control', 'cli', 'test'];

/** Per-call context handed to enabled() and run(). */
export interface CommandContext {
  readonly origin: CommandOrigin;
  readonly signal?: AbortSignal;
}

/** JSON Schema subset accepted by the fail-closed validator in mcpSchema.ts. */
export type CommandSchema = Record<string, unknown>;

export interface CommandSpec<P = unknown, R = unknown> {
  /** Stable dotted id, e.g. `edit.undo`, `view.splitLeftRight`. Never reused, never renamed. */
  readonly id: string;
  /** English fallback title. The palette translates it via the `cmd.<id>` i18n key. */
  readonly title: string;
  readonly category: CommandCategory;
  readonly shortcut?: string;
  readonly keywords?: readonly string[];
  /** Allow firing while a text input has focus (same meaning as on legacy Command). */
  readonly allowInInput?: boolean;
  readonly level: CommandLevel;
  /** JSON Schema for the params object. Omit for commands without parameters. */
  readonly params?: CommandSchema;
  /** Optional JSON Schema the result is checked against. */
  readonly result?: CommandSchema;
  readonly enabled?: (ctx: CommandContext) => boolean;
  /** i18n key explaining why the command is disabled (hero slot tooltip). Evaluated only while disabled. */
  readonly disabledReason?: () => string;
  run(params: P, ctx: CommandContext): R | Promise<R>;
}

/** Dotted ids for native specs: lowercase root, alphanumeric segments (`edit.undo`, `md.h1`). */
export const COMMAND_ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

export function isCommandId(id: string): boolean {
  return COMMAND_ID_PATTERN.test(id);
}

export function assertCommandId(id: string): void {
  if (!isCommandId(id)) throw new Error(`Invalid command id "${id}": use dotted segments like "edit.undo".`);
}

/** Structural view of the legacy Command interface (commands.ts). Kept local so this module stays import-free. */
export interface LegacyCommandShape {
  id: string;
  title: string;
  category: CommandCategory;
  shortcut?: string;
  keywords?: string[];
  allowInInput?: boolean;
  enabled?: () => boolean;
  run: (payload?: unknown) => void | Promise<void>;
}

/**
 * Adapts a legacy Command to a spec so old registrations can live behind the dispatcher
 * before their area migrates. Legacy ids are not re-validated (some contain paths or
 * extension prefixes); new native specs must use strict dotted ids. Legacy commands are
 * `ui` level with unvalidated pass-through params, matching today's behaviour exactly.
 */
export function commandToSpec(command: LegacyCommandShape): CommandSpec<unknown, void> {
  return {
    id: command.id,
    title: command.title,
    category: command.category,
    ...(command.shortcut !== undefined ? { shortcut: command.shortcut } : {}),
    ...(command.keywords ? { keywords: command.keywords } : {}),
    ...(command.allowInInput !== undefined ? { allowInInput: command.allowInInput } : {}),
    level: 'ui',
    ...(command.enabled ? { enabled: () => command.enabled!() } : {}),
    run: (params) => command.run(params),
  };
}
