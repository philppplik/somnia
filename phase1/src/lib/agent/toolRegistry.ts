import type { AgentToolDefinition } from './types';

/**
 * Permission level of a tool.
 * - read: returns data to the model, changes nothing.
 * - propose: stages a change that the user must review; never touches editor or disk.
 * - execute: runs something with side effects. Not enabled anywhere yet; the registry
 *   refuses to register it unless the host explicitly allows it.
 */
export type AgentToolLevel = 'read' | 'propose' | 'execute';
export interface AgentToolContext {
  /** Authorized, readable editor files only. */
  files(): Readonly<Record<string, string>>;
  /** Stage a full-file proposal through the reviewed write path. */
  propose(path: string, content: string, signal: AbortSignal): Promise<void>;
  editor?: AgentEditorAccess;
}
export interface AgentEditorSelection { path: string; from: number; to: number; text: string }
export interface AgentEditorDiagnostic { path: string; line: number; severity: 'error' | 'warning' | 'info'; message: string }
/** Host callbacks for what the user currently sees. Nothing here can write. */
export interface AgentEditorAccess {
  selection(): AgentEditorSelection | null;
  diagnostics(): readonly AgentEditorDiagnostic[];
}
export interface AgentToolSpec {
  definition: AgentToolDefinition;
  level: AgentToolLevel;
  run(args: Record<string, unknown>, ctx: AgentToolContext, signal: AbortSignal): Promise<string>;
}
const NAME = /^[a-z][a-z0-9_]{1,47}$/;
/** Stable FNV-1a hash of name+description+schema. A grant is only valid for this hash. */
export function toolSchemaHash(def: AgentToolDefinition): string {
  const text = JSON.stringify([def.name, def.description, def.parameters]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export interface AgentToolGrants {
  /** Levels the user enabled. Default: read and propose. */
  levels?: readonly AgentToolLevel[];
  /** Tool names switched off. */
  disabled?: readonly string[];
}
export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolSpec>();
  constructor(private readonly options: { allowExecute?: boolean } = {}) {}
  register(spec: AgentToolSpec): this {
    const n = spec.definition.name;
    if (!NAME.test(n)) throw Error('Invalid tool name.');
    if (this.tools.has(n)) throw Error(`Tool already registered: ${n}`);
    if (!['read', 'propose', 'execute'].includes(spec.level)) throw Error('Invalid tool level.');
    if (spec.level === 'execute' && !this.options.allowExecute) throw Error('Execute-level tools are not enabled.');
    this.tools.set(n, spec);
    return this;
  }
  has(name: string): boolean { return this.tools.has(name); }
  level(name: string): AgentToolLevel | undefined { return this.tools.get(name)?.level; }
  private enabled(spec: AgentToolSpec, g: AgentToolGrants): boolean {
    return (g.levels ?? ['read', 'propose']).includes(spec.level) && !g.disabled?.includes(spec.definition.name);
  }
  definitions(g: AgentToolGrants = {}): AgentToolDefinition[] {
    return [...this.tools.values()].filter(s => this.enabled(s, g)).map(s => s.definition);
  }
  hashes(g: AgentToolGrants = {}): Record<string, string> {
    return Object.fromEntries(this.definitions(g).map(d => [d.name, toolSchemaHash(d)]));
  }
  async run(name: string, args: Record<string, unknown>, ctx: AgentToolContext, signal: AbortSignal, g: AgentToolGrants = {}): Promise<string> {
    const spec = this.tools.get(name);
    if (!spec || !this.enabled(spec, g)) throw Error('Unknown agent tool.');
    signal.throwIfAborted();
    const out = await spec.run(args, ctx, signal);
    signal.throwIfAborted();
    return out;
  }
}
