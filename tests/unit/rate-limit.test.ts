import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { rpc: m.rpc } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc } }));

import { incrRateLimit } from '@/lib/rate-limit';

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('incrRateLimit — 카운터 장애 표시', () => {
  it('정상 응답은 failed 표시가 없다', async () => {
    m.rpc.mockResolvedValue({ data: { allowed: true, count: 1, max: 5, remaining: 4 }, error: null });
    const r = await incrRateLimit('ip', 'k', 5);
    expect(r.allowed).toBe(true);
    expect(r.failed).toBeUndefined();
  });

  it.each([
    ['RPC 오류', () => m.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })],
    ['모양이 다름', () => m.rpc.mockResolvedValue({ data: [{}], error: null })],
    ['예외', () => m.rpc.mockRejectedValue(new Error('net'))],
  ])('%s — 기존 호출부를 위해 allowed 는 그대로 true, failed 로 장애를 알린다', async (_, arrange) => {
    arrange();
    const r = await incrRateLimit('global', 'k', 5);
    expect(r).toMatchObject({ allowed: true, failed: true });
  });
});
