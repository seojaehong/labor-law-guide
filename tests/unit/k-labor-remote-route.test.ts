import { describe, expect, it } from 'vitest';
import * as route from '@/app/api/mcp/[transport]/route';
import { REMOTE_TOOLS } from '../../tools/k-labor/remote.mjs';

// 원격 k-labor = yellowenvelope.kr/api/mcp/mcp (streamable HTTP, 무인증 — 공개 계산·점검 도구만).
// 서울 리전에서 돈다(사이트 기본 리전은 sin1).
const URL_ = 'https://yellowenvelope.kr/api/mcp/mcp';
const HEAD = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function rpc(body: object) {
  const res = await route.POST(new Request(URL_, { method: 'POST', headers: HEAD, body: JSON.stringify(body) }));
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return { status: res.status, json: JSON.parse(line ? line.slice(6) : text) };
}

describe('원격 k-labor 라우트', () => {
  it('서울 리전·동적 실행', () => {
    expect(route.preferredRegion).toBe('icn1');
    expect(route.dynamic).toBe('force-dynamic');
  });

  it('토큰 없이 tools/list 가 원격 목록 23개만 낸다', async () => {
    const { status, json } = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(200);
    const names = json.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([...REMOTE_TOOLS].sort());
  });

  it('토큰 없이 tools/call 이 계산 결과를 낸다', async () => {
    const { status, json } = await rpc({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'calc_weekly_holiday_pay', arguments: { hourlyWage: 10320, weeklyHours: 40 } },
    });
    expect(status).toBe(200);
    expect(json.result.isError).not.toBe(true);
    expect(json.result.content[0].text).toMatch(/\d/);
  });
});
