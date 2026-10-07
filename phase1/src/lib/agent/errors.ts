/** Assumption: the core contract defines no error event, so providers reject/throw. */
export type ProviderErrorCode = 'unreachable' | 'model-not-found' | 'http' | 'protocol' | 'timeout' | 'not-local';
export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string, public readonly failure?: AgentError) { super(message); this.name = 'ProviderError'; }
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
  | 'rate-limited' | 'auth' | 'credit' | 'quota' | 'model-not-found' | 'moderation' | 'server' | 'network' | 'protocol'
  | 'account-auth' | 'not-eligible' | 'usage-limit'
  | 'no-tool-support' | 'consent' | 'user' | 'unknown';
export class AgentError extends Error {
  constructor(public readonly code: AgentErrorCode, public readonly detail: AgentErrorDetail, message: string, public readonly retryable = false, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(message); this.name = 'AgentError';
  }
}
/** Maps an HTTP status (plus a coarse, body-derived hint) to the taxonomy. Never stores the body. */
export function classifyHttp(status: number, hint: { tools?: boolean; routing?: boolean; quota?: boolean } = {}, prefix = 'OpenRouter request failed'): AgentError {
  const m = `${prefix} (HTTP ${status}).`;
  if (hint.quota && (status === 429 || status === 402 || status === 403)) return new AgentError('provider-error', 'quota', m, false, status);
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
  if (error instanceof ProviderError) {
    if (error.failure) return error.failure;
    switch (error.code) {
      case 'unreachable': return new AgentError('provider-error', 'network', 'Cannot reach Ollama. Check that the daemon is running.', true);
      case 'model-not-found': return new AgentError('provider-error', 'model-not-found', 'Ollama model is not installed.');
      case 'timeout': return new AgentError('provider-error', 'timeout', 'Ollama did not answer in time.', true);
      case 'not-local': return new AgentError('provider-error', 'consent', 'Ollama returned remote output without cloud consent.');
      case 'http': return new AgentError('provider-error', 'server', 'Ollama reported a server error.', true);
      case 'protocol': return new AgentError('provider-error', 'protocol', 'Ollama returned an invalid or incomplete response.', true);
    }
  }
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
    case 'rate-limited': return `The provider is rate-limiting this model (HTTP ${e.status ?? 429}), common for free models. ${none} ${e.retryAfterMs !== undefined ? `Wait at least ${Math.ceil(e.retryAfterMs / 1000)} seconds` : 'Wait a minute'} and retry, or choose another model.`;
    case 'auth': return `The API key is missing or was rejected by the provider${e.status ? ` (HTTP ${e.status})` : ''}. ${none} Check the key in Agent configuration.`;
    case 'account-auth': return `The OpenAI account session is missing, expired or was rejected${e.status ? ` (HTTP ${e.status})` : ''}. ${none} Reconnect the account in Agent configuration, or switch back to an API key.`;
    case 'not-eligible': return `This ChatGPT account is not eligible for Sign in with ChatGPT; an eligible ChatGPT Plus or Pro plan is required. ${none} Use an API key for pay-as-you-go API billing instead.`;
    case 'usage-limit': return `This ChatGPT account reached its usage limit. ${none} Check your ChatGPT usage settings or wait for the limit to reset. Automatic retries were stopped; no switch to other billing happens silently.`;
    case 'quota': return `The provider reports that this key's quota or spending limit is exhausted. ${none} Check usage and limits in your provider account, or choose another provider. Automatic retries were stopped.`;
    case 'credit': return `The provider reports no credit or quota for this key (HTTP 402). ${none} Add credit or use a free model.`;
    case 'model-not-found': return `The provider has no available endpoint for this model under the current privacy settings. ${none} Check the model name; for Ollama, install the model first. Or choose another model.`;
    case 'server': return `The provider had a server error${e.status ? ` (HTTP ${e.status})` : ''}. ${none} ${e.retryAfterMs !== undefined ? `Wait at least ${Math.ceil(e.retryAfterMs / 1000)} seconds before retrying.` : 'Retry in a moment.'}`;
    case 'network': return `Could not reach the provider. ${none} Check your connection; for Ollama, make sure it is running. Retry when connected.`;
    case 'no-tool-support': return `This model or provider does not support tool calls, which the agent needs to read and propose file changes. ${none} Choose a model with tool support.`;
    case 'moderation': return `The provider stopped the response (content filter). ${none} Rephrase the request or choose another model.`;
    case 'consent': return `Cloud AI consent is missing or was withdrawn. ${none} Enable it in AI privacy settings.`;
    case 'protocol': return `The provider returned a response the agent could not use. ${none} Retry, or choose another model.`;
    default: return `The agent failed unexpectedly. ${none} Retry; if it keeps happening, start a new chat.`;
  }
}

/** Coarse hints only. Provider text can contain secrets; never persist or display it. */
export function providerErrorHint(message: string): { tools?: boolean; routing?: boolean; quota?: boolean } {
  return {
    tools: /tool[s_ ]?(use|call|choice)?|function[ _]call/i.test(message) && /support|endpoint|not available|no .*found|unsupported/i.test(message),
    routing: /no endpoints? found|zdr|data policy|privacy/i.test(message),
    quota: /insufficient[_ ]quota|quota.{0,30}(exhaust|exceed)|(?:exhaust|exceed).{0,30}quota|(?:credit|balance|billing|spending|daily|monthly).{0,30}(limit|exhaust|insufficient)|insufficient.{0,30}(credit|balance)/i.test(message),
  };
}
/** Reads a bounded error prefix and releases the body, even for huge vendor HTML. */
export async function readHttpError(response: Response): Promise<{status?: number; hint: ReturnType<typeof providerErrorHint>}> {
  const reader = response.body?.getReader();
  let text = '';
  if (reader) {
    const decoder = new TextDecoder(); let bytes = 0;
    try {
      while (bytes < 4096) {
        const {value, done} = await reader.read(); if (done) break;
        const part = value.subarray(0, 4096 - bytes); bytes += part.length;
        text += decoder.decode(part, {stream: true});
      }
      text += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  let json: any; try { json = JSON.parse(text); } catch { /* vendor HTML */ }
  const code = Number(json?.error?.code);
  const raw = typeof json?.error?.metadata?.raw === 'string' ? json.error.metadata.raw : '';
  return {status: Number.isInteger(code) && code >= 400 && code < 600 ? code : undefined,
    hint: providerErrorHint(`${text} ${raw}`)};
}
