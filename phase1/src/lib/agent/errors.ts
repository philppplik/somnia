/** Assumption: the core contract defines no error event, so providers reject/throw. */
export type ProviderErrorCode = 'unreachable' | 'model-not-found' | 'http' | 'protocol' | 'timeout' | 'not-local';
export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) { super(message); this.name = 'ProviderError'; }
}

/**
 * Agent error taxonomy. Raw provider/tool exceptions can carry secrets or private
 * prompts, so the session only ever surfaces these classified, fixed-text errors.
 * - limit: the bounded loop stopped (steps, tool calls, output tokens, time, context).
 * - tool-unsupported: the model/provider cannot do function calling as required.
 * - provider-error: transport/HTTP/stream failure on the provider side.
 * - aborted: the user (or a consent withdrawal) stopped the turn.
 * - internal: anything unclassified (kept generic on purpose).
 */
export type AgentErrorCode = 'limit' | 'tool-unsupported' | 'provider-error' | 'aborted' | 'internal';
export type AgentErrorDetail =
  | 'steps' | 'tool-calls' | 'output-tokens' | 'timeout' | 'context'
  | 'rate-limited' | 'auth' | 'credit' | 'model-not-found' | 'moderation' | 'server' | 'network' | 'protocol'
  | 'no-tool-support' | 'consent' | 'user' | 'unknown';
export class AgentError extends Error {
  constructor(public readonly code: AgentErrorCode, public readonly detail: AgentErrorDetail, message: string, public readonly retryable = false, public readonly status?: number) {
    super(message); this.name = 'AgentError';
  }
}
/** Maps an HTTP status (plus a coarse, body-derived hint) to the taxonomy. Never stores the body. */
export function classifyHttp(status: number, hint: { tools?: boolean; routing?: boolean } = {}, prefix = 'OpenRouter request failed'): AgentError {
  const m = `${prefix} (HTTP ${status}).`;
  if (status === 401 || status === 403) return new AgentError('provider-error', 'auth', m, false, status);
  if (status === 402) return new AgentError('provider-error', 'credit', m, false, status);
  if (status === 408) return new AgentError('provider-error', 'timeout', m, true, status);
  if (status === 429) return new AgentError('provider-error', 'rate-limited', m, true, status);
  if (status >= 500) return new AgentError('provider-error', 'server', m, true, status);
  if (hint.tools) return new AgentError('tool-unsupported', 'no-tool-support', m, false, status);
  if (status === 404 || hint.routing) return new AgentError('provider-error', 'model-not-found', m, false, status);
  if (status === 413) return new AgentError('limit', 'context', m, false, status);
  return new AgentError('provider-error', 'protocol', m, false, status);
}
/** Turns any thrown value into an AgentError. `timedOut`/`userAborted` come from the session, not the error. */
export function toAgentError(error: unknown, ctx: { timedOut?: boolean; aborted?: boolean } = {}): AgentError {
  if (ctx.timedOut) return new AgentError('limit', 'timeout', 'Agent turn timed out.', true);
  if (ctx.aborted) return new AgentError('aborted', 'user', 'Agent turn stopped.');
  if (error instanceof AgentError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') return new AgentError('aborted', 'user', 'Agent turn stopped.');
  if (name === 'AgentConsentRequiredError') return new AgentError('provider-error', 'consent', 'Cloud consent is missing or was withdrawn.');
  if (error instanceof TypeError) return new AgentError('provider-error', 'network', 'Network request to the provider failed.', true);
  return new AgentError('internal', 'unknown', 'Unexpected agent failure.', true);
}
/** Honest, user-facing panel text: what happened, whether changes exist, what the user can do. */
export function describeAgentError(e: AgentError): string {
  const none = 'No changes were applied.';
  switch (e.detail) {
    case 'user': return `Agent turn stopped. ${none} Provider costs may still occur.`;
    case 'steps': return `The agent used all its work steps before finishing. ${none} Retry with a narrower request (fewer files or one change at a time).`;
    case 'tool-calls': return `The agent tried to make more file requests than allowed in one turn. ${none} Retry with a narrower request.`;
    case 'output-tokens': return `The model ran out of output budget before finishing (reasoning models spend it on thinking). ${none} Retry, ask for a smaller change, or pick a model without long reasoning.`;
    case 'timeout': return `The model did not finish in time. ${none} Retry, or use a faster model.`;
    case 'context': return `The chat or file context is too large for one request. ${none} Start a new chat or reference fewer files.`;
    case 'rate-limited': return `The provider is rate-limiting this model (HTTP ${e.status ?? 429}), common for free models. ${none} Wait a minute and retry, or choose another model.`;
    case 'auth': return `The API key is missing or was rejected by the provider${e.status ? ` (HTTP ${e.status})` : ''}. ${none} Check the key in Agent configuration.`;
    case 'credit': return `The provider reports no credit or quota for this key (HTTP 402). ${none} Add credit or use a free model.`;
    case 'model-not-found': return `The provider has no available endpoint for this model under the current privacy settings. ${none} Check the model name, or choose another model.`;
    case 'server': return `The provider had a server error (HTTP ${e.status ?? 500}). ${none} Retry in a moment.`;
    case 'network': return `Could not reach the provider. ${none} Check your connection and retry.`;
    case 'no-tool-support': return `This model or provider does not support tool calls, which the agent needs to read and propose file changes. ${none} Choose a model with tool support.`;
    case 'moderation': return `The provider stopped the response (content filter). ${none} Rephrase the request or choose another model.`;
    case 'consent': return `Cloud AI consent is missing or was withdrawn. ${none} Enable it in AI privacy settings.`;
    case 'protocol': return `The provider returned a response the agent could not use. ${none} Retry, or choose another model.`;
    default: return `The agent failed unexpectedly. ${none} Retry; if it keeps happening, start a new chat.`;
  }
}
