import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { rpc } }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
const body = { startDate: '2020-01-01', endDate: '2026-10-05', serviceDays: 2470, avgWage: 123456, ordinaryWage: 100000, severance: 987654, pensionType: 'db' };
const request = (data: unknown = body) => new NextRequest('http://fixture.test/api/tools/severance-context', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: JSON.stringify(data) });
describe('severance context external-call boundaries (all mocked; no legal quality assertion)', () => {
  beforeEach(() => { vi.resetModules(); rpc.mockReset().mockResolvedValue({ data: [], error: null }); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('does not make external/DB calls without an embedding key', async () => {
    vi.stubEnv('OPENAI_API_KEY', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { POST } = await import('@/app/api/tools/severance-context/route'); const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(fetch).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it('sends only a generic query and caches it despite different amounts/dates', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-sent'); const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }))); vi.stubGlobal('fetch', fetch);
    const { POST } = await import('@/app/api/tools/severance-context/route'); await POST(request()); await POST(request({ ...body, startDate: '2019-05-01', avgWage: 444444, severance: 777777 }));
    expect(fetch).toHaveBeenCalledTimes(1); const sent = JSON.parse(fetch.mock.calls[0][1].body); expect(sent.input).toBeTypeOf('string'); for (const value of ['2020-01-01', '2019-05-01', '123456', '987654', '444444', '777777']) expect(sent.input).not.toContain(value);
    expect(rpc).toHaveBeenCalledTimes(4);
  });
  it('skips embedding and DB searches after the in-instance limit', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'mock-key-never-sent'); const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }))); vi.stubGlobal('fetch', fetch);
    const { POST } = await import('@/app/api/tools/severance-context/route'); for (let i = 0; i < 30; i++) await POST(request()); const before = rpc.mock.calls.length; const response = await POST(request({ ...body, pensionType: 'dc' }));
    expect((await response.json()).limited).toBe(true); expect(rpc.mock.calls.length).toBe(before); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid JSON before any external call', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const { POST } = await import('@/app/api/tools/severance-context/route'); const response = await POST(new NextRequest('http://fixture.test/api/tools/severance-context', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
});
