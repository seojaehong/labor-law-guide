import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUrlScrubber, scrubFakeUrls } from '@/lib/chat/scrub-urls';
const mocks = vi.hoisted(() => ({ vertex: vi.fn(), anthropic: vi.fn() }));
vi.mock('@/lib/vertex/client', () => ({ getGenerativeModel: () => ({ generateContentStream: mocks.vertex }) }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream: mocks.anthropic }; } }));
import { streamRound } from '@/lib/chat/stream-round';
import { streamAnthropicRound } from '@/lib/chat/anthropic-fallback';

function capture() {
  const chunks: string[] = [];
  const controller = { enqueue: (value: Uint8Array) => chunks.push(JSON.parse(new TextDecoder().decode(value).slice(6)).content) } as unknown as ReadableStreamDefaultController<Uint8Array>;
  return { controller, chunks };
}
beforeEach(() => { vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-test-only'); mocks.vertex.mockReset(); mocks.anthropic.mockReset(); });
describe('stream URL and citation regressions', () => {
  const text = '서론입니다 [FAQ#123] ' + '이어지는 안전한 본문입니다. '.repeat(50);
  it('releases prose after a standalone citation before flush', () => {
    const scrubber = createUrlScrubber();
    expect(scrubber.push(text)).toBe(text);
  });
  it('is invariant at every split and for character chunks', () => {
    for (const sample of [text, '[일반 괄호] 본문입니다. ', '[원문](https://winhr.co.kr/blog/123) 본문입니다. ', '[원문](https://yellowenvelope.kr/faq?id=123) 본문입니다. ']) {
      for (let i = 0; i <= sample.length; i++) {
        const scrubber = createUrlScrubber();
        expect(scrubber.push(sample.slice(0, i)) + scrubber.push(sample.slice(i)) + scrubber.flush(), `split ${i}`).toBe(scrubFakeUrls(sample));
      }
      const scrubber = createUrlScrubber();
      expect([...sample].map(c => scrubber.push(c)).join('') + scrubber.flush()).toBe(scrubFakeUrls(sample));
    }
  });
  it('preserves pending safe text on Vertex failure without retrying another provider', async () => {
    mocks.vertex.mockResolvedValue({ stream: (async function* () { yield { candidates: [{ content: { parts: [{ text: '확정된본문' }] } }] }; throw new Error('synthetic interruption'); })() });
    const { controller, chunks } = capture();
    await expect(streamRound(controller, [{ role: 'user', content: 'synthetic' }], false, new TextEncoder())).rejects.toThrow('synthetic interruption');
    expect(chunks.join('')).toBe('확정된본문');
    expect(mocks.anthropic).not.toHaveBeenCalled();
  });
  it('preserves citation prose at every provider chunk boundary on midstream errors', async () => {
    const sample = '서론입니다 [FAQ#123] 이어지는 안전한 본문';
    for (let i = 0; i <= sample.length; i++) {
      mocks.vertex.mockResolvedValue({ stream: (async function* () {
        for (const text of [sample.slice(0, i), sample.slice(i)]) yield { candidates: [{ content: { parts: [{ text }] } }] };
        throw new Error('synthetic interruption');
      })() });
      const vertex = capture();
      await expect(streamRound(vertex.controller, [], false, new TextEncoder())).rejects.toThrow('synthetic interruption');
      expect(vertex.chunks.join(''), `Vertex split ${i}`).toBe(sample);
      mocks.anthropic.mockReturnValue((async function* () {
        for (const text of [sample.slice(0, i), sample.slice(i)]) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
        throw new Error('synthetic interruption');
      })());
      const anthropic = capture();
      await expect(streamAnthropicRound(anthropic.controller, [], new TextEncoder())).rejects.toThrow('synthetic interruption');
      expect(anthropic.chunks.join(''), `Anthropic split ${i}`).toBe(sample);
    }
  });
  it('preserves body and strips incomplete destination on Anthropic failure', async () => {
    mocks.anthropic.mockReturnValue((async function* () { yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '확정 본문 [원문](https://winhr.co.kr/unfinished' } }; throw new Error('synthetic interruption'); })());
    const { controller, chunks } = capture();
    await expect(streamAnthropicRound(controller, [{ role: 'user', content: 'synthetic' }], new TextEncoder())).rejects.toThrow('synthetic interruption');
    expect(chunks.join('')).toBe('확정 본문 원문');
  });
});
