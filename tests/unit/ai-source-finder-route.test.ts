// 261112 재홍님 「추천안대로」 — /ai 는 「근거 자료 찾기」다. 자료 목록이 먼저, 요약은 그 자료만 정리한 참고용.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({
  finish: vi.fn(), round: vi.fn(), faq: vi.fn(), laws: vi.fn(), nlrc: vi.fn(), court: vi.fn(), interp: vi.fn(), blog: vi.fn(),
  getSituation: vi.fn(), extractDelta: vi.fn(), upsertSituation: vi.fn(),
  vertex: vi.fn(), anthropicOk: vi.fn(),
}));
vi.mock('@/lib/observations/service-completion', () => ({ startServiceObservation: () => ({ finish: m.finish }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({}) }) } }));
vi.mock('@/lib/user-situation', () => ({ getSituation: m.getSituation, extractDelta: m.extractDelta, upsertSituation: m.upsertSituation, mergeSituation: vi.fn(), formatSituationForPrompt: () => 'PRIVATE_PROFILE' }));
vi.mock('@/lib/legal-verify', () => ({ verifyCitations: async () => ({ hallucinated: [] }) }));
vi.mock('@/lib/rate-limit', () => ({ checkChatRateLimit: async () => ({ allowed: true }), extractIp: () => '', hashIp: () => '' }));
vi.mock('@/lib/kill-switch', () => ({ getChatKillSwitch: async () => ({ disabled: false }) }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => false, verifyTurnstile: vi.fn() }));
vi.mock('@/lib/chat/tools/execute', () => ({ executeTool: async () => ({}) }));
vi.mock('@/lib/chat/stream-round', () => ({ streamRound: m.round }));
vi.mock('@/lib/chat/anthropic-fallback', () => ({ isAnthropicConfigured: () => m.anthropicOk() }));
vi.mock('@/lib/vertex/client', () => ({ getVertexClient: () => m.vertex() }));
vi.mock('@/lib/chat/context/faq', () => ({ buildFaqContext: m.faq }));
vi.mock('@/lib/chat/context/news', () => ({ buildNewsContext: async () => 'PRIVATE_NEWS_CONTEXT' }));
vi.mock('@/lib/chat/context/cases', () => ({ buildNlrcCasesContext: m.nlrc, buildCourtCasesContext: m.court }));
vi.mock('@/lib/chat/context/interpretations', () => ({ buildInterpretationsContext: m.interp }));
vi.mock('@/lib/chat/context/laws', () => ({ buildLawsContext: m.laws }));
vi.mock('@/lib/chat/context/blog', () => ({ buildBlogSources: m.blog }));
import { POST } from '@/app/api/chat/route';
import { SYSTEM_PROMPT } from '@/content/ai-knowledge';

