import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@/lib/vertex/client', () => ({ getGenerativeModel: () => ({ generateContent }) }));
const items = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, question: `question${i} ` + 'x'.repeat(150), answer: 'PRIVATE_ANSWER' }));
const reply = (pick: unknown) => ({ ok: true, json: async () => ({ answers: { pick } }) });
const geminiReply = (text: string) => ({ response: { candidates: [{ content: { parts: [{ text }] } }] } });
let fetchMock: ReturnType<typeof vi.fn>;
async function run(finalN = 5) {
  const { jevRerank } = await import('@/lib/chat/context/jev');
  return jevRerank('test question', items, finalN);
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('TYPESAFE_API_KEY', 'unit-test-placeholder');
  vi.stubEnv('TYPESAFE_API_URL', 'https://example.invalid/unit-test');
  vi.stubEnv('JEV_TIMEOUT_MS', '25');
  vi.stubEnv('JEV_MIN_PROB', '0.12');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  generateContent.mockReset().mockResolvedValue(geminiReply(''));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Jev provider and fallback contract', () => {
  it('ranks valid probabilities, truncates payload to 120 and never sends answer', async () => {
    fetchMock.mockResolvedValue(reply({ probabilities: { '8': 0.7, '3': 0.3 } }));
    expect((await run()).map(x => x.id)).toEqual([8, 3, 1, 2, 4]);
    const init = fetchMock.mock.calls[0][1];
    const payload = JSON.parse(init.body);
    expect(payload.state).toBe('사용자 질문: test question');
    expect(Object.values(payload.questions.pick.criteria)).toEqual(items.map(x => x.question.slice(0, 120)));
    expect(init.body).not.toContain('PRIVATE_ANSWER');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(true);
    expect(generateContent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0.12, 1])('accepts valid confidence boundary %s', async probability => {
    fetchMock.mockResolvedValue(reply({ probabilities: { '8': probability, '1': 0 } }));
    expect((await run(3)).map(x => x.id)).toEqual([8, 1, 2]);
  });
  it('supports choice and confidence', async () => {
    fetchMock.mockResolvedValue(reply({ choice: '7', confidence: 0.8 }));
    expect((await run(3)).map(x => x.id)).toEqual([7, 1, 2]);
  });
  it.each([{ probabilities: { '8': 0.01 } }, { probabilities: {} }])('keeps original order on empty or low-confidence result %j', async pick => {
    fetchMock.mockResolvedValue(reply(pick));
    expect(await run()).toEqual(items.slice(0, 5));
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('uses two Gemini calls without a TypeSafe key', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    generateContent.mockResolvedValueOnce(geminiReply('3, 3, 99')).mockResolvedValueOnce(geminiReply('6'));
    expect((await run(3)).map(x => x.id)).toEqual([3, 1, 2]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generateContent.mock.calls)).not.toContain('PRIVATE_ANSWER');
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    { probabilities: { '1': NaN } }, { probabilities: { '1': Infinity } },
    { probabilities: { '1': -0.1 } }, { probabilities: { '1': 1.1 } },
    { probabilities: { '1': '0.9' } }, { probabilities: { '0': 0.9 } },
    { probabilities: { '9': 0.9 } }, { probabilities: { '1': 0.8, '01': 0.9 } },
    { probabilities: [] }, { probabilities: null }, { choice: '9' },
    { choice: '1', confidence: null }, { choice: '1', confidence: NaN }, { choice: '1', confidence: -1 },
  ])('rejects malformed IDs/probabilities and falls back: %j', async pick => {
    fetchMock.mockResolvedValue(reply(pick));
    expect(await run()).toEqual(items.slice(0, 5));
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([null, [], {}, { answers: null }, { answers: { pick: [] } }])('rejects malformed response envelopes %j', async body => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => body });
    await run();
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it('keeps original order if missing-key Gemini fallback rejects', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    generateContent.mockRejectedValue(new Error('PRIVATE_PROVIDER_MESSAGE'));
    expect(await run()).toEqual(items.slice(0, 5));
    expect(console.error).toHaveBeenCalledWith('[jev] 키 없음 + Gemini 폴백 실패:', 'provider-error');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not read or log HTTP error bodies', async () => {
    const text = vi.fn().mockResolvedValue('PRIVATE_BODY');
    fetchMock.mockResolvedValue({ ok: false, status: 500, text });
    await run();
    expect(text).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('[jev] 실패 → Gemini 폴백:', 'http:500');
  });
  it('falls back after JSON failure without logging provider messages', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error('PRIVATE_BODY'); } });
    generateContent.mockRejectedValue(new Error('PRIVATE_QUERY'));
    expect(await run()).toEqual(items.slice(0, 5));
    expect(JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(console.error).mock.calls])).not.toMatch(/PRIVATE/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['fetch', 'body'])('aborts a stalled %s before fallback and releases timers', async stage => {
    if (stage === 'fetch') fetchMock.mockImplementation(() => new Promise(() => {}));
    else fetchMock.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    const promise = run();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(25);
    expect(await promise).toEqual(items.slice(0, 5));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds Gemini fallback and returns original order when both providers stall', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    generateContent.mockImplementation(() => new Promise(() => {}));
    const promise = run();
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(25);
    expect(await promise).toEqual(items.slice(0, 5));
    expect(vi.getTimerCount()).toBe(0);
  });
});
