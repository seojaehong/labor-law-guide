import type { Generator } from './model-mix';
import type { ModelFactory } from './mock-transport';

/** Existing provider only. Not invoked by the local synthetic route.
 * Caller must have a reviewed policy, durable budget reservation and explicit enablement.
 * SDK cancellation is not guaranteed; runModel retains the full reservation after timeout.
 */
export function createVertexGenerator(factory: ModelFactory): Generator { return async request => {
  if (request.signal.aborted) throw Error('cancelled');
  const model = factory(request.model);
  const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: request.maxOutputTokens } });
  if (request.signal.aborted) throw Error('cancelled-unknown-billing');
  const usage = result.response.usageMetadata;
  const candidate = result.response.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw Error('incomplete-generation');
  return { text: result.response.candidates?.[0]?.content.parts.map(p => p.text || '').join('') || '',
    // Total minus prompt conservatively includes hidden thinking; never infer zero.
    usage: usage?.promptTokenCount !== undefined && usage?.totalTokenCount !== undefined ?
      { inputTokens: usage.promptTokenCount, outputTokens: usage.totalTokenCount - usage.promptTokenCount } : undefined };
}; }
export const existingVertexGenerator: Generator = async request => {
  if (request.signal.aborted) throw Error('cancelled');
  const { getGenerativeModel } = await import('@/lib/vertex/client');
  return createVertexGenerator(getGenerativeModel)(request);
};
