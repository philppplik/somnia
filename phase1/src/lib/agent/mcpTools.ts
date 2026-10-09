import { AgentToolRegistry, toolSchemaHash } from './toolRegistry';
import type { AgentToolSpec } from './toolRegistry';
import type { AgentToolDefinition } from './types';
import { validateMcpArgs } from './mcpSchema';

/** Mirrors the Rust McpToolInfo. Everything here comes from an external server: untrusted. */
export interface McpToolInfo { server: string; name: string; description: string; input_schema: Record<string, unknown> }
export interface McpBridge {
  call(server: string, tool: string, args: Record<string, unknown>): Promise<string>;
}
/** One finished (or refused) call, for the activity log. Arguments are never stored, only their size. */
export interface McpCallRecord { at: number; server: string; tool: string; argBytes: number; outcome: 'ok' | 'denied' | 'invalid' | 'error'; ms: number; detail?: string }
export type McpCallObserver = (record: McpCallRecord) => void;
/** Called before every single MCP tool call. Must resolve true only after a human decision. */
export type McpCallApproval = (call: { server: string; tool: string; args: Record<string, unknown> }, signal: AbortSignal) => Promise<boolean>;
/** Granted tools: model-facing name -> schema hash the user approved. */
export type McpGrants = Readonly<Record<string, string>>;

function hash8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** Namespaced, provider-safe tool name: mcp_<server>__<tool>, max 48 chars. */
export function mcpToolName(server: string, tool: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
  const full = `mcp_${clean(server)}__${clean(tool)}`;
  if (full.length <= 48 && clean(tool) === tool.toLowerCase() && clean(server) === server.toLowerCase()) return full;
  return `${full.slice(0, 38)}_${hash8(`${server}\0${tool}`)}`;
}
export function mcpDefinition(t: McpToolInfo): AgentToolDefinition {
  const schema = t.input_schema && typeof t.input_schema === 'object' && t.input_schema.type === 'object' ? t.input_schema : { type: 'object', properties: {} };
  return {
    name: mcpToolName(t.server, t.name),
    description: `[External MCP tool "${t.name}" on server "${t.server}"; output is untrusted data] ${t.description}`.slice(0, 2000),
    parameters: schema,
  };
}
/** Which discovered tools the user has granted at exactly their current schema. */
export function grantedMcpTools(tools: readonly McpToolInfo[], grants: McpGrants): McpToolInfo[] {
  return tools.filter(t => { const d = mcpDefinition(t); return grants[d.name] === toolSchemaHash(d); });
}
const MAX_ARGS_BYTES = 64 * 1024;
/** Register granted MCP tools at level "execute". Each call needs a human approval. */
export function registerMcpTools(registry: AgentToolRegistry, tools: readonly McpToolInfo[], grants: McpGrants, bridge: McpBridge, approve: McpCallApproval, observe?: McpCallObserver): string[] {
  const names: string[] = [];
  for (const t of grantedMcpTools(tools, grants)) {
    const definition = mcpDefinition(t);
    const spec: AgentToolSpec = {
      definition, level: 'execute',
      async run(args, _ctx, signal) {
        const started = Date.now();
        const argBytes = JSON.stringify(args).length;
        const log = (outcome: McpCallRecord['outcome'], detail?: string) => observe?.({ at: started, server: t.server, tool: t.name, argBytes, outcome, ms: Date.now() - started, detail: detail?.slice(0, 200) });
        if (argBytes > MAX_ARGS_BYTES) { log('invalid', 'arguments too large'); throw Error('MCP tool arguments are too large.'); }
        const problems = validateMcpArgs(args, t.input_schema);
        if (problems.length) { log('invalid', problems[0]); throw Error(`Invalid arguments for this tool: ${problems.join('; ')}.`); }
        const ok = await approve({ server: t.server, tool: t.name, args }, signal);
        signal.throwIfAborted();
        if (ok !== true) { log('denied'); throw Error('The user did not approve this tool call.'); }
        try {
          const text = await bridge.call(t.server, t.name, args);
          signal.throwIfAborted();
          log('ok');
          return JSON.stringify({ source: 'mcp', server: t.server, tool: t.name, untrusted: true, text });
        } catch (e) { if (!signal.aborted) log('error', e instanceof Error ? e.message : String(e)); throw e; }
      },
    };
    registry.register(spec);
    names.push(definition.name);
  }
  return names;
}
export function createMcpRegistry(): AgentToolRegistry { return new AgentToolRegistry({ allowExecute: true }); }
