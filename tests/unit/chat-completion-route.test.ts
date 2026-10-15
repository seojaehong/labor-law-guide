import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ vertex: vi.fn(), anthropic: vi.fn(), finish: vi.fn() }));
vi.mock('@/lib/observations/service-completion', () => ({ startServiceObservation: () => ({ finish: mocks.finish }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({}) }) } }));
vi.mock('@/lib/user-situation', () => ({ getSituation: vi.fn(), extractDelta: vi.fn(), upsertSituation: vi.fn(), mergeSituation: vi.fn(), formatSituationForPrompt: () => '' }));
vi.mock('@/lib/legal-verify', () => ({ verifyCitations: async () => ({ hallucinated: [] }) }));
vi.mock('@/lib/rate-limit', () => ({ checkChatRateLimit: async () => ({ allowed: true }), extractIp: () => '', hashIp: () => '' }));
vi.mock('@/lib/kill-switch', () => ({ getChatKillSwitch: async () => ({ disabled: false }) }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => false }));
vi.mock('@/lib/chat/tools/execute', () => ({ executeTool: vi.fn() }));
vi.mock('@/lib/vertex/client', () => ({ getVertexClient: () => ({}), getGenerativeModel: () => ({ generateContentStream: mocks.vertex }) }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream: mocks.anthropic }; } }));
vi.mock('@/lib/chat/context/faq', () => ({ buildFaqContext: async () => ({ context: '', topIds: [], categories: [], matched: false, count: 0, failed: false, selectedFaqs: [] }) }));
vi.mock('@/lib/chat/context/news', () => ({ buildNewsContext: async () => '' }));
vi.mock('@/lib/chat/context/cases', () => ({ buildNlrcCasesContext: vi.fn(), buildCourtCasesContext: vi.fn() }));
vi.mock('@/lib/chat/context/interpretations', () => ({ buildInterpretationsContext: vi.fn() }));
vi.mock('@/lib/chat/context/laws', () => ({ buildLawsContext: async () => ({ ctx: '', rows: 0, via: 'none', status: '0rows' }) }));
import { POST } from '@/app/api/chat/route';
const body = '합성 검증용으로 이미 전달된 안전 본문입니다. '.repeat(6);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder'); });
afterEach(() => { vi.unstubAllEnvs(); });
it.each([
  ['vertex', 'MAX_TOKENS', 'limit'], ['vertex', 'SAFETY', 'filtered'], ['vertex', 'STOP', 'normal'],
  ['anthropic', 'max_tokens', 'limit'], ['anthropic', 'refusal', 'filtered'], ['anthropic', 'end_turn', 'normal'],
])('full chat route distinguishes %s %s from success', async (provider, reason, kind) => {
  if (provider === 'vertex') {
    mocks.vertex.mockResolvedValue({ stream: (async function* () { yield { candidates: [{ content: { parts: [{ text: body }] }, finishReason: reason }] }; })() });
  } else {
    mocks.vertex.mockRejectedValue(new Error('synthetic startup failure'));
    mocks.anthropic.mockReturnValue((async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: body } };
      yield { type: 'message_delta', delta: { stop_reason: reason } };
      yield { type: 'message_stop' };
    })());
  }
  const response = await POST(new NextRequest('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: '합성 질문' }] }) }));
  const text = await response.text();
  expect(text).toContain('이미 전달된 안전 본문');
  const result = mocks.finish.mock.calls.at(-1)?.[0];
  if (kind === 'normal') {
    expect(text).not.toContain('"error":'); expect(result).toMatchObject({ outcome: 'success', result_count: 1 });
  } else {
    expect(text).toContain(`"completion":"${kind}"`);
    expect(result).toMatchObject({ outcome: 'partial_failure' });
    expect(result.result_count).not.toBe(1);
  }
});
