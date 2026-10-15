import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ vertex: vi.fn(), anthropic: vi.fn() }));
vi.mock('@/lib/vertex/client', () => ({ getGenerativeModel: () => ({ generateContentStream: mocks.vertex }) }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream: mocks.anthropic }; } }));
import { streamRound } from '@/lib/chat/stream-round';
import { streamAnthropicRound } from '@/lib/chat/anthropic-fallback';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function capture() {
  const chunks: string[] = [];
  const controller = { enqueue: (value: Uint8Array) => chunks.push(JSON.parse(new TextDecoder().decode(value).slice(6)).content) } as unknown as ReadableStreamDefaultController<Uint8Array>;
  return { chunks, controller };
}
it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER', undefined])('Vertex %s cannot become a complete answer', async finishReason => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  mocks.vertex.mockResolvedValue({ stream: (async function* () {
    yield { candidates: [{ content: { parts: [{ text: '이미 전달된 안전 본문입니다. '.repeat(10) }] }, finishReason }] };
  })() });
  const output = capture();
  await expect(streamRound(output.controller, [], false, new TextEncoder())).rejects.toThrow();
  expect(output.chunks.join('')).toContain('이미 전달된 안전 본문');
  expect(mocks.anthropic).not.toHaveBeenCalled();
});
it('Vertex STOP remains a successful answer', async () => {
  mocks.vertex.mockResolvedValue({ stream: (async function* () {
    yield { candidates: [{ content: { parts: [{ text: '완료 본문' }] }, finishReason: 'STOP' }] };
  })() });
  expect((await streamRound(capture().controller, [], false, new TextEncoder())).content).toBe('완료 본문');
});
it.each(['max_tokens', 'model_context_window_exceeded', 'refusal', 'pause_turn', undefined])('Anthropic %s plus message_stop is incomplete', async stop_reason => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder');
  mocks.anthropic.mockReturnValue((async function* () {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '보존할 안전 본문' } };
    yield { type: 'message_delta', delta: { stop_reason } };
    yield { type: 'message_stop' };
  })());
  const output = capture();
  await expect(streamAnthropicRound(output.controller, [], new TextEncoder())).rejects.toThrow();
  expect(output.chunks.join('')).toContain('보존할 안전 본문');
});
it('Vertex normal tool handoff preserves tool calls, truncated handoff cannot run', async () => {
  for (const finishReason of ['STOP', 'MAX_TOKENS']) {
    mocks.vertex.mockResolvedValue({ stream: (async function* () {
      yield { candidates: [{ content: { parts: [{ functionCall: { name: 'synthetic_tool', args: {} } }] }, finishReason }] };
    })() });
    const result = streamRound(capture().controller, [], true, new TextEncoder());
    if (finishReason === 'STOP') expect((await result).toolCalls).toHaveLength(1);
    else await expect(result).rejects.toThrow('출력 길이 제한');
  }
});
it.each([true, false])('Anthropic end_turn requires message_stop: %s', async terminal => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder');
  mocks.anthropic.mockReturnValue((async function* () {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '완료 본문' } };
    yield { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
    if (terminal) yield { type: 'message_stop' };
  })());
  const result = streamAnthropicRound(capture().controller, [], new TextEncoder());
  if (terminal) expect((await result).content).toBe('완료 본문');
  else await expect(result).rejects.toThrow();
});
