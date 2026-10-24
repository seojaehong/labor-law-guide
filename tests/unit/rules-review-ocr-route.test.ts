import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ create: vi.fn(), limit: vi.fn(), finish: vi.fn(), key: '', ts: false, verify: vi.fn() }));
vi.mock('@/lib/observations/service-completion', () => ({ startServiceObservation: () => ({ finish: m.finish }) }));
vi.mock('@/lib/rate-limit', () => ({ incrRateLimit: m.limit, extractIp: () => '203.0.113.9', hashIp: () => 'h' }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => m.ts, verifyTurnstile: m.verify }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: m.create }; constructor(o: { apiKey: string }) { m.key = o.apiKey; } } }));

import { POST } from '@/app/api/tools/rules-review/ocr/route';
import { looksRead } from '@/lib/rules-review/ocr-check';

const PAGE = '직원 복무 규정\n제1조(목적) 이 규정은 직원의 복무에 관한 사항을 정함을 목적으로 한다.\n제2조(근무시간) ① 근무시간은 09:00부터 18:00까지로 한다.';
const reply = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });
const req = (type = 'image/jpeg', bytes = 2000, auth: Record<string, string> = {}) => {
  const form = new FormData();
  form.append('image', new File([new Uint8Array(bytes)], 'p1.jpg', { type }));
  for (const [k, v] of Object.entries(auth)) form.append(k, v);
  return new Request('http://localhost/api/tools/rules-review/ocr', { method: 'POST', body: form });
};

beforeEach(() => { vi.clearAllMocks(); m.ts = false; vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder'); m.limit.mockResolvedValue({ allowed: true }); });

describe('자동 확인은 묶음당 한 번 — 통과하면 10분 통행증', () => {
  beforeEach(() => { m.ts = true; vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret'); m.verify.mockResolvedValue({ skipped: false, success: true }); });

  it('토큰으로 통과하면 통행증을 돌려주고, 다음 쪽은 통행증만으로 확인 없이 읽는다', async () => {
    m.create.mockResolvedValue(reply(PAGE));
    const first = await (await POST(req(undefined, undefined, { turnstileToken: 't1' }))).json();
    expect(typeof first.pass).toBe('string');
    expect(m.verify).toHaveBeenCalledTimes(1);
    const res = await POST(req(undefined, undefined, { pass: first.pass }));
    expect(res.status).toBe(200);
    expect(m.verify).toHaveBeenCalledTimes(1);
  });

  it('읽지 못한 쪽(422)에도 통행증을 싣는다 — 첫 쪽이 실패해도 다음 쪽에서 토큰을 다시 받지 않게', async () => {
    m.create.mockResolvedValue(reply('[판독 불가]'));
    const res = await POST(req(undefined, undefined, { turnstileToken: 't1' }));
    expect(res.status).toBe(422);
    expect(typeof (await res.json()).pass).toBe('string');
  });

  it('고쳐 쓴 통행증·만료된 통행증·다른 키로 만든 통행증은 403', async () => {
    m.create.mockResolvedValue(reply(PAGE));
    const { pass } = await (await POST(req(undefined, undefined, { turnstileToken: 't1' }))).json();
    m.verify.mockResolvedValue({ skipped: false, success: false, reason: 'token_missing' });
    expect((await POST(req(undefined, undefined, { pass: pass.slice(0, -2) + 'xx' }))).status).toBe(403);
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000 });
    expect((await POST(req(undefined, undefined, { pass }))).status).toBe(403);
    vi.useRealTimers();
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'other-secret');
    expect((await POST(req(undefined, undefined, { pass }))).status).toBe(403);
  });

  it('통행증이 있어도 쪽 단위 하루 한도는 그대로 센다', async () => {
    m.create.mockResolvedValue(reply(PAGE));
    const { pass } = await (await POST(req(undefined, undefined, { turnstileToken: 't1' }))).json();
    m.limit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(req(undefined, undefined, { pass }))).status).toBe(429);
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('스캔 쪽 읽기', () => {
  it('하이쿠가 읽으면 그대로 돌려준다 — 온도 값은 보내지 않는다', async () => {
    m.create.mockResolvedValueOnce(reply(PAGE));
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe('haiku');
    expect(body.lines).toEqual(PAGE.split('\n'));
    expect(m.create).toHaveBeenCalledTimes(1);
    const sent = m.create.mock.calls[0][0];
    expect(sent.model).toBe('claude-haiku-5-5');
    expect(sent).not.toHaveProperty('temperature');
  });

  it.each([
    ['판독 불가 표시', reply('[판독 불가]')],
    ['출력이 잘림', reply(PAGE, 'max_tokens')],
    ['글자가 거의 없음', reply('제1조')],
    ['거절', reply('', 'refusal')],
  ])('하이쿠 결과가 모자라면(%s) 소넷으로 다시 읽는다', async (_, first) => {
    m.create.mockResolvedValueOnce(first).mockResolvedValueOnce(reply(PAGE));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).model).toBe('sonnet');
    expect(m.create.mock.calls.map((c) => c[0].model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
  });

  it('하이쿠 호출이 실패해도 소넷으로 다시 읽는다', async () => {
    m.create.mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 })).mockResolvedValueOnce(reply(PAGE));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).model).toBe('sonnet');
  });

  it('둘 다 호출이 실패하면 503 — 502·504 는 앞단(Cloudflare)이 제 화면으로 바꿔 내용이 사라진다', async () => {
    m.create.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('ocr_failed');
    expect(body.upstream).toBe(400);
  });

  it('둘 다 못 읽으면 422', async () => {
    m.create.mockResolvedValue(reply('[판독 불가]'));
    const res = await POST(req());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('unreadable');
  });

  it('전용 키 → 정밀 점검 키 → 기본 키 순으로 고른다(기본 키는 작업공간 미지정이라 400 이 날 수 있다)', async () => {
    vi.stubEnv('WORK_RULES_PRECISE_ANTHROPIC_API_KEY', 'precise-key');
    m.create.mockResolvedValueOnce(reply(PAGE));
    expect((await POST(req())).status).toBe(200);
    expect(m.key).toBe('precise-key');
    vi.stubEnv('RULES_OCR_ANTHROPIC_API_KEY', 'ocr-key');
    m.create.mockResolvedValueOnce(reply(PAGE));
    await POST(req());
    expect(m.key).toBe('ocr-key');
  });

  it('키가 없으면 501, 이미지가 아니면 400, 한도를 넘으면 429 — 모델을 부르지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('WORK_RULES_PRECISE_ANTHROPIC_API_KEY', '');
    vi.stubEnv('RULES_OCR_ANTHROPIC_API_KEY', '');
    expect((await POST(req())).status).toBe(501);
    vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder');
    expect((await POST(req('application/pdf'))).status).toBe(400);
    m.limit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(req())).status).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe('읽었다고 볼 기준', () => {
  it('끝까지 썼고, 판독 불가 표시가 없고, 한글·숫자가 충분해야 한다', () => {
    expect(looksRead(PAGE, 'end_turn')).toBe(true);
    expect(looksRead(PAGE, 'max_tokens')).toBe(false);
    expect(looksRead('[판독 불가]', 'end_turn')).toBe(false);
    expect(looksRead('제1조', 'end_turn')).toBe(false);
  });
});
