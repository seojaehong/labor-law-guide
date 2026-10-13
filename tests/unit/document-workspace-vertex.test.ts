import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ generate: vi.fn(), model: vi.fn() }));
vi.mock('@/lib/vertex/client', () => ({ getGenerativeModel: mock.model }));
import { existingVertexGenerator } from '@/lib/document-workspace/vertex-generator';
afterEach(() => vi.clearAllMocks());
it('existing Vertex adapter honors document cap and accounts for hidden tokens', async () => {
  mock.generate.mockResolvedValueOnce({ response: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'synthetic' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 350 } } });
  mock.model.mockReturnValue({ generateContent: mock.generate });
  const result = await existingVertexGenerator({ model: 'reviewed-existing-model', prompt: 'synthetic', maxOutputTokens: 8192, signal: new AbortController().signal });
  expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 250 });
  expect(mock.model).toHaveBeenCalledExactlyOnceWith('reviewed-existing-model');
  expect(mock.generate.mock.calls[0][0].generationConfig.maxOutputTokens).toBe(8192);
});
it('truncated completion abstains', async () => {
  mock.generate.mockResolvedValueOnce({ response: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] } });
  mock.model.mockReturnValue({ generateContent: mock.generate });
  await expect(existingVertexGenerator({ model: 'fixture', prompt: 'synthetic', maxOutputTokens: 8192, signal: new AbortController().signal })).rejects.toThrow('incomplete-generation');
});
it('already cancelled request never starts SDK call', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(existingVertexGenerator({ model: 'fixture', prompt: 'synthetic', maxOutputTokens: 8192, signal: controller.signal })).rejects.toThrow('cancelled');
  expect(mock.model).not.toHaveBeenCalled();
});
