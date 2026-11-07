// 원격 k-labor MCP — https://yellowenvelope.kr/api/mcp/mcp (streamable HTTP).
// 무인증이다: 개인정보 입력칸이 없고 파일을 읽거나 쓰지 않는 공개 계산·점검 도구만 싣는다(tools/k-labor/remote.mjs).
// Claude 커넥터 디렉터리는 공개 데이터 커넥터를 인증 없이 받는다(docs/superpowers/plans/2026-11-04-k-labor-remote-connector.md F1·F2).
import { createMcpHandler } from 'mcp-handler';
import { registerRemote } from '../../../../../tools/k-labor/remote.mjs';
import pkg from '../../../../../tools/k-labor/package.json';

export const dynamic = 'force-dynamic';
// 사이트 기본 리전은 sin1. 서울을 원하지만 Hobby 플랜은 함수 리전이 하나뿐이라 이 값이 무시된다
// (261105 미리보기 실측 x-vercel-id = icn1::sin1). 지금 싣는 도구는 개인정보·법제처 호출이 없어 sin1 로 둔다.
// work-rules(법제처)를 넣기 전에 Pro 전환·별도 프로젝트 중 하나를 고른다.
export const preferredRegion = 'icn1';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => registerRemote(server),
  { serverInfo: { name: 'k-labor', version: pkg.version } },
  { basePath: '/api/mcp', disableSse: true, maxDuration: 60 },
);

export { handler as GET, handler as POST, handler as DELETE };
