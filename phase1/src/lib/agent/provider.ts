/** UI-free provider contract. Secrets and transports never enter session snapshots. */
export interface AgentToolCall { id: string; name: string; arguments: string }
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
}
export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Provider-reported USD amount; absent means unknown, never zero. */
  costUsd?: number;
}
export interface AgentProviderRequest {
  model: string;
  messages: readonly AgentMessage[];
  tools: readonly AgentToolDefinition[];
  maxOutputTokens: number;
  signal: AbortSignal;
}
export type AgentProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'usage'; usage: AgentUsage }
  | { type: 'finish'; reason: string };
export interface AgentProvider {
  readonly id: string;
  readonly locality: 'cloud' | 'local';
  stream(request: AgentProviderRequest): AsyncIterable<AgentProviderEvent>;
}
/** Required cloud transport gate: must reject if current consent is absent/revoked.
 * Run once per request with the exact outgoing payload, including tool results.
 * Adapt this to the shared privacy guard; a no-op callback is NOT valid integration.
 */
export type AgentCloudConsentGuard = (disclosure: {
  provider: string;
  endpoint: string;
  request: AgentProviderRequest;
}) => void | Promise<void>;
