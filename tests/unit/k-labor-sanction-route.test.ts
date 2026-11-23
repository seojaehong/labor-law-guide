import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// DB 는 부르지 않는다 — 조회 함수를 합성 행으로 바꿔 끼운다.
const rows = [{
  id: 'harass:서울행정법원|2099구합1', court: '서울행정법원', case_number: '2099구합1', decided_on: '2099-01-09', type: 'harass',
  disposition: '정직 3월', reason: '일부 인정', sanction: '적정', kind: '폭언·폭행', quote: '합성 발췌 문장이다.', quote_fits: true,
  evidence: '합성 근거 문장이다.', generated_note: '합성 메모',
}];
const fetchSanctionCases = vi.fn(async (q: unknown) => (q ? rows : []));
vi.mock('@/lib/sanction-cases', () => ({ fetchSanctionCases }));

const route = await import('@/app/api/mcp/[transport]/route');
const sanctionApi = await import('@/app/api/sanction-cases/route');

const URL_ = 'https://example.test/api/mcp/mcp';
const HEAD = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const TOKEN = 'synthetic-token-0123456789abcdef';
async function rpc(body: object, auth?: string, ip = '198.51.100.7') {
  const headers: Record<string, string> = { ...HEAD, 'cf-connecting-ip': ip };
  if (auth) headers.authorization = auth;
  const res = await route.POST(new Request(URL_, { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const names = (j: { result: { tools: { name: string }[] } }) => j.result.tools.map((t) => t.name);

beforeEach(() => { vi.stubEnv('K_LABOR_REMOTE_ENABLED', 'true'); vi.stubEnv('SANCTION_API_TOKEN', TOKEN); fetchSanctionCases.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('양정 사례 도구 — 우리만(토큰)', () => {
  it('토큰이 없으면 도구 목록에 없다', async () => {
    const { json } = await rpc(list, undefined, '198.51.100.1');
    expect(names(json)).not.toContain('search_sanction_cases');
  });

  it('토큰이 틀리면 도구 목록에 없다', async () => {
    const { json } = await rpc(list, 'Bearer wrong-token', '198.51.100.2');
    expect(names(json)).not.toContain('search_sanction_cases');
  });

  it('서버에 토큰이 설정돼 있지 않으면 어떤 값을 보내도 없다', async () => {
    vi.stubEnv('SANCTION_API_TOKEN', '');
    const { json } = await rpc(list, 'Bearer ', '198.51.100.3');
    expect(names(json)).not.toContain('search_sanction_cases');
  });

  it('토큰이 맞으면 도구가 있고, 부르면 의견서 블록을 돌려준다', async () => {
    const auth = `Bearer ${TOKEN}`;
    const { json } = await rpc(list, auth, '198.51.100.4');
    expect(names(json)).toContain('search_sanction_cases');
    const call = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_sanction_cases', arguments: { type: 'harass', format: 'block' } } }, auth, '198.51.100.4');
    const text = call.json.result.content[0].text as string;
    expect(text).toContain('[관련 판결] 서울행정법원 2099. 1. 9. 선고 2099구합1 판결(정직 3월)\n합성 발췌 문장이다.');
    expect(fetchSanctionCases).toHaveBeenCalledWith(expect.objectContaining({ type: 'harass' }));
  });
});

describe('/api/sanction-cases', () => {
  const get = (q: string, auth?: string) =>
    sanctionApi.GET(new Request(`https://example.test/api/sanction-cases?${q}`, { headers: auth ? { authorization: auth } : {} }));

  it('토큰 없거나 틀리면 401, DB 를 부르지 않는다', async () => {
    expect((await get('type=harass')).status).toBe(401);
    expect((await get('type=harass', 'Bearer nope')).status).toBe(401);
    expect(fetchSanctionCases).not.toHaveBeenCalled();
  });

  it('토큰이 맞으면 행을 준다', async () => {
    const res = await get('type=harass&sanction=적정', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toHaveLength(1);
    expect(fetchSanctionCases).toHaveBeenCalledWith(expect.objectContaining({ type: 'harass', sanction: '적정' }));
  });

  it('offset 으로 다음 묶음을 받는다(골라 내려받기 화면 「더 불러오기」, 261123) — 음수·글자는 0', async () => {
    await get('type=harass&offset=30&limit=30', `Bearer ${TOKEN}`);
    expect(fetchSanctionCases).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 30, limit: 30 }));
    await get('type=harass&offset=-5', `Bearer ${TOKEN}`);
    expect(fetchSanctionCases).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
    await get('type=harass&offset=abc', `Bearer ${TOKEN}`);
    expect(fetchSanctionCases).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it('모르는 유형은 400', async () => {
    expect((await get('type=nope', `Bearer ${TOKEN}`)).status).toBe(400);
  });
});
