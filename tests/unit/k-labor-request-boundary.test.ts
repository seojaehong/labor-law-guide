import { describe, expect, it, vi } from 'vitest';
import { MAX_MCP_BODY_BYTES, MAX_MCP_JSON_ELEMENTS, readMcpJson } from '@/lib/mcp/request-boundary';

const url = 'https://example.test/api/mcp/mcp';
const headers = { 'content-type': 'application/json' };
const request = (body?: BodyInit) => new Request(url, { method: 'POST', headers, body });

describe('MCP 파싱 전 요청 경계', () => {
  it('정확히 바이트 상한인 JSON은 허용한다', async () => {
    const body = JSON.stringify({ x: 'a'.repeat(MAX_MCP_BODY_BYTES - 8) });
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_MCP_BODY_BYTES);
    const result = await readMcpJson(request(body));
    expect(result.response).toBeUndefined();
    expect(result.data).toEqual(JSON.parse(body));
  });

  it('글자 수가 아니라 UTF-8 바이트 수로 제한한다', async () => {
    const body = JSON.stringify({ x: '가'.repeat(Math.ceil(MAX_MCP_BODY_BYTES / 3)) });
    expect(body.length).toBeLessThan(MAX_MCP_BODY_BYTES);
    expect((await readMcpJson(request(body))).response?.status).toBe(413);
  });

  it('분할 스트림은 누적 바이트로 제한하고 남은 스트림을 취소한다', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MCP_BODY_BYTES / 2).fill(32));
        controller.enqueue(new Uint8Array(MAX_MCP_BODY_BYTES / 2 + 1).fill(32));
        // 닫지 않는다. 경계에서 취소해야 더 읽지 않고 반환된다.
      },
      cancel,
    });
    const req = new Request(url, {
      method: 'POST', headers: { ...headers, 'content-length': '1' }, body: stream, duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect((await readMcpJson(req)).response?.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('잘못된 UTF-8은 대체 문자로 묵인하지 않고 parse error를 낸다', async () => {
    const result = await readMcpJson(request(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125])));
    expect(result.response?.status).toBe(400);
    expect((await result.response!.json()).error.code).toBe(-32700);
  });

  it('본문이 없는 POST는 parse error를 낸다', async () => {
    const result = await readMcpJson(request());
    expect(result.response?.status).toBe(400);
    expect((await result.response!.json()).error.code).toBe(-32700);
  });

  it('스트림 읽기 실패도 내용이 없는 일반 오류로 반환한다', async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('synthetic private marker')); } });
    const req = new Request(url, { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
    const result = await readMcpJson(req);
    expect(result.response?.status).toBe(400);
    expect(await result.response!.text()).not.toContain('synthetic private marker');
    expect(stream.locked).toBe(false);
  });

  it('객체 멤버와 배열 원소를 합산해 경계에서 거부한다', async () => {
    const atLimit = { x: Array(MAX_MCP_JSON_ELEMENTS - 1).fill(0) };
    expect((await readMcpJson(request(JSON.stringify(atLimit)))).response).toBeUndefined();
    expect((await readMcpJson(request(JSON.stringify({ ...atLimit, extra: 0 })))).response?.status).toBe(400);
  });

  it('charset이 있는 JSON도 허용한다', async () => {
    const req = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{}' });
    expect((await readMcpJson(req)).data).toEqual({});
  });
});
