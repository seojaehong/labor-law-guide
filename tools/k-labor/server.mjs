// 일의 무늬 도구 MCP — 사이트가 만드는 도구를 한 패키지에 묶는다. 도구는 묶음(group) 단위로 켠다.
//   npx -y k-labor mcp                    → 전 묶음
//   npx -y k-labor mcp --groups nhis      → 일부 묶음만 (환경변수 LLG_MCP_GROUPS=nhis,popbill 도 같다)
// 인자가 없으면 mcp 로 본다(node dist/server.mjs 로 등록한 경우).
// ★ 주민번호는 이 PC 안에서만 PDF 로 만들어진다. 도구 응답에는 싣지 않는다(lib/common.mjs 의 text 가 가린다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { registerNosa, nosaTools } from './groups/nosa.mjs';
import { registerNosaRecords, nosaRecordsTools } from './groups/nosa-records.mjs';
import { registerDocs, docsTools } from './groups/docs.mjs';
import { registerForms, formsTools } from './groups/forms.mjs';
import { registerLaw, lawTools } from './groups/law.mjs';

const VERSION = '0.2.2';

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
  // 기록 묶음(nosa-records)은 원격판에 싣지 않는다 — stdio 판의 nosa 묶음으로만 켠다
  nosa: { register: (s) => { registerNosa(s); registerNosaRecords(s); }, tools: [...nosaTools, ...nosaRecordsTools], about: '노사협의회 설치의무 · 근로자위원 선출방식 · 선출·회의 정족수 · 소집·신고·고충 기한 · 일정 역산 · 회의 확인(통보 기한·정기회의 3개월·안건별 의결·보고사항·공지 기한) · 협의회규정 견본과 설치·신고 서류 · 회의 서류(소집 통보서·회의자료·회의록·의결사항 공지) · 근로자위원 선거 서류 · 회의록 보관함(이행·회의록 이력, 옵시디언 보관함·회의록 대장, 옛 회의록 가져오기) · 협의회규정 신·구조문대비표' },
  // 문서 묶음(docs)도 파일을 쓰므로 원격판에 싣지 않는다
  forms: { register: registerForms, tools: formsTools, about: '모성보호·일가정 양립 서식 7종(법정 서식 출산전후휴가ㆍ육아휴직 통합 신청서, 육아휴직·단기 육아휴직·배우자 출산전후휴가·난임치료휴가 신청서, 육아휴직 허용·단기 육아휴직 시기변경 통지서) 칸 검사·한글(hwpx) 파일(파일은 로컬 전용)' },
  docs: { register: registerDocs, tools: docsTools, about: '마크다운 원고 → 한글(hwpx) 파일(프리셋 internal·tribunal, 파일은 로컬 전용) · 퇴고 문체 점검(규칙 팩)' },
  // 법령 조회 묶음(law)은 원격판에 싣지 않는다 — 법제처가 등록 IP·이용자별 OC 로만 받아, 서버 OC 관리 방식을 정하기 전까지 로컬 전용
  law: { register: registerLaw, tools: lawTools, about: '법제처 실시간(LAW_OC) — 법령 검색 · 별표·서식 목록과 파일 주소 · 조문 개정 연혁 · 판례 검색·본문 · 법령해석(고용노동부·법제처) 검색·본문' },
};
const ALIAS = { fax: 'popbill', sms: 'popbill', rules: 'work-rules', 'work_rules': 'work-rules', council: 'nosa', laws: 'law' };

function usage() {
  const lines = [
    `k-labor ${VERSION} — 노동 업무 도구 MCP — 일의 무늬 (stdio)`,
    '',
    '사용: k-labor mcp [--groups 묶음,묶음]',
    '      k-labor call <도구이름> <인자.json> [--groups 묶음]   (도구 하나를 셸에서 부른다, 결과 = stdout)',
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
let callTool = '';
let callArgsFile = '';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === 'call') { cmd = 'call'; callTool = argv[++i] || ''; callArgsFile = argv[++i] || ''; }
  else if (a === '--groups') groupsArg = argv[++i] || '';
  else if (a.startsWith('--groups=')) groupsArg = a.slice('--groups='.length);
  else if (a === '-h' || a === '--help' || a === 'help') cmd = 'help';
  else if (a === '-v' || a === '--version') cmd = 'version';
  else if (a === 'mcp') cmd = 'mcp';
  else { console.error(`알 수 없는 인자: ${a}\n\n${usage()}`); process.exit(2); }
}
if (cmd === 'help') { console.log(usage()); process.exit(0); }
// 첫 줄은 맨 버전 그대로(이 줄을 읽는 쪽이 있다). 묶은 판이면 옆의 build-info.json(build.mjs 가 쓴다)으로 어느 커밋·어느 파일인지 한 줄 더
if (cmd === 'version') {
  console.log(VERSION);
  try {
    const b = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-info.json'), 'utf8'));
    const commit = b.commit ? `${b.commit.slice(0, 12)}${b.dirty ? '+dirty' : ''}` : 'unknown';
    console.log(`commit ${commit} · server ${String(b.serverSha256 ?? '').slice(0, 12)} · built ${b.builtAt}`);
  } catch { /* 저장소에서 바로 돌리면 build-info 가 없다 */ }
  process.exit(0);
}

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

// call 모드 — 셸·스크립트에서 도구 하나를 부른다. MCP 와 같은 등록·입력 검사를 거치도록
// 메모리 안 통로로 서버에 붙어 tools/call 을 보낸다. 인자는 JSON 파일(한글 경로·역슬래시가 셸 따옴표에 깨지지 않게).
// 결과 = 도구 응답 글자를 그대로 stdout 에, 도구가 실패(isError)면 종료 코드 1.
if (cmd === 'call') {
  if (!callTool || !callArgsFile) { console.error(`사용: k-labor call <도구이름> <인자.json>\n\n${usage()}`); process.exit(2); }
  // 인자 파일에는 고객 자료가 들어 있을 수 있다. JSON 파서 오류문은 파일 내용 조각을 싣는다(「Unexpected token 'x', "…" is not valid JSON」)
  // → 오류문은 내보내지 않고 경로·종류·위치(숫자)만 알린다(261120 적대 검토)
  let raw;
  try {
    raw = fs.readFileSync(callArgsFile, 'utf8');
  } catch (e) {
    console.error(`인자 파일을 읽지 못했습니다: ${callArgsFile} (${e?.code || 'read error'})`);
    process.exit(2);
  }
  let args;
  try {
    args = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw); // 앞의 BOM 은 뗀다
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const pos = /\bposition (\d+)/.exec(msg)?.[1];
    const lc = /\bline (\d+) column (\d+)/.exec(msg);
    const where = pos ? ` 위치 ${pos}${lc ? `(${lc[1]}줄 ${lc[2]}칸)` : ''}` : '';
    console.error(`인자 파일이 JSON 형식이 아닙니다: ${callArgsFile} (${e?.name || 'SyntaxError'}${where})`);
    process.exit(2);
  }
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: 'k-labor-call', version: VERSION });
  await client.connect(ct);
  const r = await client.callTool({ name: callTool, arguments: args });
  const out = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  process.stdout.write(out + '\n');
  await client.close();
  // 도구가 { ok: false } 로 멈춘 것(덮어쓰기 거부·주민번호 멈춤 등)도 실패로 돌려준다
  let refused = false;
  try { refused = JSON.parse(out)?.ok === false; } catch { /* 글자 응답 */ }
  process.exit(r.isError || refused ? 1 : 0);
}

await server.connect(new StdioServerTransport());
console.error(`k-labor ready — 묶음: ${wanted.join(', ')}`);
