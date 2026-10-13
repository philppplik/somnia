import { AgentError } from './errors';
import type { AgentMessage } from './types';

/** Provider-private protocol state, never UI text or tool authorization. */
export interface ProviderReplay {
  provider: 'deepseek' | 'xai' | 'meta';
  model: string;
  reasoningContent?: string;
  output?: Record<string, unknown>[];
}
const limit = 1024 * 1024;
export function validateReplay(value: unknown): asserts value is ProviderReplay {
  const v = value as ProviderReplay;
  if (!v || !['deepseek', 'xai', 'meta'].includes(v.provider) || typeof v.model !== 'string' || !v.model || v.model.length > 512 || /[\x00-\x1f]/.test(v.model)
    || new TextEncoder().encode(JSON.stringify(v)).byteLength > limit
    || (v.provider === 'deepseek' ? typeof v.reasoningContent !== 'string' || v.output !== undefined
      : !Array.isArray(v.output) || v.reasoningContent !== undefined || v.output.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.type !== 'string' || (item.type === 'reasoning' && (typeof item.encrypted_content !== 'string' || !item.encrypted_content || !Array.isArray(item.summary)))))) {
    throw new AgentError('provider-error', 'protocol', 'Invalid provider replay state.');
  }
}
export function replayFor(message: AgentMessage, provider: string, model: string): ProviderReplay | undefined {
  if (message.providerReplay === undefined) return undefined;
  validateReplay(message.providerReplay);
  return message.role === 'assistant' && message.providerReplay.provider === provider && message.providerReplay.model === model ? message.providerReplay : undefined;
}
