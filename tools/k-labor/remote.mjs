// 원격(HTTP)판 도구 등록 — 각 묶음의 *RemoteSafe 이름만 통과시킨다. stdio 판(server.mjs)은 이 파일을 쓰지 않는다.
// ★ nhis(주민번호 명단)·popbill(발송)·work-rules(법제처, icn1 실측 전)는 불러오지도 않는다 — 홈 폴더 .env 를 읽는 모듈이 섞이지 않게.
// ★ contract는 이름·사업장·주소·임의 계약 객체를 받는다. 원격 개인정보 정책/전용 schema 준비 전까지 제외한다.
// ★ HTTP 라우트는 요청마다 McpServer 를 새로 만든다. 등록 함수에 파일·네트워크 I/O 를 넣지 않는다.
import { registerCalc, calcRemoteSafe } from './groups/calc.mjs';
import { registerLeave, leaveRemoteSafe } from './groups/leave.mjs';
import { registerTax, taxRemoteSafe } from './groups/tax.mjs';
import { registerDuties, dutiesRemoteSafe } from './groups/duties.mjs';

const GROUPS = [
  [registerCalc, calcRemoteSafe],
  [registerLeave, leaveRemoteSafe],
  [registerTax, taxRemoteSafe],
  [registerDuties, dutiesRemoteSafe],
];

export const REMOTE_TOOLS = GROUPS.flatMap(([, names]) => names);

// 허용 이름만 넘기는 얇은 대리 서버. 옛 server.tool() 은 title·annotations 가 없어 디렉터리 요건을 못 넘으므로 막는다.
function only(server, allowed) {
  return {
    registerTool(name, ...rest) {
      if (allowed.includes(name)) return server.registerTool(name, ...rest);
    },
    tool(name) {
      throw new Error(`원격판은 server.tool() 을 받지 않습니다(title·annotations 없음): ${name}`);
    },
  };
}

export function registerRemote(server) {
  for (const [register, names] of GROUPS) register(only(server, names));
}
