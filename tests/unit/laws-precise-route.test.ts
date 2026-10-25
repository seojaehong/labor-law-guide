import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), ask: vi.fn(), pipeline: vi.fn(), insert: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }) }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => false }));
vi.mock('@/lib/laws/precise/judge', async (original) => ({ ...await original<object>(), anthropicAsk: mocks.ask }));
vi.mock('@/lib/laws/precise/evidence', () => ({ loadEvidence: async () => new Map() }));
vi.mock('@/lib/laws/precise/pipeline', async (original) => ({ ...await original<object>(), precisePipeline: mocks.pipeline }));
import { POST } from '@/app/api/tools/work-rules-precise/route';
const req = (extra: Record<string, unknown> = {}) => new Request('http://localhost/api/tools/work-rules-precise', { method: 'POST', body: JSON.stringify({ rules: '제1조(목적) 합성 문서', since: '20260101', ...extra }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.insert.mockResolvedValue({ error: null }); vi.stubEnv('WORK_RULES_PRECISE_ENABLED', '1'); vi.stubEnv('WORK_RULES_PRECISE_ANTHROPIC_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', 'fake');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://offline.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake');
});
afterEach(() => vi.unstubAllEnvs());
describe('유료 호출 전 사용량 게이트', () => {
  it('DB 설정이 없으면 503이며 AI를 만들지 않는다', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const r = await POST(req()); expect(r.status).toBe(503); expect((await r.json()).error).toBe('usage_guard_unavailable');
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.pipeline).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'offline' } }, { data: {}, error: null }, { data: [{ allowed: 'yes' }], error: null }])('RPC 오류·형식 오류를 차단한다 %j', async (reply) => {
    mocks.rpc.mockResolvedValue(reply); expect((await POST(req())).status).toBe(503); expect(mocks.ask).not.toHaveBeenCalled();
  });
  it('RPC 예외를 차단한다', async () => {
    mocks.rpc.mockRejectedValue(new Error('offline')); expect((await POST(req())).status).toBe(503); expect(mocks.ask).not.toHaveBeenCalled();
  });
  it('개인 한도 초과는 429이며 전체 한도를 소비하지 않는다', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ allowed: false }], error: null });
    expect((await POST(req())).status).toBe(429); expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.ask).not.toHaveBeenCalled();
  });
  it('개인은 통과해도 전체 카운터 장애면 호출하지 않는다', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: true }], error: null }).mockResolvedValueOnce({ data: null, error: {} });
    expect((await POST(req())).status).toBe(503); expect(mocks.ask).not.toHaveBeenCalled();
  });
});


it('모델이 토큰을 썼어도 모든 조문 응답이 무효이면 502다', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
  mocks.ask.mockImplementation(({ usage }) => { usage.output_tokens = 10; return async () => []; });
  mocks.pipeline.mockResolvedValue({ rows: [], articles: 1, flagged: 1, review: { unanswered: 1, incomplete: 1, conflicts: 0 } });
  expect((await POST(req())).status).toBe(502);
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('수집 저장 예외가 유료 점검 결과를 지우지 않는다', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
  mocks.ask.mockImplementation(({ usage }) => { usage.output_tokens = 10; return async () => []; });
  mocks.pipeline.mockResolvedValue({ rows: [], articles: 1, flagged: 0, review: { unanswered: 0, incomplete: 0, conflicts: 0 } });
  mocks.insert.mockRejectedValue(new Error('offline'));
  const result = await POST(req());
  expect(result.status).toBe(200);
  expect((await result.json()).cost).toMatchObject({ billingVerified: false });
});


it('전용 키를 우선하며 focus·입력을 안전 파이프라인에 보존한다', async () => {
  vi.stubEnv('WORK_RULES_PRECISE_ANTHROPIC_API_KEY', 'dedicated-fake');
  mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });
  mocks.ask.mockImplementation(({ usage }) => { usage.output_tokens = 10; return async () => []; });
  mocks.pipeline.mockResolvedValue({ rows: [], articles: 1, flagged: 0, review: { unanswered: 0, incomplete: 0, conflicts: 0 } });
  expect((await POST(req({ focus: '합성 점검 요청', headcount: '24' }))).status).toBe(200);
  expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'dedicated-fake' }));
  expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({ focus: '합성 점검 요청', headcount: '24', old: null }), expect.anything(), expect.anything());
});
