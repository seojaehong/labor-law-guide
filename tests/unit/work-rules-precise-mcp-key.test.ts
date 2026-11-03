import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 정밀 점검 서버 간 호출 키(WORK_RULES_PRECISE_MCP_KEY) — 키 일치 / 불일치 / 미설정 세 갈래와 한도·로그를 본다.
const m = vi.hoisted(() => ({ ts: true, verify: vi.fn(), rpc: vi.fn(), insert: vi.fn(), pipeline: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => m.ts, verifyTurnstile: m.verify }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: m.rpc, from: () => ({ insert: m.insert }) }) }));
vi.mock('@/lib/laws/precise/pipeline', async (orig) => ({ ...(await orig<typeof import('@/lib/laws/precise/pipeline')>()), precisePipeline: m.pipeline }));
vi.mock('@/lib/laws/precise/judge', async (orig) => ({
  ...(await orig<typeof import('@/lib/laws/precise/judge')>()),
  anthropicAsk: ({ usage }: { usage: { output_tokens: number } }) => { usage.output_tokens = 10; return async () => []; },
}));

import { POST } from '@/app/api/tools/work-rules-precise/route';
import { mcpAuth, MIN_KEY_LENGTH } from '@/lib/laws/precise/mcp-key';

const KEY = 'k'.repeat(16) + 'synthetic-test-key-0123456789';
const RULES = '제1조(목적) 이 규칙은 시험 회사 직원의 근로조건을 정한다.\n제2조(휴게) 근로시간이 4시간이면 30분 이상 휴게를 준다.';
const req = (auth?: string, body: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/tools/work-rules-precise', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ rules: RULES, since: '20250101', ...body }),
  });
const keysCounted = () => m.rpc.mock.calls.map((c) => c[1] as { p_scope: string; p_key: string; p_max: number });

beforeEach(() => {
  vi.clearAllMocks();
  m.ts = true;
  vi.stubEnv('WORK_RULES_PRECISE_ENABLED', '1');
  vi.stubEnv('WORK_RULES_PRECISE_ANTHROPIC_API_KEY', 'offline-placeholder');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline-placeholder');
  vi.stubEnv('WORK_RULES_PRECISE_MCP_KEY', KEY);
  m.verify.mockResolvedValue({ skipped: false, success: false });
  m.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
  m.insert.mockResolvedValue({ error: null });
  m.pipeline.mockResolvedValue({ rows: [], articles: 2, flagged: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('키 일치', () => {
  it('자동 확인 없이 점검하고, IP 한도 대신 키 한도와 전체 한도를 센다', async () => {
    const res = await POST(req(`Bearer ${KEY}`));
    expect(res.status).toBe(200);
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.pipeline).toHaveBeenCalledTimes(1);
    const counted = keysCounted();
    expect(counted).toHaveLength(2);
    expect(counted[0].p_key).toMatch(/^wrpk:[0-9a-f]{32}$/);
    expect(counted[0].p_key).not.toContain(KEY);
    expect(counted[0].p_max).toBe(20);
    expect(counted[1]).toMatchObject({ p_scope: 'global', p_key: 'wrp_all' });
    expect(counted.some((c) => c.p_key.startsWith('wrp:'))).toBe(false);
  });

  it('머리글 이름·Bearer 대소문자는 가리지 않는다', async () => {
    expect((await POST(req(`bearer   ${KEY}`))).status).toBe(200);
  });

  it('키 한도를 넘으면 429, 한도를 못 읽으면 막는다(503)', async () => {
    m.rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    expect((await POST(req(`Bearer ${KEY}`))).status).toBe(429);
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect((await POST(req(`Bearer ${KEY}`))).status).toBe(503);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect((await POST(req(`Bearer ${KEY}`))).status).toBe(503);
    expect(m.pipeline).not.toHaveBeenCalled();
  });

  it('동의 없으면 본문을 저장하지 않는다 — 화면 경로와 같은 규칙', async () => {
    await POST(req(`Bearer ${KEY}`));
    expect(m.insert.mock.calls[0][0]).toMatchObject({ stored_text: false, rules_text: null, old_text: null });
  });

  it('로그에 키·본문을 남기지 않는다', async () => {
    const spies = (['log', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    await POST(req(`Bearer ${KEY}`));
    await POST(req('Bearer wrong-key-but-long-enough-0123456789abcdef'));
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('wrong-key');
    expect(logged).not.toContain('근로조건');
  });
});

describe('키 불일치', () => {
  it('401 — 점검하지 않고, 자동 확인도 부르지 않으며, 그 IP 의 하루 횟수를 하나 쓴다', async () => {
    const res = await POST(req('Bearer wrong-key-but-long-enough-0123456789abcdef'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
    expect(m.pipeline).not.toHaveBeenCalled();
    expect(m.verify).not.toHaveBeenCalled();
    const counted = keysCounted();
    expect(counted).toHaveLength(1);
    expect(counted[0]).toMatchObject({ p_scope: 'ip', p_max: 3 });
    expect(counted[0].p_key).toMatch(/^wrp:/);
  });

  it('키 앞부분만 맞아도 401', async () => {
    expect((await POST(req(`Bearer ${KEY.slice(0, -1)}`))).status).toBe(401);
  });
});

describe('키 미설정', () => {
  it('env 에 키가 없으면 Bearer 를 무시하고 화면 경로(자동 확인)로 본다', async () => {
    vi.stubEnv('WORK_RULES_PRECISE_MCP_KEY', '');
    const res = await POST(req(`Bearer ${KEY}`));
    expect(res.status).toBe(403);
    expect(m.verify).toHaveBeenCalledWith(null, '203.0.113.7');
    expect(m.pipeline).not.toHaveBeenCalled();
  });

  it(`키가 ${MIN_KEY_LENGTH}자보다 짧으면 꺼진 것으로 본다`, async () => {
    vi.stubEnv('WORK_RULES_PRECISE_MCP_KEY', 'short');
    expect((await POST(req('Bearer short'))).status).toBe(403);
    expect(mcpAuth('Bearer short', 'short')).toEqual({ kind: 'none' });
  });

  it('정밀 점검 자체가 꺼져 있으면 키가 맞아도 501', async () => {
    vi.stubEnv('WORK_RULES_PRECISE_ENABLED', '');
    expect((await POST(req(`Bearer ${KEY}`))).status).toBe(501);
  });
});

describe('Bearer 가 없는 화면 경로는 그대로', () => {
  it('자동 확인을 통과하면 IP 한도와 전체 한도를 센다', async () => {
    m.verify.mockResolvedValue({ skipped: false, success: true });
    const res = await POST(req(undefined, { turnstileToken: 't1' }));
    expect(res.status).toBe(200);
    expect(m.verify).toHaveBeenCalledWith('t1', '203.0.113.7');
    expect(keysCounted().map((c) => c.p_key.split(':')[0])).toEqual(['wrp', 'wrp_all']);
  });

  it('IP 한도는 DB 오류에 fail-open 이다(종전 그대로)', async () => {
    m.verify.mockResolvedValue({ skipped: false, success: true });
    m.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await POST(req(undefined, { turnstileToken: 't1' }))).status).toBe(200);
  });
});
