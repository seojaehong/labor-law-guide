import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ create: vi.fn(), limit: vi.fn(), finish: vi.fn() }));
vi.mock('@/lib/observations/service-completion', () => ({ startServiceObservation: () => ({ finish: m.finish }) }));
vi.mock('@/lib/rate-limit', () => ({ incrRateLimit: m.limit, extractIp: () => '203.0.113.9', hashIp: () => 'h' }));
vi.mock('@/lib/turnstile', () => ({ isTurnstileEnabled: () => false }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: m.create }; } }));

import { POST } from '@/app/api/tools/rules-review/ocr/route';
import { looksRead } from '@/lib/rules-review/ocr-check';

const PAGE = '직원 복무 규정\n제1조(목적) 이 규정은 직원의 복무에 관한 사항을 정함을 목적으로 한다.\n제2조(근무시간) ① 근무시간은 09:00부터 18:00까지로 한다.';
const reply = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });
const req = (type = 'image/jpeg', bytes = 2000) => {
  const form = new FormData();
  form.append('image', new File([new Uint8Array(bytes)], 'p1.jpg', { type }));
  return new Request('http://localhost/api/tools/rules-review/ocr', { method: 'POST', body: form });
};

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ANTHROPIC_API_KEY', 'offline-placeholder'); m.limit.mockResolvedValue({ allowed: true }); });
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

  it('둘 다 못 읽으면 422', async () => {
    m.create.mockResolvedValue(reply('[판독 불가]'));
    const res = await POST(req());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('unreadable');
  });

  it('키가 없으면 501, 이미지가 아니면 400, 한도를 넘으면 429 — 모델을 부르지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
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
