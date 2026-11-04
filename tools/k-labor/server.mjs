// 일의 무늬 도구 MCP — 사이트가 만드는 도구를 한 패키지에 묶는다. 도구는 묶음(group) 단위로 켠다.
//   npx -y k-labor mcp                    → 전 묶음
//   npx -y k-labor mcp --groups nhis      → 일부 묶음만 (환경변수 LLG_MCP_GROUPS=nhis,popbill 도 같다)
// 인자가 없으면 mcp 로 본다(node dist/server.mjs 로 등록한 경우).
// ★ 주민번호는 이 PC 안에서만 PDF 로 만들어진다. 도구 응답에는 싣지 않는다(lib/common.mjs 의 text 가 가린다).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerNhis, nhisTools } from './groups/nhis.mjs';
import { registerPopbill, popbillTools } from './groups/popbill.mjs';
import { registerContract, contractTools } from './groups/contract.mjs';
import { registerCalc, calcTools } from './groups/calc.mjs';
import { registerWorkRules, workRulesTools } from './groups/work-rules.mjs';
import { registerLeave, leaveTools } from './groups/leave.mjs';
import { registerTax, taxTools } from './groups/tax.mjs';
import { registerDuties, dutiesTools } from './groups/duties.mjs';

const VERSION = '0.1.1';

// 새 도구 묶음은 여기에 한 줄 더한다.
const GROUPS = {
  nhis: { register: registerNhis, tools: nhisTools, about: '건강보험 관할 지사 찾기 · 자격취득·상실 신고서 PDF' },
  popbill: { register: registerPopbill, tools: popbillTools, about: '내 팝빌 계정으로 팩스·문자 보내기 · 결과 조회' },
  contract: { register: registerContract, tools: contractTools, about: '근로계약서 임금 구성 설계 · 점검 · xlsx·hwpx·pdf 만들기(파일은 로컬 전용)' },
  calc: { register: registerCalc, tools: calcTools, about: '최저임금 · 주휴수당 · 상시 근로자 수 · 실수령액 · 해고예고수당 · 연차수당 · 퇴직금 · 공휴일 근로 수당 · 급여 일할 · 휴업수당 계산 · 통상임금 점검 · 임금 체불 지연이자 · 근로자성 점검 · 월급 대조' },
  leave: { register: registerLeave, tools: leaveTools, about: '연차 발생일수 · 퇴직 때 연차 재정산(입사일 기준 대 회계연도 기준) · 출근율(1년 80%)' },
  tax: { register: registerTax, tools: taxTools, about: '퇴직소득세 · 지방소득세 · 중도퇴사자 연말정산 · 일용근로자 원천세 계산' },
  duties: { register: registerDuties, tools: dutiesTools, about: '사업장 규모별 사업주 의무 · 의무교육 · 위반 시 제재(묶은 자료)' },
  'work-rules': { register: registerWorkRules, tools: workRulesTools, about: '노동법 개정 목록 · 법령 조문 원문·두 시점 비교(법제처 Open API, LAW_OC) · 취업규칙 개정 반영 점검(글자·파일) · 신고·변경신고 서류(파일은 로컬 전용)' },
};
const ALIAS = { fax: 'popbill', sms: 'popbill', rules: 'work-rules', 'work_rules': 'work-rules' };

function usage() {
  const lines = [
    `k-labor ${VERSION} — 노동 업무 도구 MCP — 일의 무늬 (stdio)`,
    '',
    '사용: k-labor mcp [--groups 묶음,묶음]',
    '      환경변수 LLG_MCP_GROUPS=묶음,묶음 도 됩니다(--groups 가 우선).',
    '',
    '묶음:',
    ...Object.entries(GROUPS).map(([k, g]) => `  ${k.padEnd(10)} ${g.about}\n             도구: ${g.tools.join(', ')}`),
  ];
  return lines.join('\n');
}

const argv = process.argv.slice(2);
let cmd = 'mcp';
let groupsArg = process.env.LLG_MCP_GROUPS || '';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--groups') groupsArg = argv[++i] || '';
  else if (a.startsWith('--groups=')) groupsArg = a.slice('--groups='.length);
  else if (a === '-h' || a === '--help' || a === 'help') cmd = 'help';
  else if (a === '-v' || a === '--version') cmd = 'version';
  else if (a === 'mcp') cmd = 'mcp';
  else { console.error(`알 수 없는 인자: ${a}\n\n${usage()}`); process.exit(2); }
}
if (cmd === 'help') { console.log(usage()); process.exit(0); }
if (cmd === 'version') { console.log(VERSION); process.exit(0); }

const wanted = groupsArg.trim()
  ? [...new Set(groupsArg.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).map((s) => ALIAS[s] || s))]
  : Object.keys(GROUPS);
const unknown = wanted.filter((g) => !GROUPS[g]);
if (unknown.length) {
  console.error(`알 수 없는 묶음: ${unknown.join(', ')} (있는 묶음: ${Object.keys(GROUPS).join(', ')})`);
  process.exit(2);
}

const server = new McpServer({ name: 'k-labor', version: VERSION });
for (const g of wanted) GROUPS[g].register(server);
await server.connect(new StdioServerTransport());
console.error(`k-labor ready — 묶음: ${wanted.join(', ')}`);
