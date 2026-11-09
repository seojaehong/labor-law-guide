// 공개 HTTP 요청은 SDK/schema 검증 전에 바이트·중첩·요소 수를 제한한다.
export const MAX_MCP_BODY_BYTES = 64 * 1024;
export const MAX_MCP_JSON_DEPTH = 32;
export const MAX_MCP_JSON_ELEMENTS = 2000;
export const MAX_MCP_TOOL_ELEMENTS = 1000;

export const MCP_RATE_LIMIT_PER_MINUTE = 60;
const MCP_RATE_WINDOW_MS = 60_000;

/** 무인증 공개 끝점의 IP별 호출 한도. 함수 인스턴스별 메모리라 대략의 상한이다. */
export function createMcpIpLimiter() {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (ip: string, now = Date.now()): number | null => {
    for (const [key, w] of windows) if (now - w.startedAt >= MCP_RATE_WINDOW_MS) windows.delete(key);
    const current = windows.get(ip) ?? { startedAt: now, count: 0 };
    windows.set(ip, current);
    if (current.count >= MCP_RATE_LIMIT_PER_MINUTE) return Math.ceil((current.startedAt + MCP_RATE_WINDOW_MS - now) / 1000);
    current.count += 1;
    return null;
  };
}

export function mcpError(status: number, code: number, message: string) {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

// 재귀 호출 없이, 넓거나 깊은 입력이 SDK/Zod에 도달하기 전에 중단한다.
function withinJsonBudget(root: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let elements = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > MAX_MCP_JSON_DEPTH) return false;
    if (value === null || typeof value !== 'object') continue;
    for (const child of Object.values(value)) {
      if (++elements > MAX_MCP_JSON_ELEMENTS) return false;
      pending.push({ value: child, depth: depth + 1 });
    }
  }
  return true;
}

export async function readMcpJson(request: Request): Promise<
  { data: unknown; response?: never } | { response: Response; data?: never }
> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { response: mcpError(415, -32000, 'Content-Type must be application/json') };
  }
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_MCP_BODY_BYTES) {
    return { response: mcpError(413, -32000, 'Request body too large') };
  }

  const reader = request.body?.getReader();
  if (!reader) return { response: mcpError(400, -32700, 'Parse error') };
  const buffer = new Uint8Array(MAX_MCP_BODY_BYTES);
  let size = 0;
  let data: unknown;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MCP_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { response: mcpError(413, -32000, 'Request body too large') };
      }
      buffer.set(value, size - value.byteLength);
    }
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size)));
  } catch {
    // 예외/요청 본문을 로그 또는 응답에 넣지 않는다.
    return { response: mcpError(400, -32700, 'Parse error') };
  } finally {
    reader.releaseLock();
  }

  // 이 단일 요청/응답 서버는 JSON-RPC 배치를 지원하지 않는다.
  if (Array.isArray(data) || data === null || typeof data !== 'object') {
    return { response: mcpError(400, -32600, 'A single JSON-RPC object is required') };
  }
  if (!withinJsonBudget(data)) {
    return { response: mcpError(400, -32600, 'JSON input is too complex') };
  }
  return { data };
}