const empty = { ctx: '', rows: 0, via: 'none', status: '0rows' };
const post = (content: string, extra: Record<string, unknown> = {}) =>
  POST(new NextRequest('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content }], ...extra }) }));
const frames = (text: string) => text.split('\n\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]')).map(l => JSON.parse(l.slice(6)));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OPENAI_API_KEY', 'offline-placeholder');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ embedding: [0] }] }) })));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  m.vertex.mockImplementation(() => ({}));
  m.anthropicOk.mockImplementation(() => false);
  m.faq.mockResolvedValue({ context: 'FAQ_CTX', topIds: [123], matched: true, count: 1, categories: [], failed: false,
    selectedFaqs: [{ id: 123, unified_category: '연차유급휴가', question: '연차는 언제 생기나요?', answer: '15일' }] });
  m.laws.mockResolvedValue({ ...empty, ctx: 'LAW_CTX', rows: 1, status: 'ok',
    items: [{ type: 'LAW', id: '근로기준법 제60조', title: '근로기준법 제60조 (연차 유급휴가)', href: 'https://www.law.go.kr/법령/근로기준법/제60조' }] });
  m.nlrc.mockResolvedValue({ ...empty, ctx: 'CASE_CTX', rows: 1, status: 'ok', evidenceIds: ['n1'],
    items: [{ type: 'CASE', id: 'n1', title: '판정례', href: '/decisions/n1' }] });
  m.court.mockResolvedValue(empty);
  m.interp.mockResolvedValue(empty);
  m.blog.mockResolvedValue([{ type: 'BLOG', id: 'leave-guide', title: '연차휴가 해설', href: '/blog/leave-guide' }]);
  m.round.mockImplementation(async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content: '요약 본문 [FAQ#123]' })}\n\n`));
    return { content: '요약 문장 '.repeat(20) + '[FAQ#123]', toolCalls: [] };
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('찾은 자료 목록(조문·FAQ·판정례·해설 글)을 요약 본문보다 먼저 보낸다', async () => {
  const out = frames(await (await post('연차휴가는 언제 생기나요?')).text());
  const first = out.findIndex(f => Array.isArray(f.sources));
  const firstContent = out.findIndex(f => typeof f.content === 'string');
  expect(first).toBeGreaterThan(-1);
  expect(first).toBeLessThan(firstContent);
  const sources = out[first].sources as Array<{ type: string; href: string }>;
  expect(sources.map(s => s.type)).toEqual(['LAW', 'FAQ', 'CASE', 'BLOG']);
  expect(sources.find(s => s.type === 'FAQ')?.href).toBe('/faq?id=123');
  // 인용 검증 목록은 그대로 함께 간다
  expect(out[first].evidence).toEqual([{ type: 'FAQ', id: '123' }, { type: 'CASE', id: 'n1' }]);
});

it('세션 id 가 와도 개인 사정을 읽거나 뽑거나 저장하지 않는다', async () => {
  await (await post('5명 회사에서 3년 일했는데 퇴직금은요?', { sessionId: 'offline_session_123456' })).text();
  expect(m.getSituation).not.toHaveBeenCalled();
  expect(m.extractDelta).not.toHaveBeenCalled();
  expect(m.upsertSituation).not.toHaveBeenCalled();
  const system = JSON.stringify(m.round.mock.calls[0][1][0]);
  expect(system).not.toContain('PRIVATE_PROFILE');
  // 화면에 보이지 않는 뉴스는 요약 근거로 넣지 않는다
  expect(system).not.toContain('PRIVATE_NEWS_CONTEXT');
  expect(system).toContain('FAQ_CTX');
  expect(system).toContain('LAW_CTX');
});

it('계산 질문이어도 요약 라운드에 계산 도구를 붙이지 않는다', async () => {
  await (await post('퇴직금 계산 기간은 어떻게 되나요? 계산해줘')).text();
  expect(m.round).toHaveBeenCalledTimes(1);
  expect(m.round.mock.calls[0][2]).toBe(false);
});

it('요약을 못 만들면 찾은 자료를 보라고 안내하고 채팅 문의로 돌리지 않는다', async () => {
  m.round.mockResolvedValue({ content: '', toolCalls: [] });
  const text = await (await post('해고예고는 며칠 전에 해야 하나요?')).text();
  expect(text).toContain('요약을 만들지 못했습니다');
  expect(text).not.toContain('채팅으로 문의');
});

it('요약 모델이 준비되지 않아도 찾은 자료는 보내고, 요약 자리에 준비 안 됨을 알린 뒤 끝낸다', async () => {
  m.vertex.mockImplementation(() => { throw new Error('no credentials'); });
  const res = await post('연차휴가는 언제 생기나요?');
  expect(res.status).toBe(200);
  const text = await res.text();
  const out = frames(text);
  const src = out.find(f => Array.isArray(f.sources));
  expect((src?.sources as Array<{ type: string }>).map(s => s.type)).toEqual(['LAW', 'FAQ', 'CASE', 'BLOG']);
  const errIdx = out.findIndex(f => typeof f.error === 'string');
  expect(out[errIdx].error).toContain('요약 기능이 준비되지 않았습니다');
  expect(out.indexOf(src!)).toBeLessThan(errIdx);
  expect(m.round).not.toHaveBeenCalled();
  expect(text).toContain('[DONE]');
  expect(m.finish).toHaveBeenCalledTimes(1);
  expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'not_configured' }));
});

it('시스템 프롬프트는 자료 정리 역할이고 상담·자문·노란봉투법 범위를 말하지 않는다', () => {
  expect(SYSTEM_PROMPT).not.toMatch(/상담|자문|노란봉투|진단|대리/);
  expect(SYSTEM_PROMPT).toContain('제공된 자료');
  expect(SYSTEM_PROMPT).toContain('자료에 없');
});
