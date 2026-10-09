/**
 * Somnia as an MCP server (protocol layer). Transport-agnostic: the host hands one parsed JSON-RPC
 * message at a time to `handle()` and writes back the returned message (or nothing for notifications).
 * The desktop transport (loopback listener with a per-session token) lives in the Rust host and
 * is described in docs/MCP-SERVER.md.
 *
 * Safety rules enforced here, independent of the transport:
 * - only `read` and `propose` tools are ever listed or callable; `execute` tools never leave the app;
 * - a call can only inspect or STAGE a change. The user still reviews and accepts in the UI, and
 *   undo protection of the Studios applies unchanged;
 * - the whole server answers "disabled" until the user turns it on (`enabled()`), and every call is
 *   counted against a rate limit;
 * - arguments are validated against the tool's schema before the tool runs.
 */
import type { AgentToolContext, AgentToolGrants, AgentToolRegistry } from './toolRegistry';
import { validateMcpArgs } from './mcpSchema';

export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const EXPOSED: AgentToolGrants = { levels: ['read', 'propose'] };
export interface StudioToolSource { studio: string; registry: AgentToolRegistry }
export interface StudioMcpOptions {
  sources: readonly StudioToolSource[];
  /** Fresh context for each call (live files, editor access, propose path). */
  context(): AgentToolContext;
  /** Master switch controlled by the user in Settings. */
  enabled(): boolean;
  /** Called for every tools/call, for the activity log. Never receives arguments. */
  onCall?(r: { tool: string; studio: string; outcome: 'ok' | 'error' | 'invalid' | 'limited'; ms: number }): void;
  version?: string;
  maxCallsPerMinute?: number;
  now?(): number;
}
type Id = string | number | null;
interface Msg { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
export interface RpcResponse { jsonrpc: '2.0'; id: Id; result?: unknown; error?: { code: number; message: string } }

const err = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });
const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export class StudioMcpServer {
  private calls: number[] = [];
  private readonly lookup = new Map<string, StudioToolSource>();
  constructor(private readonly o: StudioMcpOptions) {
    for (const s of o.sources) for (const d of s.registry.definitions(EXPOSED)) {
      if (this.lookup.has(d.name)) throw Error(`Duplicate tool name across studios: ${d.name}`);
      this.lookup.set(d.name, s);
    }
  }
  private tools() {
    return this.o.sources.flatMap(s => s.registry.definitions(EXPOSED).map(d => ({
      name: d.name, description: d.description, inputSchema: d.parameters,
      annotations: { title: `${s.studio}: ${d.name}`, readOnlyHint: s.registry.level(d.name) === 'read', destructiveHint: false, openWorldHint: false },
    })));
  }
  private limited(): boolean {
    const now = (this.o.now ?? Date.now)();
    this.calls = this.calls.filter(t => now - t < 60_000);
    if (this.calls.length >= (this.o.maxCallsPerMinute ?? 30)) return true;
    this.calls.push(now);
    return false;
  }
  /** Returns the response, or null for notifications. Never throws. */
  async handle(raw: unknown, signal: AbortSignal = new AbortController().signal): Promise<RpcResponse | null> {
    if (!isObj(raw) || (raw as Msg).jsonrpc !== '2.0' || typeof (raw as Msg).method !== 'string') return err(null, -32600, 'Invalid request');
    const m = raw as unknown as Msg & { method: string };
    const hasId = m.id !== undefined;
    const id = (typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null) as Id;
    if (!hasId) return null; // notifications (e.g. notifications/initialized) need no answer
    if (!this.o.enabled()) return err(id, -32000, 'Somnia tool server is turned off. Enable it in Settings > AI > Tools.');
    const params = isObj(m.params) ? m.params : {};
    switch (m.method) {
      case 'initialize': {
        const want = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(want) ? want : SUPPORTED_PROTOCOLS[0];
        return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'somnia', version: this.o.version ?? '0.0.0' },
          instructions: 'Somnia tools inspect open documents and stage proposed changes. The user reviews and accepts every change inside Somnia.' });
      }
      case 'ping': return ok(id, {});
      case 'tools/list': return ok(id, { tools: this.tools() });
      case 'tools/call': return this.call(id, params, signal);
      default: return err(id, -32601, 'Method not found');
    }
  }
  private async call(id: Id, params: Record<string, unknown>, signal: AbortSignal): Promise<RpcResponse> {
    const name = params.name;
    if (typeof name !== 'string') return err(id, -32602, 'Missing tool name');
    const src = this.lookup.get(name);
    if (!src) return err(id, -32602, 'Unknown tool');
    const args = params.arguments === undefined ? {} : params.arguments;
    const started = (this.o.now ?? Date.now)();
    const report = (outcome: 'ok' | 'error' | 'invalid' | 'limited') => this.o.onCall?.({ tool: name, studio: src.studio, outcome, ms: (this.o.now ?? Date.now)() - started });
    const text = (t: string, isError: boolean) => ok(id, { content: [{ type: 'text', text: t.slice(0, 64 * 1024) }], isError });
    if (!isObj(args)) { report('invalid'); return err(id, -32602, 'Arguments must be an object'); }
    if (this.limited()) { report('limited'); return text('Rate limit reached. Try again in a minute.', true); }
    const def = src.registry.definitions(EXPOSED).find(d => d.name === name);
    const problems = validateMcpArgs(args, def?.parameters);
    if (problems.length) { report('invalid'); return text(`Invalid arguments: ${problems.join('; ')}.`, true); }
    try {
      const out = await src.registry.run(name, args, this.o.context(), signal, EXPOSED);
      report('ok');
      return text(out, false);
    } catch (e) {
      report('error');
      return text(e instanceof Error ? e.message : 'Tool failed.', true);
    }
  }
}
