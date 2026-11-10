import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as route from '@/app/api/mcp/[transport]/route';
import { MAX_MCP_BODY_BYTES, MAX_MCP_JSON_ELEMENTS, MAX_MCP_TOOL_ELEMENTS, MCP_RATE_LIMIT_PER_MINUTE } from '@/lib/mcp/request-boundary';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';

// 서버/SDK까지 로컬 메모리에서 실행한다. 네트워크·개인정보·실제 호스트 설정은 쓰지 않는다.
const URL_ = 'https://example.test/api/mcp/mcp';
const HEAD = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
function req(body: string, headers: HeadersInit = HEAD) {
  return new Request(URL_, { method: 'POST', headers, body });
}
async function rpc(body: object) {
  const res = await route.POST(req(JSON.stringify(body)));
  return { status: res.status, headers: res.headers, json: await res.json() };
}
function call(name: string, args: object, id = 2) {
  return rpc({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
}

beforeEach(() => { vi.stubEnv('K_LABOR_REMOTE_ENABLED', 'true'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('원격 k-labor 라우트', () => {
  it('선호 리전·동적 Node 실행을 선언한다(실제 리전을 입증하는 시험은 아님)', () => {
    expect(route.preferredRegion).toBe('icn1');
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.runtime).toBe('nodejs');
  });

  it('K_LABOR_REMOTE_ENABLED=false 이면 닫힌다', async () => {
    vi.stubEnv('K_LABOR_REMOTE_ENABLED', 'false');
    expect((await rpc(list)).status).toBe(503);
  });

  it.each([undefined, '', '1'])('별도 설정이 없으면 열려 있다: %s', async (value) => {
    vi.stubEnv('K_LABOR_REMOTE_ENABLED', value);
    expect((await rpc(list)).status).toBe(200);
  });

  it('같은 IP 가 분당 한도를 넘으면 429, 다른 IP 는 영향이 없다', async () => {
    const send = (ip: string) => route.POST(req(JSON.stringify(list), { ...HEAD, 'cf-connecting-ip': ip }));
    for (let i = 0; i < MCP_RATE_LIMIT_PER_MINUTE; i++) expect((await send('203.0.113.9')).status).toBe(200);
    const over = await send('203.0.113.9');
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBeTruthy();
    expect((await send('203.0.113.10')).status).toBe(200);
  });

  it('initialize에 원격 입력 전송 고지와 도구 기능이 있다', async () => {
    const { status, json, headers } = await rpc({
      jsonrpc: '2.0', id: 0, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'synthetic-unit-test', version: '1' } },
    });
    expect(status).toBe(200);
    expect(json.result.serverInfo.name).toBe('k-labor');
    expect(json.result.capabilities.tools).toBeDefined();
    expect(json.result.instructions).toContain('서버로 전송');
    expect(headers.get('mcp-session-id')).toBeNull();
  });

  it('tools/list는 계약 도구를 포함한 24개를 공개하며 응답을 캐시하지 않는다', async () => {
    const { status, json, headers } = await rpc(list);
    expect(status).toBe(200);
    const names = json.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([...REMOTE_TOOLS].sort());
    expect(names).toHaveLength(24);
    expect(headers.get('content-type')).toContain('application/json');
    expect(headers.get('cache-control')).toBe('no-store');
  });

  it('주휴수당의 정확한 계산값과 요청 ID를 보존한다', async () => {
    const { status, json } = await call('calc_weekly_holiday_pay', { hourlyWage: 10320, weeklyHours: 40 });
    expect(status).toBe(200);
    expect(json.id).toBe(2);
    expect(json.result.isError).not.toBe(true);
    expect(json.result.content[0].text).toContain('82,560');
  });

  it('노사협의회 확인 도구가 원격판에서 신고 기한을 낸다(숫자·날짜만 받는다)', async () => {
    const { status, json } = await call('assess_labor_council', { headcount: 45, installDate: '2026-11-20', today: '2026-11-10' });
    expect(status).toBe(200);
    expect(json.result.isError).not.toBe(true);
    const r = JSON.parse(json.result.content[0].text);
    expect(r.installation.result).toBe('설치 의무 있음');
    expect(r.deadlines.report.due).toBe('2026-12-05');
  });

  it('잘못된 도구 입력은 구조화된 오류를 낸다', async () => {
    const { status, json } = await call('calc_weekly_holiday_pay', { hourlyWage: 'invalid', weeklyHours: 40 });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('hourlyWage');
  });

  it.each(['make_form', 'send_fax'])('%s 호출을 허용하지 않는다', async (name) => {
    const { json } = await call(name, {});
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/not found/i);
  });

  it.each(['{', '', '"unfinished'])('깨진/빈 JSON은 즉시 parse error 응답: %s', async (body) => {
    const res = await route.POST(req(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it.each(['[]', '[{}]', 'null', '1', '"text"'])('배치·비객체 입력을 거부한다: %s', async (body) => {
    const res = await route.POST(req(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });

  it('JSON media type이 아니면 415로 거부한다', async () => {
    const res = await route.POST(req('{}', { ...HEAD, 'content-type': 'text/plain' }));
    expect(res.status).toBe(415);
  });

  it('본문 크기를 Content-Length 없이도 제한한다', async () => {
    const res = await route.POST(req(' '.repeat(MAX_MCP_BODY_BYTES + 1)));
    expect(res.status).toBe(413);
  });

  it('선언된 초과 크기는 본문 파싱 전 거부한다', async () => {
    const res = await route.POST(req('{', { ...HEAD, 'content-length': String(MAX_MCP_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
  });

  it('깊은 JSON은 SDK 이전에 거부한다', async () => {
    const body = '{"x":'.repeat(40) + '0' + '}'.repeat(40);
    const res = await route.POST(req(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('too complex');
  });

  it('본문 상한보다 작은 넓은 객체도 요소 수로 제한한다', async () => {
    const res = await route.POST(req(JSON.stringify({ x: Array(MAX_MCP_JSON_ELEMENTS + 1).fill(0) })));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('too complex');
  });

  it('SDK 자체의 tools/call 요소 제한도 활성화되어 있다', async () => {
    const { status, json } = await call('calc_weekly_holiday_pay', {
      hourlyWage: 10320, weeklyHours: 40, unused: Array(MAX_MCP_TOOL_ELEMENTS).fill(0),
    });
    expect(status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toMatch(/elements|1000/);
  });

  it('동시 요청 결과와 ID를 섞지 않는다', async () => {
    const results = await Promise.all([10000, 20000, 30000].map((hourlyWage, i) =>
      call('calc_weekly_holiday_pay', { hourlyWage, weeklyHours: 40 }, 10 + i)));
    results.forEach(({ json }, i) => {
      expect(json.id).toBe(10 + i);
      expect(json.result.content[0].text).toContain(((i + 1) * 80000).toLocaleString('en-US'));
    });
  });

  it('알림은 빈 202로 응답한다', async () => {
    const res = await route.POST(req(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('SSE GET과 세션 DELETE는 제공하지 않는다', async () => {
    for (const handler of [route.GET, route.DELETE]) {
      const res = handler();
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('다른 transport 경로로 도구를 공개하지 않는다', async () => {
    const res = await route.POST(new Request('https://example.test/api/mcp/unknown', { method: 'POST', headers: HEAD, body: JSON.stringify(list) }));
    expect(res.status).toBe(404);
  });

  it('입력과 예외를 console에 남기지 않는다', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    await route.POST(req('{'));
    await call('calc_weekly_holiday_pay', { hourlyWage: 10320, weeklyHours: 40 });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('실제 SDK 클라이언트의 initialize → list → call 흐름이 JSON 전송과 호환된다', async () => {
    const client = new Client({ name: 'synthetic-client', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(URL_), {
      // 네트워크 대신 같은 프로세스의 라우트로 연결한다. Claude 호스트 실측은 아니다.
      fetch: async (input, init) => {
        const request = new Request(input, init);
        return request.method === 'POST' ? route.POST(request) : route.GET();
      },
    });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(24);
      const result = await client.callTool({ name: 'calc_weekly_holiday_pay', arguments: { hourlyWage: 10320, weeklyHours: 40 } });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain('82,560');
    } finally {
      await client.close();
    }
  });
});
