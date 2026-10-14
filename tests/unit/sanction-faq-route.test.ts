import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { db } = vi.hoisted(() => ({ db: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: db }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: db }));
vi.mock('@/lib/chat/context/jev', () => ({ jevRerank: async (_query: string, rows: unknown[], count: number) => rows.slice(0, count) }));
vi.mock('@/lib/ai/retrieval', () => ({ extractTags: () => [], searchCases: async () => ({ tags: [], cases: [], allCases: [], timings: {}, degraded: false }) }));
vi.mock('@/lib/ai/prompt', () => ({ SYSTEM_PROMPT: 'offline system', buildComparisonMeta: () => null, buildUserContext: () => 'offline context', trimHistory: vi.fn((_messages: unknown, context: string) => [{role:'user',content:context}]) }));
beforeEach(() => {
  vi.resetModules();vi.stubEnv('OPENAI_API_KEY', 'offline-never-sent');vi.stubEnv('GEMINI_API_KEY', '');vi.stubEnv('ANTHROPIC_API_KEY', '');
  db.rpc.mockReset().mockResolvedValue({ data: [{ id: 123, question: 'fixture question', answer: 'FIRST_LOOKUP_ANSWER', source: 'fixture source' }], error: null });
  db.from.mockReset().mockImplementation(() => { throw new Error('second FAQ lookup must never happen'); });
});
afterEach(() => { vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks(); });
const req = () => new NextRequest('http://localhost/api/sanction', {method:'POST',body:JSON.stringify({messages:[{role:'user',content:'fixture question'}],stream:true})});
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
it('one FAQ snapshot reaches prompt and UI while invented streamed citations are removed', async () => {
  const fakeFetch = vi.fn(async (_url, options) => {
    expect(JSON.parse(options.body).messages[1].content).toContain('FIRST_LOOKUP_ANSWER');
    return new Response(delta('설명 [FAQ#999] ') + delta('[FAQ#123] 끝') + 'data: [DONE]\n\n');
  });
  vi.stubGlobal('fetch', fakeFetch);
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  const events = response.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  expect(events.find(event => event.type === 'meta').faqs).toEqual([{id:123,category:'',question:'fixture question',answer:'FIRST_LOOKUP_ANSWER',source:'fixture source'}]);
  const streamed = events.filter(event => event.type === 'delta').map(event => event.text).join('');
  expect(streamed).not.toContain('FAQ#999');expect(streamed).toContain('[FAQ#123]');
  expect(events.find(event => event.type === 'done').content).not.toContain('FAQ#999');
  expect(db.from).not.toHaveBeenCalled();expect(fakeFetch).toHaveBeenCalledTimes(1);
});
it('provider EOF without its terminal becomes error, never application done', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('partial fixture answer'))));
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  expect(response).toContain('"type":"error"');expect(response).not.toContain('"type":"done"');
});

it('explicit reset removes old provider history as well as old retrieval context', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(delta('new fixture answer')+'data: [DONE]\n\n')));
  const {POST} = await import('@/app/api/sanction/route');
  const request = new NextRequest('http://localhost/api/sanction',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'OLD_PRIVATE_FIXTURE'},{role:'assistant',content:'OLD_MODEL_FIXTURE'},{role:'user',content:'새 질문: 근로시간'}],stream:true})});
  await (await POST(request)).text();
  const {trimHistory} = await import('@/lib/ai/prompt');
  expect(vi.mocked(trimHistory).mock.calls.at(-1)?.[0]).toEqual([{role:'user',content:'새 질문: 근로시간'}]);
});

it('upstream error preserves safe pending tail and never completes the application response', async () => {
  let sent = false;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    pull(controller) {
      if (!sent) { sent = true;controller.enqueue(new TextEncoder().encode(delta('먼저 보인 문장 [FAQ#123] 안전한 꼬리 [FAQ#999]'))); }
      else controller.error(new Error('offline provider interruption'));
    },
  }))));
  const {POST} = await import('@/app/api/sanction/route');
  const response = await (await POST(req())).text();
  const events = response.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  const body = events.filter(event => event.type === 'delta').map(event => event.text).join('');
  expect(body).toContain('먼저 보인 문장');expect(body).toContain('안전한 꼬리');expect(body).not.toContain('FAQ#999');
  expect(events.some(event => event.type === 'error')).toBe(true);expect(events.some(event => event.type === 'done')).toBe(false);
});
