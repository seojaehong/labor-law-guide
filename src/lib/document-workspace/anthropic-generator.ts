import type Anthropic from '@anthropic-ai/sdk';
import type { Generator } from './model-mix';
import { toAnthropicMessages } from '@/lib/chat/anthropic-fallback';
import { validUsage, type TokenUsage } from './cost';
export type AnthropicFactory = () => Pick<Anthropic, 'messages'>;
/** Same adapter for Haiku/Sonnet; factory injection keeps fixture runs credential-free. */
export function createAnthropicGenerator(factory: AnthropicFactory): Generator {
  return async request => {
    if (request.signal.aborted) throw Error('cancelled');
    const { messages, system } = toAnthropicMessages([{ role: 'user', content: request.prompt }]);
    const response = await factory().messages.create({ model: request.model, max_tokens: request.maxOutputTokens,
      messages, ...(system ? { system } : {}) }, { signal: request.signal, maxRetries: 0 });
    if (request.signal.aborted) throw Error('cancelled-unknown-billing');
    if (response.stop_reason !== 'end_turn') throw Error('incomplete-generation');
    const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
    const usage = response.usage;
    if (!usage) throw Error('invalid-usage');
    const raw = { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      cache_creation: usage.cache_creation ?? { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } };
    const normalized: TokenUsage = { inputTokens: raw.input_tokens + raw.cache_creation_input_tokens +
      raw.cache_read_input_tokens, outputTokens: raw.output_tokens, anthropic: raw };
    if (!validUsage(normalized)) throw Error('invalid-usage');
    return { text, usage: normalized };
  };
}
/** Dormant existing-client path; the local route uses only injected offline factory. */
export const existingAnthropicGenerator: Generator = async request => {
  if (request.signal.aborted) throw Error('cancelled');
  const { getAnthropicClient } = await import('@/lib/chat/anthropic-fallback');
  return createAnthropicGenerator(getAnthropicClient)(request);
};
