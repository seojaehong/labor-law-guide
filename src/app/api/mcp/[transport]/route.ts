// 원격 k-labor: /api/mcp/mcp. stdio와 달리 입력은 서버로 전송된다.
// 개인정보 처리 고지·실제 리전·남용 방지·호스트 검증 후에만 명시적으로 활성화한다.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerRemote } from '../../../../../tools/k-labor/remote.mjs';
import pkg from '../../../../../tools/k-labor/package.json';
import { MAX_MCP_BODY_BYTES, MAX_MCP_TOOL_ELEMENTS, mcpError, readMcpJson } from '@/lib/mcp/request-boundary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 선호 리전일 뿐 보장이 아니다. 실제 리전은 배포 후 응답/플랫폼 설정으로 확인한다.
export const preferredRegion = 'icn1';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (new URL(request.url).pathname !== '/api/mcp/mcp') {
    return mcpError(404, -32000, 'Not found');
  }
  if (process.env.K_LABOR_REMOTE_ENABLED !== 'true') {
    return mcpError(503, -32000, 'Remote MCP is not enabled');
  }
  const parsed = await readMcpJson(request);
  if (parsed.response) return parsed.response;

  // 요청마다 분리한다. SDK의 입력 요소 상한은 기본값이 무제한이므로 반드시 지정한다.
  const server = new McpServer(
    { name: 'k-labor', version: pkg.version },
    {
      maxToolInputElements: MAX_MCP_TOOL_ELEMENTS,
      instructions: '원격 계산 도구입니다. 입력은 서버로 전송됩니다. 이름, 주소, 연락처, 주민등록번호 등 식별정보를 입력하지 마세요. 실제 개인정보를 쓰기 전에 서비스의 처리방침과 처리 지역을 확인하세요.',
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // parsedBody 경로에서는 SDK의 바이트 검사가 생략되므로 위 readMcpJson이 먼저 검사한다.
    maxRequestBodySize: MAX_MCP_BODY_BYTES,
  });
  try {
    registerRemote(server);
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: parsed.data });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch {
    return mcpError(500, -32603, 'Internal error');
  } finally {
    // JSON 응답만 사용하므로 응답 완료 뒤 SSE/세션을 남기지 않는다.
    await server.close();
  }
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: 'POST', 'cache-control': 'no-store' } });
}

export { methodNotAllowed as GET, methodNotAllowed as DELETE };
