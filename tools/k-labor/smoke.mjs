// 스모크 시험 — 합성 값만 쓴다(주민번호는 체크섬 맞춘 가상값). 실제 전송은 하지 않는다(confirm 없음).
//   node smoke.mjs                         → ./dist/server.mjs
//   node smoke.mjs <server.mjs 경로|.cmd>   → 설치본 시험
// 결과는 묶어서 PASS/FAIL 로 낸다. 팝빌 응답(잔액·발신번호)은 화면에 찍지 않는다.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// work-rules 묶음 — 오늘을 고정하고(시행 예정 개수가 날짜에 따라 바뀌지 않게), 법제처 Open API 는 이 PC 안의 가짜 법제처로 돌린다.
// 가짜 법제처는 tests/fixtures/laws/drf 의 고정 응답(실응답을 줄인 것 + 합성 줄)을 준다. OC 가 다르면 법제처처럼 「사용자 정보 검증」 실패를 준다.
// 실제 법제처는 이 셸에 LAW_OC 가 있을 때만 끝에서 두 번 부른다(없으면 SKIP).
process.env.LLG_TODAY = '2026-10-21';
// 퇴고 — 이 PC 의 비공개 팩을 시험에 섞지 않는다(범용 팩만으로 돈다)
delete process.env.PROSE_PACK_DIR;
delete process.env.PROSE_ALLOW_FULL;
const REAL_OC = process.env.LAW_OC || null;
const MOCK_OC = 'synthetic-smoke-oc';
const drfFix = fileURLToPath(new URL('../../tests/fixtures/laws/drf/', import.meta.url));
const hasDrfFix = fs.existsSync(drfFix);
const DRF_LAW_FILES = { '285279-20261208': 'law-285279-20261208.json', '285279-20270101': 'law-285279-20270101.json', '900001-20270101': 'law-285279-20270101.json' };
const drfCalls = [];
const LAW_TARGETS = new Set(['law', 'licbyl', 'lsJoHstInf', 'prec', 'moelCgmExpc', 'expc']);
const mockDrf = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://mock');
  const p = Object.fromEntries(u.searchParams);
  drfCalls.push({ path: u.pathname, oc: p.OC === MOCK_OC, type: p.type, target: p.target, query: p.query, ancYd: p.ancYd, MST: p.MST, efYd: p.efYd });
  const json = (body) => { res.writeHead(200, { 'content-type': 'application/json;charset=UTF-8' }); res.end(body); };
  const file = (f) => {
    try {
      json(fs.readFileSync(path.join(drfFix, f)));
    } catch {
      res.writeHead(500);
      res.end();
    }
  };
  if (p.OC !== MOCK_OC) return file('auth-fail.json');
  // law 묶음 — 대상(target)별 고정 응답(tests/fixtures/laws/drf-open)
  const svc = u.pathname === '/DRF/lawService.do';
  const OPEN = {
    law: 'law-search.json', licbyl: 'licbyl-search.json', lsJoHstInf: 'johst-001872-006000.json',
    prec: svc ? (p.ID === '608505' ? 'prec-608505.json' : 'not-found.json') : 'prec-search.json',
    moelCgmExpc: svc ? 'moel-15234.json' : 'moel-search.json', expc: svc ? 'expc-325381.json' : 'expc-search.json',
  };
  if (OPEN[p.target]) return file(`../drf-open/${OPEN[p.target]}`);
  if (u.pathname === '/DRF/lawSearch.do') {
    if (p.ancYd) return file('search-recent.json');
    if ((p.query ?? '').includes('근로기준법')) return file('search-lsa.json');
    return json(JSON.stringify({ LawSearch: { totalCnt: '0', resultCode: '00' } }));
  }
  if (u.pathname === '/DRF/lawService.do' && DRF_LAW_FILES[`${p.MST}-${p.efYd}`]) return file(DRF_LAW_FILES[`${p.MST}-${p.efYd}`]);
  res.writeHead(200, { 'content-type': 'text/html;charset=UTF-8' });
  res.end('<!DOCTYPE html><html><body>법령 정보가 없습니다.</body></html>');
});
await new Promise((ok) => mockDrf.listen(0, '127.0.0.1', ok));
const MOCK_BASE = `http://127.0.0.1:${mockDrf.address().port}/DRF`;
const mockEnv = { ...process.env, LLG_DRF_BASE: MOCK_BASE, LAW_OC: MOCK_OC };

const target = process.argv[2] || fileURLToPath(new URL('./dist/server.mjs', import.meta.url));
const extra = process.argv.slice(3);
const spawn = (env, args = extra) => (/\.cmd$/i.test(target)
  ? new StdioClientTransport({ command: 'cmd', args: ['/c', target, 'mcp', ...args], env })
  : new StdioClientTransport({ command: process.execPath, args: [target, 'mcp', ...args], env }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-'));
const c = new Client({ name: 'smoke', version: '0' });
await c.connect(spawn(mockEnv));
const fails = [];
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };
const callJson = async (name, args, client = c) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content[0].text;
  check(`${name}: 응답에 가상 주민번호 없음`, !t.includes('9001011234568') && !t.includes('900101-1234568'));
  check(`${name}: 응답에 OC·요청 주소 없음`, !t.includes(MOCK_OC) && !t.includes(MOCK_BASE) && !/[?&]OC=/.test(t) && (!REAL_OC || !t.includes(REAL_OC)));
  return JSON.parse(t);
};

const tools = (await c.listTools()).tools.map((t) => t.name);
console.log('tools:', tools.join(', '));

if (tools.includes('find_branch')) {
  const fb = await callJson('find_branch', { address: '충북 청주시 상당구 상당로 155' });
  check(`find_branch ok (첫 후보: ${fb.branches?.[0]?.name})`, fb.ok && fb.branches?.length > 0);
}
let made = null;
if (tools.includes('make_form')) {
  const pf = path.join(tmp, 'people.json');
  fs.writeFileSync(pf, JSON.stringify([{ name: '홍길동', rrn: '9001011234568', lastWorkDay: '2026-05-31', nhisCode: '01', payCur: 12000000, monthsCur: 5 }]));
  made = await callJson('make_form', {
    kind: 'loss', peopleFile: pf, reason: '퇴사 처리 과정에서 상실 신고를 놓쳐 늦게 신고합니다.', branchName: '청주동부지사',
    biz: { mgmtNo: '12345678901', name: '가상사업장', addr: '충북 청주시 상당구 상당로 155', ownerName: '김대표', tel: '043-000-0000' },
    outPath: path.join(tmp, 'loss.pdf'),
  });
  const head = made.ok ? fs.readFileSync(made.outPath).subarray(0, 5).toString() : '';
  check(`make_form ok (${made.bytes} bytes, EDI 한도 안: ${made.withinEdiLimit})`, made.ok && head === '%PDF-');
  const other = path.join(tmp, 'keep.txt.pdf');
  fs.writeFileSync(other, 'KEEP');
  const refused = await callJson('make_form', {
    kind: 'loss', peopleFile: pf, reason: '퇴사 처리 과정에서 상실 신고를 놓쳐 늦게 신고합니다.',
    biz: { mgmtNo: '12345678901', name: '가상사업장', addr: '충북 청주시 상당구 상당로 155', ownerName: '김대표' },
    outPath: other,
  });
  check('make_form 있는 파일을 덮어쓰지 않음', refused.ok === false && fs.readFileSync(other, 'utf8') === 'KEEP');
}
if (tools.includes('popbill_status')) {
  const st = await callJson('popbill_status', {});
  console.log(`  popbill_status: ${st.ok === false ? `설정 없음 → missing=${st.missing?.join(',')}` : `연결됨(${st.env})`}`);
  const fx = await callJson('send_fax', { pdfPath: made?.outPath || path.join(tmp, 'none.pdf'), to: '043-000-0000', toName: '시험' });
  console.log(`  send_fax(미리보기): ${fx.preview ? '미리보기 반환, 전송 안 함' : `ok=${fx.ok} missing=${fx.missing?.join(',') || '-'} reason=${fx.reason || '-'}`}`);
  check('send_fax 는 confirm 없이 보내지 않음', !fx.receiptNum);
  const sm = await callJson('send_sms', { to: '010-0000-0000', text: '시험 문자', sender: '01000000000' });
  check('send_sms 는 confirm 없이 보내지 않음', !sm.receiptNum);
  const bad = await callJson('send_sms', { to: '010-0000-0000', text: '주민 900101-1234568', sender: '01000000000' });
  check('send_sms 는 본문 주민번호를 막음', bad.ok === false);
}

// ── contract·calc 묶음 ──
// 공개 문구 금지어 — 사이트 정본(src/lib/tool-kit/banned.ts)을 esbuild 로 읽어 와 「포괄」과 함께 본다. 설치본 시험처럼 저장소가 없으면 건너뛴다.
const bannedTs = fileURLToPath(new URL('../../src/lib/tool-kit/banned.ts', import.meta.url));
let banned = null;
if (fs.existsSync(bannedTs)) {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [bannedTs], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  banned = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const WORDS = banned ? [...banned.SERVICE_BANNED, ...banned.RESULT_BANNED, '포괄'] : [];
const bannedIn = (s) => (banned ? banned.bannedHits(s, WORDS) : []);
if (!banned) console.log('  (저장소 밖 — 금지어 시험 건너뜀)');
const callTool = async (name, args) => {
  const t = await callJson(name, args).then((j) => JSON.stringify(j));
  // terms:'legal'(check_contract)은 법률 용어 「포괄임금」을 그대로 내는 것이 목적 — 「포괄」만 빼고 나머지 금지어는 그대로 본다
  const h = args?.terms === 'legal' ? (banned ? banned.bannedHits(t, WORDS.filter((w) => w !== '포괄')) : []) : bannedIn(t);
  check(`${name}: 응답 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
  return JSON.parse(t);
};

// 사이트 도구 7개 — 도구마다 smoke-more/<이름>.mjs 가 엔진 단위 시험의 기대값으로 부른다(callNew·check)
const MORE_TOOLS = ['calc_midyear_settlement', 'calc_daily_worker_tax', 'check_ordinary_wage', 'calc_wage_delay_interest', 'calc_attendance_rate', 'check_contractor', 'check_monthly_pay'];
const ANN = {
  design_contract_wage: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  check_contract: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  make_contract_files: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  ...Object.fromEntries(['check_min_wage', 'calc_weekly_holiday_pay', 'count_regular_workers', 'calc_take_home_pay', 'calc_notice_pay', 'calc_leave_pay']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, openWorldHint: false }])),
  ...Object.fromEntries(['list_law_revisions', 'get_law_article', 'compare_law_versions', 'check_work_rules_revisions', 'check_work_rules_file']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }])),
  make_work_rules_report_forms: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  ...Object.fromEntries(['calc_severance', 'calc_holiday_pay', 'calc_pay_proration', 'calc_shutdown_allowance', 'calc_annual_leave', 'settle_leave_on_exit', 'calc_retirement_tax', 'list_employer_duties']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }])),
  ...Object.fromEntries(MORE_TOOLS.map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }])),
  // nhis·popbill — 지사 찾기·팝빌 조회는 바깥 API 를 읽기만, 신고서는 PDF 를 쓴다, 팩스·문자는 되돌릴 수 없는 발송
  ...Object.fromEntries(['find_branch', 'popbill_status', 'fax_result', 'sms_result']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }])),
  make_form: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  ...Object.fromEntries(['send_fax', 'send_sms'].map((n) => [n, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }])),
  // nosa — 확인은 읽기 전용(원격판에도 싣는다)
  assess_labor_council: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  check_council_meeting: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 서류는 이 PC 에 파일을 쓴다(로컬 전용). 같은 이름이 있으면 멈추므로 다시 불러도 결과가 같지 않다
  make_labor_council_forms: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  make_council_meeting_docs: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  make_council_election_docs: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // 협의회규정 본문 점검 — 읽기 전용이지만 본문에 이름이 있을 수 있어 로컬 전용
  check_council_rules: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 기록은 덧붙이기(같은 호출을 두 번 하면 두 줄), 보관함은 덮어쓰지 않으므로 다시 불러도 결과가 같지 않다
  record_council_history: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  export_council_vault: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  import_council_minutes: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  make_council_rules_comparison: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // md → hwpx 파일 쓰기(덮어쓰지 않으므로 다시 불러도 결과가 같지 않다)
  make_hwpx_from_markdown: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // 새 파일로 쓰고 원본·있는 파일은 건드리지 않는다
  edit_hwpx_text: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // 퇴고 문체 점검 — 읽기 전용, 문서 글을 밖으로 보내지 않는다
  check_prose: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 퇴고 공개 규범 점검(띄어쓰기·문장 부호·쉼표) — 읽기 전용
  check_norms: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 퇴고 의미범주·AI 수사 점검(비공개 팩) — 읽기 전용
  check_semantic: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  check_rhetoric: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 퇴고 윤문 전후 보존 대조 — 읽기 전용
  check_rewrite: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  // 호증 날인 — 새 PDF 를 쓴다(덮어쓰지 않음)
  stamp_exhibit_pdf: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // kordoc 한글 읽기·채우기·되쓰기 — 결과를 새 파일로 쓴다(덮어쓰지 않음)
  ...Object.fromEntries(['read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown']
    .map((n) => [n, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }])),
  // 서식 — 목록·검사는 읽기 전용(원격판에도), 파일 만들기는 로컬 전용
  list_hr_forms: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  check_hr_form: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  make_hr_form: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  // law 묶음 — 읽기 전용, 법제처(외부)를 부른다
  ...Object.fromEntries(['search_laws', 'list_law_forms', 'get_article_history', 'search_precedents', 'get_precedent', 'search_interpretations', 'get_interpretation', 'check_citations']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }])),
};
// 커넥터 디렉터리 심사 — 빠진 도구 없이 전부 title 과 네 칸이 있다
{
  const all = (await c.listTools()).tools;
  const bare = all.filter((t) => !t.title || !ANN[t.name] || ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'].some((k) => typeof t.annotations?.[k] !== 'boolean'));
  check(`모든 도구(${all.length})에 title·annotations 네 칸${bare.length ? ` — 빠짐: ${bare.map((t) => t.name).join(',')}` : ''}`, bare.length === 0);
}
// 이 판에서 더한 도구 8개 + 사이트 도구 7개(groups/more) — 「대신·대행·대리」도 함께 막는다
const NOSA_TOOLS = ['assess_labor_council', 'check_council_meeting', 'make_labor_council_forms', 'make_council_meeting_docs', 'make_council_election_docs', 'check_council_rules', 'record_council_history', 'export_council_vault', 'import_council_minutes', 'make_council_rules_comparison'];
const NEW_TOOLS = ['calc_severance', 'calc_holiday_pay', 'calc_pay_proration', 'calc_shutdown_allowance', 'calc_annual_leave', 'settle_leave_on_exit', 'calc_retirement_tax', 'list_employer_duties', ...MORE_TOOLS, ...NOSA_TOOLS, 'make_hwpx_from_markdown', 'edit_hwpx_text', 'read_hwp_as_markdown', 'fill_hwp_form', 'patch_hwp_from_markdown', 'check_prose', 'check_norms', 'check_semantic', 'check_rhetoric', 'check_rewrite', 'stamp_exhibit_pdf', 'list_hr_forms', 'check_hr_form', 'make_hr_form'];
const NEW_WORDS = [...WORDS, '대신', '대행', '대리'];
const bannedNew = (s) => (banned ? banned.bannedHits(s, NEW_WORDS) : []);
for (const n of NEW_TOOLS) check(`${n}: 도구 목록에 있음`, tools.includes(n));
for (const t of (await c.listTools()).tools.filter((x) => ANN[x.name])) {
  const a = t.annotations || {};
  const same = Object.entries(ANN[t.name]).every(([k, v]) => a[k] === v);
  console.log(`  ${t.name} | ${t.title} | ro=${a.readOnlyHint} destr=${a.destructiveHint} idem=${a.idempotentHint} open=${a.openWorldHint}`);
  check(`${t.name}: title·annotations`, !!t.title && same);
  const h = (NEW_TOOLS.includes(t.name) ? bannedNew : bannedIn)(`${t.title} ${t.description} ${JSON.stringify(t.inputSchema)}`);
  check(`${t.name}: 이름·설명·입력 설명 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
}

// 의정부 표본(합성) — 주4 월화수목 10:00~22:00 휴게 155분, 공휴일 22일, 월 260만원, 5명 이상.
// 기대값 = tests/unit/contract-write-design.test.ts 「의정부 주4」
const UIJ = { monthlyTotal: 2_600_000, workDays: ['월', '화', '수', '목'], start: '10:00', end: '22:00', breakMinutes: 155, holidayDaysPerYear: 22, fivePlus: true, startDate: '2026-11-01', writtenDate: '2026-11-01' };
const PAPER = { workplaceName: '가상상회', ownerName: '김대표', location: '경기 의정부시 가상로 1', duty: '매장 관리' };
if (tools.includes('design_contract_wage')) {
  const d = await callTool('design_contract_wage', UIJ);
  const amt = Object.fromEntries((d.items || []).map((i) => [i.key, i.amount]));
  const want = { base: 1_895_839, overtime: 419_652, holiday: 211_788, leave: 72_721 };
  check(`design 의정부 항목 금액 ${JSON.stringify(amt)}`, JSON.stringify(amt) === JSON.stringify(want));
  check(`design 의정부 통상시급 ${d.ordinaryHourly}(${d.ordinaryHourlyText})`, d.ordinaryHourly === 11_362.67 && d.ordinaryHourlyText === '11,362.67원');
  check(`design 의정부 합계 = 총액(${d.total})`, d.total === 2_600_000 && d.items.reduce((s, i) => s + i.amount, 0) === 2_600_000);
  check(`design 점검 되먹임(${d.review?.summary}) · 최저임금 한 줄(${d.minimumWage?.text})`, Array.isArray(d.review?.items) && typeof d.minimumWage?.text === 'string');
  check(`design 계약서 칸 빠짐 알림(${d.contractFieldsMissing})`, d.contractFieldsMissing?.join() === '사업체명,근무장소,업무');
  const full = await callTool('design_contract_wage', { ...UIJ, ...PAPER });
  check('design 계약서 칸을 넣으면 빠짐 알림 없음', full.ok && !full.contractFieldsMissing);
  const same = await callTool('design_contract_wage', { ...UIJ, start: '10:00', end: '10:00' });
  check(`design 입력 오류 — 출퇴근 같음(${same.error})`, same.ok === false && /같습니다/.test(same.error));
  const miss = await callTool('design_contract_wage', { ...UIJ, startDate: '' });
  check(`design 입력 오류 — 빈 칸(${miss.missing})`, miss.ok === false && miss.missing?.includes('계약 시작일'));
  const net = await callTool('design_contract_wage', { ...UIJ, monthlyTotal: undefined, netPay: 2_300_000, family: 1 });
  check(`design 실수령액 역산(${net.total} · ${net.netNote?.slice(0, 30)}…)`, net.ok && net.total > 2_300_000 && !!net.netNote);
  const part = await callTool('design_contract_wage', { payType: 'hourly', hourlyWage: 11_000, workDays: ['토', '일'], start: '10:00', end: '18:00', breakMinutes: 60, weeklyRestDay: '월', startDate: '2026-11-01' });
  check(`design 파트(하루 ${part.total}, 한 달 예상 ${part.monthlyEstimate})`, part.ok && part.total === 88_000 && part.period.startsWith('하루'));
}
if (tools.includes('make_contract_files')) {
  const outDir = path.join(tmp, 'contract');
  const mk = await callTool('make_contract_files', { ...UIJ, ...PAPER, outDir });
  const magic = Object.fromEntries((mk.files || []).map((f) => [f.format, fs.readFileSync(f.path).subarray(0, 4).toString('latin1')]));
  check(`make_contract_files 세 파일(${(mk.files || []).map((f) => `${f.format} ${f.bytes}B`).join(', ')})`,
    mk.ok && magic.xlsx?.startsWith('PK') && magic.hwpx?.startsWith('PK') && magic.pdf === '%PDF' && !mk.skipped);
  check(`make_contract_files 기본 이름(${path.basename(mk.files?.[0]?.path || '')})`, path.basename(mk.files?.[0]?.path || '') === '근로계약서_근로자.xlsx');
  const again = await callTool('make_contract_files', { ...UIJ, ...PAPER, outDir });
  check(`make_contract_files 덮어쓰지 않음(${again.exists?.length}개)`, again.ok === false && again.exists?.length === 3);
  const noPaper = await callTool('make_contract_files', { ...UIJ, outDir: path.join(tmp, 'contract2') });
  check(`make_contract_files 계약서 칸 없으면 만들지 않음(${noPaper.missing})`, noPaper.ok === false && noPaper.missing?.includes('사업체명') && !fs.existsSync(path.join(tmp, 'contract2')));
}
if (tools.includes('check_contract')) {
  // 합성 — 주 40시간 월 200만원(2026년 최저 2,156,880원보다 낮다)
  const contract = {
    contract_id: 'smoke-1',
    workplace: { name: '가상상회', employee_count_5plus: true },
    employee: { name: '근로자', hire_date: '2026-03-01', employment_type: 'regular' },
    period: { start_date: '2026-03-01', end_date: null, indefinite: true, probation: null },
    job: { location: '본점', duty: '판매' },
    work_time: { days_per_week: 5, start: '09:00', end: '18:00', breaks: [{ minutes: 60 }] },
    wage: { monthly_total: 2_000_000, pay_type: 'monthly', items: [{ code: 'BASE', label: '기본급', amount: 2_000_000, basis_hours: 209, includes_weekly_holiday: true }], payday: '매월 10일', payment_method: '계좌이체' },
    holidays_leave: { weekly_rest: '매주 일요일(유급)', weekly_rest_day_specified: true, annual_leave_clause: '근로기준법 제60조에 따라 부여한다.' },
    signatures: { written_date: '2026-03-01', employer_signed: true, employee_signed: true, copy_delivered_confirmed: true },
  };
  const ck = await callTool('check_contract', { contract });
  const f = ck.results?.[0]?.findings || [];
  const mw = f.find((x) => /최저임금/.test(x.rule) && x.status === '위반');
  console.log(`  check_contract 집계: ${JSON.stringify(ck.results?.[0]?.counts)}`);
  check(`check_contract 최저임금 위반 1건 이상(${mw?.rule}: ${mw?.detail?.slice(0, 40)}…)`, ck.ok && !!mw);
  check('check_contract 상태는 화면 문구(위반·리스크·적정·자료 필요)', f.every((x) => ['위반', '리스크', '적정', '자료 필요'].includes(x.status)));
  check(`check_contract 규칙 코드·심각도(${mw?.code}·${mw?.severity})`, mw?.code === 'MINWAGE' && f.every((x) => /^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(x.code) && ['critical', 'major', 'minor', 'info'].includes(x.severity)));
  // 용어 — 기본은 사이트 화면과 같이 「포괄」을 「임금 구성」으로, terms:'legal' 이면 법률 용어 그대로(노무사 검토 보고서용, 261121)
  const incPub = f.find((x) => x.code === 'INCLUSIVE-WAGE');
  check(`check_contract 기본 용어 — 「포괄」 없음(${incPub?.rule}: ${incPub?.detail})`, !!incPub && !JSON.stringify(ck.results).includes('포괄'));
  const ckLegal = await callTool('check_contract', { contract, terms: 'legal' });
  const incLegal = (ckLegal.results?.[0]?.findings || []).find((x) => x.code === 'INCLUSIVE-WAGE');
  check(`check_contract terms:'legal' — 「포괄」 그대로(${incLegal?.rule}: ${incLegal?.detail})`, ckLegal.ok && /포괄/.test(`${incLegal?.rule} ${incLegal?.detail}`) && !JSON.stringify(ckLegal.results).includes('임금 구성'));
  check('check_contract terms:legal 이 판정·코드는 바꾸지 않음', JSON.stringify(ckLegal.results?.[0]?.counts) === JSON.stringify(ck.results?.[0]?.counts) && (ckLegal.results?.[0]?.findings || []).map((x) => x.code).join() === f.map((x) => x.code).join());
  // 엔진이 읽은 통상시급·고용형태를 같이 낸다 — 재작성 계약서가 파이썬 「기본급÷209」로 다시 셈하지 않게(261120 시급 10,320 → 4,296)
  const samples = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../src/lib/contract-check/data/synthetic_edge_cases.json', import.meta.url)), 'utf8'));
  const part = await callTool('check_contract', { contract: samples.find((s) => s.contract_id === 'syn-part-nosched-0002') });
  const pd = part.results?.[0]?.derived;
  console.log(`  check_contract 파생값(시급제 파트): ${JSON.stringify(pd)}`);
  check('check_contract 파생값 — 시급제 파트 통상시급 10,320·시급제·단시간', pd?.ordinary_hourly_rate === 10_320 && pd?.wage_form === 'hourly' && pd?.employment_type === 'part_time');
  // 기본급 항목이 없고 입력에 옛 통상시급(4,296)만 남은 계약 — 엔진이 읽지 않은 값을 파생값으로 내지 않는다(261121)
  const p0 = samples.find((s) => s.contract_id === 'syn-part-nosched-0002');
  const stale = { ...p0, wage: { ...p0.wage, ordinary_hourly_rate: 4296, items: (p0.wage?.items || []).map((i) => (i.code === 'BASE' ? { ...i, code: 'OTHER' } : i)) } };
  const sd = (await callTool('check_contract', { contract: stale })).results?.[0]?.derived;
  check(`check_contract 파생값 — 기본급 없으면 옛 통상시급 남기지 않음(${sd?.ordinary_hourly_rate}·${sd?.wage_form})`, sd?.ordinary_hourly_rate === null && sd?.wage_form === null);
  const fd = ck.results?.[0]?.derived;
  check(`check_contract 파생값 — 월급제 통상시급(${fd?.ordinary_hourly_rate}·${fd?.wage_form})`, typeof fd?.ordinary_hourly_rate === 'number' && fd?.wage_form === 'monthly');
  const tpl = await callTool('check_contract', {});
  check('check_contract 빈 양식', tpl.ok && !!tpl.template?.wage);
  const rrn = await callTool('check_contract', { contract: { ...contract, employee: { ...contract.employee, rrn_masked: '900101-1234568' } } });
  check('check_contract 주민번호 모양이면 점검하지 않음', rrn.ok === false);
  const badShape = await callTool('check_contract', { contract: { ...contract, work_time: { ...contract.work_time, start: '9시' } } });
  check(`check_contract 형식 오류(${badShape.errors?.[0]})`, badShape.ok === false && badShape.errors?.length > 0);
}

// calc — 기대값 = 사이트 단위 시험(tests/unit/calc-*.test.ts·headcount-plan.test.ts)
if (tools.includes('check_min_wage')) {
  const m26 = await callTool('check_min_wage', { unit: 'month', amount: 2_156_880, weeklyHours: 40, year: 2026 });
  check(`min_wage 2026 월 209시간·10,320원 충족(${m26.rows?.[0]?.line})`, m26.rows?.[0]?.hours === 209 && m26.rows[0].hourly === 10_320 && m26.rows[0].meets);
  const m27 = await callTool('check_min_wage', { unit: 'month', amount: 2_156_880, weeklyHours: 40, year: 2027 });
  check(`min_wage 2027 79,420원 모자람(${m27.rows?.[0]?.line})`, m27.rows?.[0]?.required === 2_236_300 && m27.rows[0].shortfall === 79_420);
}
if (tools.includes('calc_weekly_holiday_pay')) {
  const w = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 22.5 });
  check(`weekly_holiday 주 22.5시간 → 4.5시간 46,440원(${w.headline?.[0]})`, w.dailyHours === 4.5 && w.amount === 46_440);
  const u = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 14.5 });
  check('weekly_holiday 주 15시간 미만은 없음', u.status === 'under15' && u.amount === 0);
  // G4 D1 — 그 주(연속 7일) 7일째 전 퇴사(월~일 주 금요일, 또는 수요일 주휴·목요일 퇴사)는 0원
  const fri = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 40, endsBeforeWeekEnd: true });
  check(`weekly_holiday 퇴사일이 7일째 전이면 없음(${fri.headline?.[1]})`, fri.status === 'ended' && fri.amount === 0);
  // G4 I2·D1·R1 — 0원의 근거(존속 요건은 조문에 없음, 첫 근거 임금근로시간과-1736 · 보조 1350 답변)를 웹과 같은 문장으로 싣는다
  check(`weekly_holiday 퇴사 주 근거 1736 먼저·1350 보조(${fri.basis?.find((b) => b.includes('1736'))})`,
    /최소한 1주 동안의 근로관계 존속을 전제로/.test(fri.basisNote ?? '') && /임금근로시간과-1736/.test(fri.basisNote ?? '') && /7일째가 되는 날/.test(fri.basisNote ?? '')
      && !/1743/.test(fri.basisNote ?? '') && fri.basis?.some((b) => b.includes('제2조'))
      && fri.basis.findIndex((b) => b.includes('1736')) < fri.basis.findIndex((b) => b.includes('1350')));
  // G4 R7 — 같은 주에 입사·퇴사(둘 다 true)는 퇴사가 앞서 0원(웹 체크 둘과 같은 답)
  const both = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 40, joinedMidWeek: true, endsBeforeWeekEnd: true });
  check('weekly_holiday 같은 주 입사·7일째 전 퇴사는 0원(ended)', both.status === 'ended' && both.amount === 0);
  // G4 R9 — 옛 입력 endsBeforeRestDay 는 조용히 버려 82,560원을 내지 않고 거절한다
  const legacy = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 40, endsBeforeRestDay: true });
  check(`weekly_holiday 옛 입력 endsBeforeRestDay 거절(${legacy.error})`, legacy.ok === false && /endsBeforeWeekEnd/.test(legacy.error ?? '') && legacy.amount === undefined);
  const sun = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 40, endsBeforeWeekEnd: false });
  check('weekly_holiday 퇴사일이 7일째(일요일)면 82,560원(근거 줄 없음)', sun.status === 'paid' && sun.amount === 82_560 && sun.basisNote === undefined);
  // G4 E1 — 수요일 입사(주 24시간): 종전 49,536원 → 0원으로 단정하지 않고 금액 없음·확인 필요
  const wed = await callTool('calc_weekly_holiday_pay', { hourlyWage: 10_320, weeklyHours: 24, joinedMidWeek: true });
  check(`weekly_holiday 주중 입사면 금액 없음·확인 필요(${wed.headline?.[0]})`,
    wed.status === 'joined-unclear' && wed.amount === null && wed.monthly === null && /확인 필요/.test(wed.headline?.[0] ?? '')
      && /1743/.test(wed.headline?.[1] ?? '') && /근로를 시작한이후에/.test(wed.basisNote ?? '') && /제2조 제1항 제7호/.test(wed.basisNote ?? ''));
  // G4 R4 — 무엇을 확인할지(1350 답변의 사후 정산·법적 효력 없음)를 웹 nextNote 와 같은 문장으로
  check('weekly_holiday 주중 입사 확인 안내(checkNote) — 1350 사후 정산·법적 효력 없음',
    /이후에 이를 정산하여/.test(wed.checkNote ?? '') && /법적 효력이 있는 해석이 아닙니다/.test(wed.checkNote ?? '')
      && /joinedMidWeek 를 비우고/.test(wed.checkNote ?? '') && !/체크/.test(wed.checkNote ?? ''));
}
if (tools.includes('count_regular_workers')) {
  // 4명 원래부터 + 계약직 1명 2026-11-02~11-30, 월~금
  const h = await callTool('count_regular_workers', {
    openDays: [1, 2, 3, 4, 5], today: '2026-10-28', baseDate: '2026-11-17',
    crews: [{ count: 4 }, { count: 1, from: '2026-11-02', to: '2026-11-30' }],
  });
  const s = h.fivePlus?.spans?.[0];
  check(`headcount 5인 이상 2026-11-17~12-15(${h.headline?.[0]})`, h.fivePlus?.kind === 'spans' && s?.from === '2026-11-17' && s?.to === '2026-12-15');
  check(`headcount 기준일 근거 rule2-1·가동일 21·미달 10(${h.baseDate?.line})`, h.baseDate?.basis === 'rule2-1' && h.baseDate.operatingDays === 21 && h.baseDate.belowDays === 10);
  check('headcount 연차 없음·10명 기간 없음', h.annualLeave?.kind === 'none' && h.tenPlus?.spans?.length === 0);
  // G4 I3 — 연차 2월 달 = 2026-02-28 날짜별 산정(1-28~2-27, 미달 16/31). 2025-03-31 개업, 다섯째 1-28~2-12 부재
  const g = await callTool('count_regular_workers', {
    openDays: [0, 1, 2, 3, 4, 5, 6], businessStart: '2025-03-31', today: '2026-03-01', baseDate: '2026-02-28',
    crews: [{ count: 4, from: '2025-03-31' }, { count: 1, from: '2025-03-31', to: '2026-01-27' }, { count: 1, from: '2026-02-13' }],
  });
  const gl = g.annualLeave?.lines ?? [];
  check(`headcount 2-28 근거 1-28~2-27·미달 16/31, 연차 3-31 적용 아님(${gl[0]})`,
    g.baseDate?.periodStart === '2026-01-28' && g.baseDate.belowDays === 16 && g.baseDate.operatingDays === 31 && g.baseDate.covered === false
    && gl.length > 0 && !gl.some((l) => l.includes('3월 31일(화)')));
  // G4 R8 — 연차 가장 이른 달: 2026-02-13부터 매일 5명, 연차를 볼 날 2027-01-31 → 첫 달 01-31~02-27(28일 중 미달 13일 → 5명 이상)
  const lv = await callTool('count_regular_workers', {
    openDays: [0, 1, 2, 3, 4, 5, 6], today: '2026-12-01', baseDate: '2027-01-31', crews: [{ count: 5, from: '2026-02-13' }],
  });
  const m0 = lv.annualLeaveMonths?.months?.[0];
  check(`headcount 연차 첫 달 = 연차가 쓴 구간(${m0?.line})`,
    lv.annualLeaveMonths?.months?.length === 12 && m0?.periodStart === '2026-01-31' && m0.periodEnd === '2026-02-27'
      && m0.operatingDays === 28 && m0.belowDays === 13 && m0.covered === true && /이날 연차 적용$/.test(lv.annualLeaveMonths.head ?? ''));
  // G4 R8 — 사업 시작일이 가장 이른 달 첫날(01-31)보다 늦으면(02-03) 열두 달이 모두 5인 이상이어도 그날 연차는 적용 안 함
  const lb = await callTool('count_regular_workers', {
    openDays: [0, 1, 2, 3, 4, 5, 6], businessStart: '2026-02-03', today: '2026-12-01', baseDate: '2027-01-31', crews: [{ count: 5, from: '2026-02-03' }],
  });
  check(`headcount 연차 열두 달 모두 5인 이상·사업 시작일 늦음 → 적용 안 함(${lb.annualLeaveMonths?.head})`,
    lb.annualLeaveMonths?.months?.every((m) => m.covered) && lb.annualLeaveMonths.covered === false && /사업 시작일/.test(lb.annualLeaveMonths.head ?? ''));
}
if (tools.includes('calc_take_home_pay')) {
  const t = await callTool('calc_take_home_pay', { pay: 3_000_000, meal: 200_000, date: '2026-10-28' });
  const r = t.result || {};
  const got = [r.nps, r.health, r.ltc, r.employment, r.tax?.incomeTax, r.tax?.localTax, r.takeHome];
  check(`take_home C01 300만·식대 20만 ${JSON.stringify(got)}`, JSON.stringify(got) === JSON.stringify([133_000, 100_660, 13_220, 25_200, 56_800, 5_680, 2_665_440]));
  // 간이세액표 재확인 기한(2027-02-28) — 그날은 계산하고 다음 날은 멈춘다(G4 I5)
  const last = await callTool('calc_take_home_pay', { pay: 3_000_000, date: '2027-02-28' });
  const after = await callTool('calc_take_home_pay', { pay: 3_000_000, date: '2027-03-01' });
  check(`take_home 2027-02-28 계산·2027-03-01 멈춤(${after.error})`, last.ok === true && after.ok === false && /2027-03-01/.test(after.error ?? ''));
}
if (tools.includes('calc_notice_pay')) {
  const n = await callTool('calc_notice_pay', { unit: 'month', amount: 2_156_880, weeklyHours: 40, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30' });
  check(`notice_pay 월급 2,156,880 → 2,476,800(${n.headline?.[0]})`, n.status === 'pay' && n.amount === 2_476_800);
  const sh = await callTool('calc_notice_pay', { unit: 'hour', amount: 10_320, dailyHours: 8, hireDate: '2025-01-02', dismissalDate: '2026-11-30', noticeDate: '2026-11-01' });
  check('notice_pay 29일 전 예고는 30일분 전액', sh.status === 'short' && sh.noticeDays === 29 && sh.amount === 2_476_800);
}
if (tools.includes('calc_leave_pay')) {
  const l = await callTool('calc_leave_pay', {
    timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8,
    rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 }, days: { source: 'unused', unusedDays: 5 }, asOf: '2026-10-29',
  });
  check(`leave_pay 260만 ÷ 209 × 8 × 5 = 497,607.66 → 원 미만 올림 497,608(${l.headline?.[0]})`, l.result?.hours === 209 && l.result?.amount === 497_608);
  const u5 = await callTool('calc_leave_pay', { timing: 'employed', fivePlus: false, weeklyHours: 40, dailyHours: 8, rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 }, asOf: '2026-10-29' });
  check('leave_pay 4명 이하는 계산하지 않음', u5.result?.status === 'under5' && u5.result.amount === null);
  const err = await callTool('calc_leave_pay', { timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8, rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 }, asOf: '2026-10-29' });
  check(`leave_pay 일수 없으면 오류(${err.error})`, err.ok === false && !!err.error);
}
// ── 이 판에서 더한 도구 8개(calc 4 · leave 2 · tax 1 · duties 1) ──
// 기대값 = 사이트 단위 시험(tests/unit/calc-severance·calc-retirement-tax·calc-pay-proration·calc-shutdown-allowance,
// tests/leave-source/leave-ledger.crosscheck.mts) 또는 엔진 식을 손으로 푼 값. 전부 합성 값이다.
const callNew = async (name, args) => {
  const t = await callJson(name, args).then((j) => JSON.stringify(j));
  const h = bannedNew(t);
  check(`${name}: 응답 금지어 없음(대신·대행·대리 포함)${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
  return JSON.parse(t);
};
for (const n of MORE_TOOLS) {
  if (!tools.includes(n)) continue;
  const run = (await import(new URL(`./smoke-more/${n}.mjs`, import.meta.url))).default;
  await run(callNew, check);
}
// 13자리 금액은 주민번호 가림에 걸리지 않는다 — 글자 값만 가린다(lib/common.mjs text, 적대 검토 261104)
if (tools.includes('calc_daily_worker_tax')) {
  const raw = (await c.callTool({ name: 'calc_daily_worker_tax', arguments: { dailyWorker: true, payments: [{ lines: [{ dailyWage: 1_000_000_000, days: 366 }] }] } })).content?.[0]?.text ?? '';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* 깨진 JSON */ }
  check('13자리 금액 응답이 올바른 JSON(주민번호 가림이 숫자를 바꾸지 않음)', parsed !== null && !raw.includes('******'));
}
// 새 도구 7개는 설명·입력 설명에도 금지어(대신·대행·대리·포괄 포함)가 없다
for (const t of (await c.listTools()).tools.filter((x) => MORE_TOOLS.includes(x.name))) {
  const h = banned ? banned.bannedHits(JSON.stringify([t.title, t.description, t.inputSchema]), [...NEW_WORDS, '포괄']) : [];
  check(`${t.name}: 설명 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
}
if (tools.includes('calc_severance')) {
  // calc-severance.test.ts 「재직 3년(1,096일)」 — 1일 평균임금 97,826.09, 퇴직금 = 반올림(9,782,609전 × 30 × 1,096 ÷ 36,500)
  const s = await callNew('calc_severance', { hireDate: '2023-01-01', lastWorkDate: '2025-12-31', wageTotal: 9_000_000 });
  const want = Math.round((9_782_609 * 30 * 1096) / 36_500);
  check(`severance 3년 1,096일 · 97,826.09 → ${want}(${s.headline?.[0]})`, s.ok && s.result?.serviceDays === 1096 && s.result.dailyAverage === 97_826.09 && s.result.amount === want && s.result.eligible === true);
  const short = await callNew('calc_severance', { hireDate: '2026-03-02', lastWorkDate: '2026-10-30', wageTotal: 7_500_000 });
  check(`severance 1년 미만은 지급 대상 아님(${short.headline?.[0]})`, short.ok && short.result?.eligible === false && /1년/.test(short.headline?.[0] ?? ''));
  const bad = await callNew('calc_severance', { hireDate: '2026-03-02', lastWorkDate: '2026-02-01', wageTotal: 7_500_000 });
  check(`severance 날짜 거꾸로면 오류(${bad.error})`, bad.ok === false && !!bad.error);
}
if (tools.includes('calc_holiday_pay')) {
  // 엔진 식 — 월급 2,090,000 ÷ 209 = 통상시급 10,000. 월급 외에 휴일근로 1.0배 + 가산 0.5배: 10,000 × 1.5 × 8 = 120,000
  // (월급에 들어 있는 것은 쉬어도 받는 유급휴일 1일분 — 2026-11-22 P0)
  const m = await callNew('calc_holiday_pay', { workerType: 'monthly', fivePlus: true, holidayKind: 'public_holiday', monthlyPay: 2_090_000, workedHours: 8 });
  check(`holiday_pay 월급제 5인 이상 8시간 → 월급 외 120,000(${m.headline?.[0]})`, m.ok && m.result?.total === 120_000 && m.result.base_hourly === 10_000 && m.result.already_in_monthly_pay === true && m.result.paid_holiday_day?.status === 'in_monthly_pay');
  // 시급 10,320 × 8 = 82,560 + 가산 41,280 = 123,840 (일한 대가). 유급휴일 1일분 82,560 은 따로(headline 에 밝힌다)
  const h = await callNew('calc_holiday_pay', { workerType: 'hourly', fivePlus: true, holidayKind: 'labor_day', hourlyWage: 10_320, workedHours: 8, weeklyHours: 40 });
  check(`holiday_pay 시급 10,320 노동절 8시간 → 123,840 + 유급휴일 1일분 82,560 따로(${h.headline?.join(' ')})`, h.ok && h.result?.total === 123_840 && h.result.paid_holiday_day?.amount === 82_560 && h.headline?.some((l) => /유급휴일 1일분 82,560원/.test(l)));
  const night = await callNew('calc_holiday_pay', { workerType: 'hourly', fivePlus: true, holidayKind: 'public_holiday', hourlyWage: 12_000, workedHours: 4, nightHours: 6, weeklyHours: 40 });
  check(`holiday_pay 야간 시간 > 일한 시간이면 오류(${night.error})`, night.ok === false && /야간/.test(night.error ?? ''));
  const small = await callNew('calc_holiday_pay', { workerType: 'monthly', fivePlus: false, holidayKind: 'public_holiday', monthlyPay: 2_090_000, workedHours: 8 });
  check('holiday_pay 4명 이하 관공서 공휴일은 가산 없음·안내', small.ok && small.result?.total === 0 && !!small.result.warning);
  const zero = await callNew('calc_holiday_pay', { workerType: 'daily', fivePlus: true, holidayKind: 'public_holiday', dailyWage: 0, workedHours: 8 });
  check(`holiday_pay 일급 0이면 오류(${zero.error})`, zero.ok === false && /일급/.test(zero.error ?? ''));
}
if (tools.includes('calc_pay_proration')) {
  // calc-pay-proration.test.ts C1 — 2026-03 월급 2,508,000, 3/16 입사, 5명 이상
  const p = await callNew('calc_pay_proration', { mode: 'prorate', month: '2026-03', monthlyPay: 2_508_000, start: '2026-03-16', fivePlus: true, payslip: 1_337_600 });
  const amt = (id) => p.methods?.find((x) => x.id === id)?.amounts;
  check(`pay_proration 3/16 입사 30일 기준 1,337,600 · 명세서 일치 DAY_30(${p.headline?.[0]})`, p.ok && p.result?.employedDays === 16 && JSON.stringify(amt('DAY_30')) === '[1337600]' && p.result.payslip?.matches?.map((x) => x.id).join() === 'DAY_30');
  const fl = await callNew('calc_pay_proration', { mode: 'prorate', month: '2026-03', monthlyPay: 2_508_000, start: '2026-03-16', fivePlus: true, rounding: { how: 'FLOOR', unit: 1 }, method: 'CALENDAR' });
  check(`pay_proration 달력 일수 기준 버림 1,294,451(${fl.headline?.[0]})`, fl.ok && JSON.stringify(fl.methods?.find((x) => x.id === 'CALENDAR')?.amounts) === '[1294451]' && /회사 기준/.test(fl.headline?.[0] ?? ''));
  // A1·A2 — 2026-11-18(수) 결근: 통상시급 × 8 = 96,000 / 그 주 주휴까지 192,000
  const a = await callNew('calc_pay_proration', { mode: 'absence', month: '2026-11', monthlyPay: 2_508_000, fivePlus: true, absences: ['2026-11-18'] });
  const h8 = a.result?.rows?.find((x) => x.unit === 'HOUR8');
  check(`pay_proration 결근 1일 96,000 / 192,000(${a.headline?.[0]})`, a.ok && h8?.daysOnly?.amount === 96_000 && h8.withHoliday?.amount === 192_000);
  const none = await callNew('calc_pay_proration', { mode: 'prorate', month: '2026-03', monthlyPay: 2_508_000, fivePlus: true });
  check(`pay_proration 입사일·퇴사일 둘 다 없으면 오류(${none.error})`, none.ok === false && /입사일/.test(none.error ?? ''));
}
if (tools.includes('calc_shutdown_allowance')) {
  // calc-shutdown-allowance.test.ts C2 — 3개월 13,800,000 ÷ 92 = 150,000, 통상 100,000, 10일 → 본문 1,050,000 · 단서 1,000,000
  const avg = { source: 'period', hireDate: '2024-03-01', startDate: '2026-11-02', wageTotal: 13_800_000 };
  const ord = { unit: 'day', amount: 100_000, dailyHours: 8 };
  const s2 = await callNew('calc_shutdown_allowance', { fivePlus: true, cause: 'employer', average: avg, ordinary: ord, days: 10 });
  check(`shutdown C2 본문 1,050,000 · 단서 1,000,000(${s2.headline?.[0]})`, s2.ok && s2.result?.main === 1_050_000 && s2.result.proviso === 1_000_000);
  const s1 = await callNew('calc_shutdown_allowance', { fivePlus: true, cause: 'employer', average: { ...avg, wageTotal: 11_040_000 }, ordinary: ord, days: 10 });
  check(`shutdown C1 840,000 한 값(${s1.headline?.[0]})`, s1.ok && s1.result?.main === 840_000 && s1.result.proviso === null);
  const u5 = await callNew('calc_shutdown_allowance', { fivePlus: false, cause: 'employer', average: avg, ordinary: ord, days: 10 });
  check('shutdown 4명 이하는 계산하지 않음', u5.ok && u5.result?.status === 'under5' && u5.result.main === null);
  const over8 = await callNew('calc_shutdown_allowance', { fivePlus: true, cause: 'employer', average: avg, ordinary: { ...ord, dailyHours: 9 }, days: 10 });
  check(`shutdown 1일 소정 8시간 넘으면 오류(${over8.error?.slice(0, 30)}…)`, over8.ok === false && /8시간/.test(over8.error ?? ''));
}
if (tools.includes('calc_annual_leave')) {
  // 근로기준법 제60조 — 근속 3년 15 + 1 = 16일 · 1년 미만 8개월 8일
  const y3 = await callNew('calc_annual_leave', { hireDate: '2023-01-01', asOf: '2026-01-01' });
  check(`annual_leave 근속 3년 16일(${y3.headline?.[0]})`, y3.ok && y3.result?.days === 16 && y3.result.serviceYears === 3);
  const m8 = await callNew('calc_annual_leave', { hireDate: '2026-01-12', asOf: '2026-09-30' });
  check(`annual_leave 1년 미만 8개월 8일(${m8.headline?.[0]})`, m8.ok && m8.result?.days === 8 && m8.result.completedMonths === 8);
  const big = await callNew('calc_annual_leave', { hireDate: '1990-01-01', asOf: '2026-01-01' });
  check('annual_leave 상한 25일', big.ok && big.result?.days === 25);
  const rev = await callNew('calc_annual_leave', { hireDate: '2026-01-12', asOf: '2025-09-30' });
  check(`annual_leave 기준일이 입사일보다 빠르면 오류(${rev.error})`, rev.ok === false && !!rev.error);
}
if (tools.includes('settle_leave_on_exit')) {
  // leave-ledger.crosscheck.mts — 입사 2004-08-01 · 퇴사 2009-09-30: 입사일 기준 79 > 회계연도 69, 사용 53 → 26일
  const s = await callNew('settle_leave_on_exit', { hireDate: '2004-08-01', endDate: '2009-09-30', fiscalGrantedTotal: 69, usedOrPaidTotal: 53, includeFirstYearMonthly: false });
  check(`settle 79 − 53 = 26일(${s.headline?.[0]})`, s.ok && s.result?.hireDateTotal === 79 && s.result.guaranteedTotal === 79 && s.result.shortfallDays === 26 && s.result.verdict === 'shortfall');
  const gate = await callNew('settle_leave_on_exit', { hireDate: '2004-08-01', endDate: '2009-07-30', fiscalGrantedTotal: 69, usedOrPaidTotal: 69, includeFirstYearMonthly: false });
  check(`settle 회계연도가 많고 규정 유무 모르면 확정 안 함(${gate.headline?.[0]})`, gate.ok && gate.result?.verdict === 'insufficient-input' && gate.result.shortfallDays === null);
  const miss = await callNew('settle_leave_on_exit', { hireDate: '2004-08-01', endDate: '2009-09-30' });
  check('settle 빈 칸은 0으로 보지 않음', miss.ok && miss.result?.verdict === 'insufficient-input');
  const monthly = await callNew('settle_leave_on_exit', { hireDate: '2004-08-01', endDate: '2009-09-30', fiscalGrantedTotal: 69, usedOrPaidTotal: 53 });
  // 261124 — 첫해 월 단위 연차는 묻지 않고 날짜로 정한다(2005-08-01 발생 = 구 제60조제3항 → 15일에 포함, 79 그대로)
  check('settle 첫해 월 연차는 날짜로 정한다(구법 79 − 53 = 26일)', monthly.ok && monthly.result?.hireDateTotal === 79 && monthly.result.shortfallDays === 26 && /제60조제3항/.test(monthly.result.groundNote ?? ''));
  const badDate = await callNew('settle_leave_on_exit', { hireDate: '2004-8-1', endDate: '2009-09-30', fiscalGrantedTotal: 69, usedOrPaidTotal: 53 });
  check(`settle 날짜 형식 오류(${badDate.error})`, badDate.ok === false);
}
if (tools.includes('calc_retirement_tax')) {
  // calc-retirement-tax.test.ts T06 — 13년, 6,000만원 → 소득세 691,990 · 지방소득세 69,190
  const t = await callNew('calc_retirement_tax', { pay: 60_000_000, hireDate: '2014-01-02', lastWorkDate: '2026-07-15' });
  check(`retirement_tax T06 691,990 · 69,190(${t.headline?.[0]})`, t.ok && t.result?.years === 13 && t.result.incomeTax === 691_990 && t.result.localTax === 69_190 && !!t.hometax?.href);
  const z = await callNew('calc_retirement_tax', { pay: 2_500_000, hireDate: '2023-07-03', lastWorkDate: '2026-07-02' });
  check(`retirement_tax T10 공제 상한 → 0원(${z.headline?.[1]})`, z.ok && z.result?.incomeTax === 0 && z.result.serviceDeductionCapped === true);
  // 261125 P3 — 받는 방법: 기본 현금 수령(뗀다), IRP 를 고르면 떼지 않음(§146②1), 현금 1천원 미만이면 떼지 않음(§86), 1,000원이면 뗀다
  const irp = await callNew('calc_retirement_tax', { pay: 10_000_000, hireDate: '2025-11-01', lastWorkDate: '2026-10-31', payout: 'irp' });
  check('retirement_tax IRP 이전 → 떼는 세금 0', irp.ok && irp.payout === 'irp' && irp.result?.incomeTax === 428_750 && irp.withholding?.total === 0 && irp.withholding.reason === 'irp');
  const def = await callNew('calc_retirement_tax', { pay: 10_000_000, hireDate: '2025-11-01', lastWorkDate: '2026-10-31' });
  check('retirement_tax 기본 현금 수령 → 471,620 뗀다', def.ok && def.payout === 'cash' && def.withholding?.total === 471_620);
  const small = await callNew('calc_retirement_tax', { pay: 1_708_292, hireDate: '2025-11-01', lastWorkDate: '2026-10-31', payout: 'cash' });
  check('retirement_tax 현금 999원 → 소액부징수 0 / 0', small.ok && small.result?.incomeTax === 990 && small.withholding?.total === 0 && small.withholding.reason === 'small');
  const k1 = await callNew('calc_retirement_tax', { pay: 1_708_334, hireDate: '2025-11-01', lastWorkDate: '2026-10-31', payout: 'cash' });
  check('retirement_tax 현금 1,000원 → 1,000 / 100', k1.ok && k1.withholding?.incomeTax === 1_000 && k1.withholding.localTax === 100);
  const old = await callNew('calc_retirement_tax', { pay: 20_000_000, hireDate: '2015-01-01', lastWorkDate: '2022-12-31' });
  check(`retirement_tax 2022년 퇴사는 계산하지 않음(${old.error?.slice(0, 30)}…)`, old.ok === false && /2023년/.test(old.error ?? ''));
}
if (tools.includes('list_employer_duties')) {
  let dutiesData = null;
  const dutiesTs = fileURLToPath(new URL('../../src/content/duties-data.ts', import.meta.url));
  if (fs.existsSync(dutiesTs)) {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: [dutiesTs], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
    dutiesData = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  }
  const want = (tier) => dutiesData?.DUTIES.filter((d) => d.min <= tier).length;
  const d7 = await callNew('list_employer_duties', { headcount: 7 });
  check(`duties 7명 → 5~9명 구간 의무 ${d7.count}개(자료 ${want(5)}) · 다음 구간 10~29명`, d7.ok && d7.tier?.min === 5 && (!dutiesData || d7.count === want(5)) && d7.next?.tier?.min === 10 && d7.duties.every((x) => x.title && x.basis && x.penalty));
  const d0 = await callNew('list_employer_duties', { headcount: 0 });
  check(`duties 0명 → 1~4명 구간(${d0.count}개)`, d0.ok && d0.tier?.min === 1 && (!dutiesData || d0.count === want(1)) && d0.newAtThisTier?.length === 0);
  const d50 = await callNew('list_employer_duties', { headcount: 120, group: '의무교육' });
  check(`duties 120명 의무교육만(${d50.duties?.length}개) · 다음 구간 없음`, d50.ok && d50.tier?.min === 50 && d50.duties.every((x) => x.group === '의무교육') && d50.next === null && d50.count === (dutiesData ? want(50) : d50.count));
}

// ── nosa 묶음(노사협의회) — 기대값 = tests/unit/nosa-council-assess.test.ts(파이썬 assess.py 정답) ──
if (tools.includes('assess_labor_council')) {
  const n1 = await callNew('assess_labor_council', { headcount: 120, concurrentRep: true, installDate: '2026-11-20', meetingDate: '2026-12-03', election: { electors: 100, voters: 60, candidates: 3, seats: 3, notified: true, supporters: 40 }, today: '2026-11-10' });
  check(`nosa 신고 기한 ${n1.deadlines?.report?.due} · 소집 통보 ${n1.deadlines?.convene?.due} · 찬반투표 · 겸임 두 기준 따로`,
    n1.ok && n1.deadlines.report.due === '2026-12-05' && n1.deadlines.convene.due === '2026-11-25' && n1.election.ballot.method === '찬반투표'
    && n1.election.workerRep.adminInterpretation.met === true && n1.election.workerRep.majoritySupport.met === false);
  const n2 = await callNew('assess_labor_council', { headcount: 32, election: { electors: 32, voters: 1 }, today: '2026-11-10' });
  check(`nosa 투표율 파이썬 round 와 같음(32명 중 1명 → ${n2.election?.workerMembers?.stages?.[0]?.turnout})`, n2.ok && n2.election.workerMembers.stages[0].turnout === 3.12);
  const n3 = await callNew('assess_labor_council', { headcount: 900101_1234568 });
  check('nosa 주민번호 모양이면 멈춤', n3.ok === false);
}
if (tools.includes('check_council_meeting')) {
  const cm = await callNew('check_council_meeting', { kind: '정기', meetingDate: '2026-12-03', noticeDate: '2026-11-26', workerSeats: 10, employerSeats: 10, workerCurrent: 7, workerPresent: 4, employerPresent: 6, agenda: [{ type: '의결', inFavor: 9 }], today: '2026-11-10' });
  check(`nosa 회의 확인 — 통보 기한 ${cm.convene?.due}(늦음) · 정원 10 출석 4 불성립 · 의결되지 않음`, cm.ok && cm.convene.due === '2026-11-25' && cm.convene.onTime === false && cm.quorum.held === false && cm.agenda[0].result === '의결되지 않음');
  const cv = await callNew('check_council_meeting', { kind: '임시', meetingDate: '2026-12-03', workerSeats: 5, employerSeats: 5, workerPresent: 4, employerPresent: 5, agenda: [{ type: '의결', inFavor: 6 }, { type: '의결', inFavor: 5 }], today: '2026-11-10' });
  check(`nosa 회의 확인 — 출석 9 찬성 6 의결 · 찬성 5 의결되지 않음 · 공지 ${cv.resolutionNotice?.due}`, cv.ok && cv.agenda[0].result === '의결' && cv.agenda[1].result === '의결되지 않음' && cv.resolutionNotice.due === '2026-12-13');
}
if (tools.includes('make_labor_council_forms')) {
  // 합성 사업장 — 실재하지 않는 이름·번호
  const NF = { workplace: { name: '가상상사', ownerName: '김대표', bizNo: '000-00-00000' }, headcount: 120, majorityUnion: false, concurrentRep: true, installDate: '2026-12-01', election: { electors: 100, voters: 60, candidates: 3, seats: 3, notified: true }, writtenDate: '2026-11-10', outDir: path.join(tmp, 'nosa') };
  const nb = await callNew('make_labor_council_forms', { ...NF, workplace: { name: '' } });
  check(`nosa 서류 사업장명이 비면 만들지 않음(${nb.blanks})`, nb.ok === false && nb.blanks?.includes('사업장명') && !fs.existsSync(NF.outDir));
  const nm = await callNew('make_labor_council_forms', NF);
  const nmagic = (nm.files || []).map((f) => `${f.format}:${fs.readFileSync(f.path).subarray(0, 4).toString('latin1')}`);
  check(`nosa 서류 협의회규정 포함 14종 28파일(위촉통지서 없음) · 신고 기한 ${nm.submit?.deadline}`, nm.ok && nm.files?.length === 28 && !nm.skipped && nm.submit?.deadline === '2026-12-16'
    && nm.skippedDocuments?.[0]?.id === '12_위촉통지서' && nmagic.every((m) => (m.startsWith('pdf:') ? m === 'pdf:%PDF' : m.endsWith('PK\u0003\u0004'))));
  check(`nosa 협의회규정 첨부 이름(${nm.submit?.attach}) · 견본 출처는 notice 로만`, nm.submit?.attach === '노사협의회_20261110_00_협의회규정.pdf' && /부록 1/.test(nm.notice ?? ''));
  const na = await callNew('make_labor_council_forms', NF);
  check(`nosa 서류 덮어쓰지 않음(${na.exists?.length}개)`, na.ok === false && na.exists?.length === 28);
  const n11 = await callNew('make_labor_council_forms', { ...NF, workerMembers: 11, outDir: path.join(tmp, 'nosa-11') });
  check('nosa 위원 수 10명 초과면 만들지 않음', n11.ok === false && !fs.existsSync(path.join(tmp, 'nosa-11')));
  const nr = await callNew('make_labor_council_forms', { ...NF, workplace: { name: '가상상사', tel: '900101-1234568' }, outDir: path.join(tmp, 'nosa-rrn') });
  check('nosa 서류 주민번호 모양이면 만들지 않음', nr.ok === false && !fs.existsSync(path.join(tmp, 'nosa-rrn')));
}
if (tools.includes('make_council_meeting_docs')) {
  // 합성 회의 — 출석 9(정원 5·5) · 의결 1건 찬성 6 · 이월 협의 1건 · 보고 1건
  const MD = {
    workplace: { name: '가상상사' }, meeting: { kind: '정기', number: 4, date: '2026-12-03', place: '회의실', noticeDate: '2026-11-25' }, seats: { worker: 5, employer: 5 }, attendance: { worker: 4, employer: 5 },
    agenda: [{ title: '교육훈련 기본계획', type: '의결', article: '21-1', inFavor: 6 }, { id: 'A-20260903-05', title: '야간 작업 순환', type: '협의', carriedOver: true }, { title: '3분기 실적', type: '보고', article: '22-1' }],
    writtenDate: '2026-12-04', outDir: path.join(tmp, 'nosa-meeting'),
  };
  const mm = await callNew('make_council_meeting_docs', { ...MD, kind: 'minutes' });
  const mj = mm.files?.find((f) => f.format === 'json');
  const rec = mj ? JSON.parse(fs.readFileSync(mj.path, 'utf8')) : {};
  check(`nosa 회의록 4파일 + .json(${rec.meeting?.key}) · 결과 ${rec.agenda?.map((x) => x.result).join('/')}`, mm.ok && mm.files.length === 5 && rec.schema === 'nosa-council-minutes/1'
    && rec.agenda?.map((x) => x.result).join() === '의결,계속 협의,보고 완료' && rec.agenda[1].id === 'A-20260903-05' && rec.keepUntil === '2029-12-04');
  const ml = await callNew('make_council_meeting_docs', { ...MD, kind: 'notice', meeting: { ...MD.meeting, noticeDate: '2026-11-26' }, outDir: path.join(tmp, 'nosa-late') });
  check('nosa 통보 늦으면 소집 통보서 만들지 않음', ml.ok === false && /2026-11-25/.test(ml.errors?.join() ?? '') && !fs.existsSync(path.join(tmp, 'nosa-late')));
  const mo = await callNew('make_council_meeting_docs', { ...MD, kind: 'minutes' });
  check(`nosa 회의록 덮어쓰지 않음(${mo.exists?.length}개)`, mo.ok === false && mo.exists?.length === 5);
  if (tools.includes('export_council_vault')) {
    // 위 회의록 폴더를 기록 폴더로 — 이행 기록 하나 덧붙이고 보관함으로
    const rh = await callNew('record_council_history', { dir: MD.outDir, kind: 'implementation', implementation: { date: '2026-12-20', agendaId: 'A-20261203-01', status: '완료' } });
    check(`nosa 이행 기록 덧붙임(${rh.record?.seq}번 · ${rh.current})`, rh.ok && rh.record.seq === 1 && rh.current === '완료(근거 없음)');
    const vx = await callNew('export_council_vault', { dir: MD.outDir, outDir: path.join(tmp, 'nosa-vault'), today: '2027-01-10' });
    check(`nosa 보관함 ${vx.files}파일 · 깨진 링크 ${vx.brokenLinks?.length} · 미이행 ${vx.dashboard?.overdue?.map((x) => x.status).join()}`, vx.ok && vx.brokenLinks.length === 0
      && fs.existsSync(path.join(tmp, 'nosa-vault', '_대시보드.md')) && fs.existsSync(path.join(tmp, 'nosa-vault', '_회의록대장.xlsx')) && vx.dashboard.overdue[0]?.status === '완료(근거 없음)');
  }
  if (tools.includes('import_council_minutes')) {
    // 옛 회의록(합성 txt) → ① 글자 읽기 → ② 제안 구조 확인 → 「가져옴 — 확인 전」 .json, 원본은 그대로
    const old = path.join(tmp, 'nosa-old-minutes.txt');
    fs.writeFileSync(old, '제5차 정기 노사협의회 회의록\n회의일시: 2027. 3. 4. 14:00\n1. 야간 작업 순환 — 계속 협의\n2. 휴게실 냉난방 — 의결\n');
    const ir = await callNew('import_council_minutes', { dir: MD.outDir, source: old });
    const ip = await callNew('import_council_minutes', {
      dir: MD.outDir, source: old, sourceSha256: ir.sha256,
      proposal: { workplace: { name: '가상상사' }, meeting: { kind: '정기', number: 5, date: '2027-03-04' }, seats: { worker: 5, employer: 5 }, writtenDate: '2027-03-04',
        agenda: [{ id: 'A-20260903-05', title: '야간 작업 순환', type: '협의', result: '계속 협의', carriedOver: true }, { title: '휴게실 냉난방', type: '의결', article: '20-11', result: '의결' }] },
    });
    check(`nosa 옛 회의록 가져옴(${ip.meetingKey} · ${ip.status} · 같은 ID ${ip.sameId?.length}건 · 원문 대조 알림 ${ip.textWarnings?.length ?? 0})`, ir.ok && ir.step === 'read' && /휴게실/.test(ir.text)
      && ip.ok && ip.status === '가져옴 — 확인 전' && fs.existsSync(ip.file) && fs.existsSync(old) && ip.sameId?.[0]?.id === 'A-20260903-05' && !ip.textWarnings);
  }
}
if (tools.includes('make_council_election_docs')) {
  // 합성 선거 — 후보 3 · 정원 3(찬반형) · 선거인 100 중 60 참여
  const ED = { workplace: { name: '가상상사' }, seats: 3, targetInstallDate: '2026-12-15', candidates: [{ dept: '생산1팀' }, { dept: '생산2팀' }, { dept: '품질팀' }], result: { electors: 100, voters: 60 }, writtenDate: '2026-11-10', outDir: path.join(tmp, 'nosa-election') };
  const ee = await callNew('make_council_election_docs', ED);
  check(`nosa 선거 서류 7종 14파일 · 선거일 ${ee.dates?.vote} · ${ee.ballot?.method}`, ee.ok && ee.files?.length === 14 && ee.dates.vote === '2026-12-03' && ee.ballot.method === '찬반투표' && ee.check.workerMembers.met);
  const es = await callNew('make_council_election_docs', { ...ED, result: { electors: 100, voters: 40 }, outDir: path.join(tmp, 'nosa-election-short') });
  check('nosa 선거 참여 미달이면 당선공고 만들지 않음', es.ok && es.skippedDocuments?.some((s) => s.id === '07_당선공고') && es.files.length === 12);
}
if (tools.includes('check_council_rules')) {
  // 합성 규정 — 과반수 참여 문구 없음 · 10명 추천 요건 · 협의사항 16개 호
  const RT = ['제1조(구성) ① 협의회는 근로자위원과 사용자위원 각 3명으로 구성한다.', '② 근로자위원은 직접·비밀·무기명 투표로 선출한다.',
    '제2조(후보) 입후보하려는 사람은 근로자 10명 이상의 추천을 받아야 한다.', '제3조(협의사항) ① 협의회는 다음 각 호를 협의한다.',
    ...['생산성 향상', '채용', '고충처리', '작업환경', '노무관리', '고용조정', '휴게', '지불방법', '신기계', '작업수칙', '재산형성', '직무 발명', '복지증진', '감시', '모성보호', '그 밖의 노사협조'].map((t, i) => `${i + 1}. ${t}`)].join('\n');
  const cr = await callNew('check_council_rules', { text: RT });
  const ids = (cr.findings ?? []).filter((f) => f.grade === '필수').map((f) => f.id);
  const optional = (cr.findings ?? []).filter((f) => f.grade === '선택').map((f) => f.id);
  check(`nosa 협의회규정 점검(필수 ${cr.counts?.['필수']} · 권장 ${cr.counts?.['권장']} · 선택 ${cr.counts?.['선택']}, 추천 요건은 선택)`, cr.ok && ['direct-majority', 'topics'].every((x) => ids.includes(x))
    && optional.includes('nomination-requirement') && /신·구조문대비표/.test(cr.submission ?? ''));
  if (tools.includes('make_council_rules_comparison')) {
    // 같은 합성 규정을 고친 개정안 — 과반수 참여 문구 · 추천 조 삭제 · 16호 신설(옛 16호는 17호로)
    const AT = RT.replace('② 근로자위원은 직접·비밀·무기명', '② 근로자위원은 근로자 과반수가 참여하여 직접·비밀·무기명')
      .replace('제2조(후보) 입후보하려는 사람은 근로자 10명 이상의 추천을 받아야 한다.\n', '')
      .replace('16. 그 밖의 노사협조', '16. 직장 내 성희롱 예방\n17. 그 밖의 노사협조');
    const mc = await callNew('make_council_rules_comparison', { currentText: RT, amendedText: AT, workplaceName: '가상상사', outDir: path.join(tmp, 'nosa-compare'), formats: ['docx', 'hwpx', 'xlsx'] });
    check(`nosa 신·구조문대비표 ${mc.rows}줄(${mc.places?.join(' ')}) · ${mc.files?.length}파일`, mc.ok && mc.files?.length === 3 && mc.files.every((f) => fs.existsSync(f.path))
      && mc.kinds?.['삭제'] === 1 && /<u>/.test(mc.markdown ?? '') && /<신 설>/.test(mc.markdown ?? ''));
  }
}

// ── docs 묶음 ── 합성 원고 → hwpx(파일 쓰기 · 같은 이름은 거절)
if (tools.includes('make_hwpx_from_markdown')) {
  const MDX = '# 가상 검토 메모\n\n## Ⅰ. 개요\n\n본문 **굵게** 대법원 2017. 12. 22. 선고 2016다202947 판결.\n\n| 구분 | 금액 |\n|:---:|---:|\n| 기본급 | 2,000,000 |\n\n2026. 11. 19.\n\n가상상사\n';
  const dir = path.join(tmp, 'docs-md');
  const mh = await callNew('make_hwpx_from_markdown', { markdown: MDX, preset: 'tribunal', outDir: dir });
  check(`docs md→hwpx ${mh.file?.bytes}B (제목 ${mh.headings}·표 ${mh.tables}·굵게 ${mh.boldRuns}·서명부 ${mh.signatureLines})`, mh.ok && fs.existsSync(mh.file.path)
    && mh.headings === 2 && mh.tables === 1 && mh.boldRuns === 2 && mh.signatureLines === 2 && mh.leftovers?.length === 0);
  const again = await callNew('make_hwpx_from_markdown', { markdown: MDX, preset: 'tribunal', outDir: dir });
  check('docs 같은 이름은 덮어쓰지 않음', again.ok === false && again.exists === mh.file.path);
  // 편집 기술 선택값을 모두 켠 판(합성 원고) — 남은 기호 없음
  const MDF = '# 가상 선택값 문서\n\n○ 기호 문단에 **문장 안 강조**가 있다.\n\n> [관련 판결] 대법원 2020. 1. 1. 선고 2019다1 판결\n> 인용 문장\n\n| 구분 | 1분기 | 2분기 |\n|--|----|----|\n| 합계 | 300 | < |\n';
  const mf = await callNew('make_hwpx_from_markdown', { markdown: MDF, preset: 'internal', outDir: dir, features: { indent: true, underline: true, quote: true, table: { width: 'fit', style: 'threeLine', merge: true, float: true } } });
  check(`docs 선택값 전부 켬 ${mf.file?.bytes}B (남은 기호 ${mf.leftovers?.length})`, mf.ok && fs.existsSync(mf.file.path) && mf.leftovers?.length === 0);
  // 가로 용지·표 칸 줄간격(261124) — 가로 파일을 쓰고, 범위 밖 줄간격은 스키마에서 멈춘다
  const ml = await callNew('make_hwpx_from_markdown', { markdown: '# 가상 가로 문서\n\n| 쟁점 | 주장 | 반론 | 검토 |\n|---|---|---|---|\n| 가 | 나 | 다 | 라 |\n', preset: 'internal', outDir: dir, orientation: 'landscape', tableLineSpacing: 180 });
  check(`docs 가로 용지 ${ml.file?.bytes}B`, ml.ok && fs.existsSync(ml.file.path));
  const mlBad = await c.callTool({ name: 'make_hwpx_from_markdown', arguments: { markdown: '# 가상 줄간격', preset: 'internal', outDir: dir, tableLineSpacing: 300 } }).catch((e) => ({ isError: true, e }));
  check('docs 표 칸 줄간격 범위 밖은 거절', mlBad.isError === true && !fs.existsSync(path.join(dir, '가상 줄간격.hwpx')));
  // 글자만 고치기 — 새 파일, 원본 그대로, 0번이면 멈춤
  const before = fs.readFileSync(mh.file.path);
  const ed = await callNew('edit_hwpx_text', { file: mh.file.path, edits: [{ old: '가상상사', new: '가상상회' }], fills: [{ table: 0, row: 1, col: 1, text: '2,100,000' }] });
  check(`docs 글자만 고치기 ${ed.file?.bytes}B`, ed.ok && fs.existsSync(ed.file.path) && fs.readFileSync(mh.file.path).equals(before));
  const none = await callNew('edit_hwpx_text', { file: mh.file.path, edits: [{ old: '없는 글자', new: 'x' }], outFile: path.join(dir, 'none.hwpx') });
  check('docs 글자 고치기 0번이면 멈춤', none.ok === false && !fs.existsSync(path.join(dir, 'none.hwpx')));
  // 양식 모드 — 앞서 만든 파일을 양식으로 다시 쓴다
  const tm = await callNew('make_hwpx_from_markdown', { markdown: '# 가상 양식본\n\n양식 모양으로 채운 본문.', preset: 'internal', outDir: dir, templateFile: mh.file.path });
  check(`docs 양식 모드 ${tm.file?.bytes}B`, tm.ok && fs.existsSync(tm.file.path));
  // 양식 모드 표 역할(261124) — 앞서 만든 파일의 표 칸 글자를 샘플로
  const tc = await callNew('make_hwpx_from_markdown', { markdown: '# 가상 표 양식본\n\n| 가 | 나 |\n|---|---|\n| 1 | 2 |', preset: 'internal', outDir: dir, templateFile: mh.file.path, templateSamples: { cell: '2,000,000', cellHead: '구분' } });
  check(`docs 양식 모드 표 역할 ${tc.file?.bytes}B`, tc.ok && fs.existsSync(tc.file.path));
  // 퇴고 — 범용 팩만으로도 돈다. 공개 팩은 기본으로 걸린 글자까지, brief 응답에는 걸린 글자·고칠 말이 없다
  const pr = await callNew('check_prose', { text: '가상 보고서입니다. 결과를 가르는 것은 시간입니다.', genre: 'general' });
  check(`check_prose 범용 팩 B ${pr.counts?.B}`, pr.ok && pr.counts?.B === 1 && 'word' in (pr.hits?.[0] ?? {}) && !pr.skipped && !pr.incomplete);
  const pb = await callNew('check_prose', { text: '가상 보고서입니다. 결과를 가르는 것은 시간입니다.', genre: 'general', detail: 'brief' });
  check('check_prose brief 는 위치만', pb.ok && pb.counts?.B === 1 && !('fix' in (pb.hits?.[0] ?? {})) && !('word' in (pb.hits?.[0] ?? {})));
  const nm = await callNew('check_norms', { text: '가상 회사는 이를 검토하였고, 도급인이 할수 있는 조치임 .' });
  check(`check_norms 띄어쓰기 A ${nm.spacing?.counts?.A} · 문장 부호 A ${nm.punct?.counts?.A} · 쉼표 A ${nm.comma?.counts?.A}`, nm.ok && nm.spacing?.counts?.A === 1 && nm.punct?.counts?.A === 1 && nm.comma?.counts?.A === 1);
  // 의미범주·AI 수사는 비공개 팩에만 규칙이 있다 — 이 시험은 PROSE_PACK_DIR 을 지우고 돌므로 둘 다 「불완전」이어야 한다(조용히 통과 금지)
  for (const [name, extra] of [['check_semantic', {}], ['check_rhetoric', { track: 'blog' }]]) {
    const r = await callNew(name, { text: '가상 보고서입니다.', ...extra });
    check(`${name} 비공개 팩 없음 → 불완전(${r.code})`, r.ok === false && r.incomplete === true && r.code === 'NO_PRIVATE_PACK' && !('hits' in r));
  }
  // 퇴고 보존 대조 — 「하여야 한다 → 하면 좋다」는 당위 훼손, 수치는 그대로라 보존됨
  const rw = await callNew('check_rewrite', { before: '가상 회사는 2026. 3. 2. 까지 서면으로 통지하여야 한다.', after: '가상 회사는 2026. 3. 2. 까지 서면으로 통지하면 좋다.', genre: 'general' });
  check(`check_rewrite 당위 사라짐 → ${rw.status} · 수치 ${rw.items?.numbers?.status}`, rw.ok && rw.status === '훼손' && rw.items?.modality?.status === '훼손' && rw.items?.numbers?.status === '보존됨');
  // 호증 날인 — 합성 PDF(pdf-lib 빈 쪽 2장) 첫 장에 「사 제7호증」. 설치본에서 글꼴 자산(dist/assets)을 찾는지
  {
    const { PDFDocument } = await import('pdf-lib');
    const sp = await PDFDocument.create();
    sp.addPage([595.28, 841.89]);
    sp.addPage([595.28, 841.89]);
    const src = path.join(dir, 'exhibit-in.pdf');
    fs.writeFileSync(src, await sp.save());
    const st = await callNew('stamp_exhibit_pdf', { file: src, outFile: path.join(dir, 'exhibit-out.pdf'), prefix: '사', number: 7 });
    check(`stamp_exhibit_pdf ${st.label} ${st.file?.bytes}B`, st.ok && st.label === '사 제7호증' && st.pages === 2 && st.overlapChecked === false && fs.existsSync(st.file.path));
  }
  // kordoc — 앞서 만든 hwpx 를 읽고(md), 표 칸을 채워 .hwp(CFB)로, keep 원고 한 낱말을 고쳐 되쓴다(설치본에서 kordoc·@rhwp/core 가 풀리는지)
  if (tools.includes('read_hwp_as_markdown')) {
    const rd = await callNew('read_hwp_as_markdown', { file: mh.file.path, outFile: path.join(dir, 'read.md'), layout: 'keep' });
    check(`docs 한글 읽기 ${rd.file?.bytes}B (표 ${rd.tables})`, rd.ok && rd.kind === 'hwpx' && fs.readFileSync(path.join(dir, 'read.md'), 'utf8').includes('기본급'));
    const fl = await callNew('fill_hwp_form', { file: mh.file.path, values: { 기본급: '2,100,000' }, outFile: path.join(dir, 'fill.hwp') });
    const head = fs.existsSync(path.join(dir, 'fill.hwp')) ? fs.readFileSync(path.join(dir, 'fill.hwp')).subarray(0, 4).toString('hex') : '';
    check(`docs 서식 채우기 → hwp(${head}) filled ${fl.filled?.length}`, fl.ok && head === 'd0cf11e0');
    fs.writeFileSync(path.join(dir, 'edit.md'), fs.readFileSync(path.join(dir, 'read.md'), 'utf8').replace('가상상사', '가상상회'));
    const pt = await callNew('patch_hwp_from_markdown', { file: mh.file.path, markdownFile: path.join(dir, 'edit.md'), outFile: path.join(dir, 'patch.hwpx') });
    check(`docs 되쓰기 applied ${pt.applied} skipped ${pt.skipped?.length}`, pt.ok && pt.applied === 1 && pt.skipped.length === 0 && pt.changes?.addedLines === 1);
  }
}

// ── forms 묶음 ── 합성 값 → 서식 hwpx(동시 호출 · 같은 이름 거절 · 주민번호 모양 거절)
if (tools.includes('make_hr_form')) {
  const lf = await callNew('list_hr_forms', {});
  check(`forms 목록 ${lf.forms?.length}종`, lf.ok && lf.forms?.length === 7 && lf.forms.every((f) => f.fields.length > 0));
  const V = { name: '김가상', birth: '1990-03-04', reason: 'child', childName: '김가가', childBirth: '2022-05-01', start: '2027-01-04', end: '2027-07-03', appliedOn: '2026-12-10', company: '가상상사' };
  const ck = await callNew('check_hr_form', { formId: 'childcare-leave', values: V });
  check(`forms 검사 — 30일 전 신청 안내(${ck.notes?.length})`, ck.ok && ck.notes.some((n) => n.includes('30일 전까지')));
  const dir = path.join(tmp, 'forms');
  const [a, b] = await Promise.all([
    callNew('make_hr_form', { formId: 'childcare-leave', values: V, outDir: dir }),
    callNew('make_hr_form', { formId: 'infertility-leave', values: { name: '이가상', birth: '1988-01-02', days: '2027-01-04,2027-01-05', appliedOn: '2026-12-20', company: '가상상사' }, outDir: dir }),
  ]);
  check(`forms 동시 두 건 ${a.file?.bytes}B·${b.file?.bytes}B`, a.ok && b.ok && fs.existsSync(a.file.path) && fs.existsSync(b.file.path));
  const again = await callNew('make_hr_form', { formId: 'childcare-leave', values: V, outDir: dir });
  check('forms 같은 이름은 덮어쓰지 않음', again.ok === false && again.exists === a.file.path);
  const rrn = await callNew('make_hr_form', { formId: 'childcare-leave', values: { ...V, dept: '900304-1234567' }, outDir: path.join(dir, 'rrn') });
  check('forms 주민번호 모양은 거절', rrn.ok === false && !fs.existsSync(path.join(dir, 'rrn')));
}

// ── work-rules 묶음 ──
// 금지어: 이 묶음이 쓰는 글은 전부 보고, 법령·개정 자료에서 그대로 옮긴 칸(LAW_TEXT_FIELDS)만 뺀다(법령 원문 변조 금지).
// groups/work-rules.mjs 의 LAW_TEXT_FIELDS 와 같아야 한다
const LAW_TEXT_FIELDS = new Set([
  'law', 'short', 'headline', 'summary', 'changes', 'standard', 'topic', 'point', 'proposal', 'basis', 'article', 'before', 'after', 'note', 'label', 'rows',
  'articleTitle', 'articleText', 'candidates', 'laws',
]);
const ownStrings = (v, key = '') => {
  if (LAW_TEXT_FIELDS.has(key)) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap((x) => ownStrings(x));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => ownStrings(x, k));
  return [];
};
const callRules = async (name, args, client = c) => {
  const j = await callJson(name, args, client);
  const h = bannedIn(ownStrings(j).join('\n'));
  check(`${name}: 이 묶음이 쓴 글 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
  return j;
};
const repo = fileURLToPath(new URL('../../', import.meta.url));
const inRepo = fs.existsSync(path.join(repo, 'public/data/laws/index.json'));
// 사이트 엔진을 esbuild 로 직접 불러 「화면 계산」의 기대값을 만든다(RulesCheck.PeriodResults 와 같은 집계)
let siteEngine = null;
if (inRepo) {
  const { build } = await import('esbuild');
  const entry = path.join(tmp, 'site-engine.ts');
  fs.writeFileSync(entry, `export { periodCheck, splitArticles } from ${JSON.stringify(path.join(repo, 'src/lib/laws/standard-check.ts').replace(/\\/g, '/'))};`);
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', alias: { '@': path.join(repo, 'src') } });
  siteEngine = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(repo, 'public/data/laws', f), 'utf8'));
/** 화면(RulesCheck.PeriodResults)과 같은 집계 — 같은 오늘(LLG_TODAY) */
function screenView(textIn, from, to) {
  const std = readJson('standard.json');
  const idx = readJson('index.json');
  const r = siteEngine.periodCheck({ text: textIn, std: std.articles, events: idx.events, rules: readJson('rules.json').rules, art93: std.art93, from, to, today: '20261021' });
  const hasText = siteEngine.splitArticles(textIn).length > 0;
  const open = r.items.filter((i) => i.status !== '반영됨');
  const ok = r.items.filter((i) => i.status === '반영됨');
  const fixN = open.filter((i) => i.status === '고칠 것' || i.status === '조문 추가').length;
  const soonN = open.filter((i) => i.status === '시행 예정').length;
  const shown = (it) => (hasText ? it.status : it.verdicts.length ? '바꿀 문안' : '법령 확인');
  return {
    counts: hasText ? { '고칠 것': fixN, '시행 예정': soonN, '확인·선택': open.length - fixN - soonN, '문구 일치': ok.length } : { '바꿀 조문': fixN, '시행 예정': soonN, '확인·선택': open.length - fixN - soonN },
    items: open.map((it) => `${it.std.no}(${it.std.title}):${shown(it)}`),
    earlier: r.earlier.length, missing93: r.missing93.length, missingRequired: r.missingRequired.length,
  };
}
const mcpView = (j) => ({ counts: j.counts, items: (j.items || []).map((i) => `${i.standard}:${i.status}`), earlier: j.earlier?.length, missing93: j.missing93?.length, missingRequired: j.missingRequired?.length });
const SAMPLE = inRepo ? fs.readFileSync(path.join(repo, 'src/app/laws/RulesCheck.tsx'), 'utf8').match(/export const SAMPLE = `([\s\S]*?)`;/)?.[1] : null;

// 법제처 파서 — 고정 응답으로(네트워크 없음)
const drf = await import('./lib/law-drf.mjs');
const fixJson = (f) => JSON.parse(fs.readFileSync(path.join(drfFix, f), 'utf8'));
if (hasDrfFix) {
  const s = drf.parseSearch(fixJson('search-lsa.json'));
  const lsa = s.rows.filter((r) => r.lawId === '001872');
  check(`drf 목록 파서(${s.rows.length}줄, 근로기준법 ${lsa.length}판, 상세링크 안 옮김)`, s.total === s.rows.length && lsa.length === 6 && s.rows.every((r) => !JSON.stringify(r).includes('lawService')));
  const one = drf.parseSearch({ LawSearch: { totalCnt: '1', law: fixJson('search-lsa.json').LawSearch.law[1] } });
  check('drf 목록 파서 — 한 줄이면 배열이 아닌 객체로 온다', one.rows.length === 1 && one.rows[0].mst === '290781');
  check('drf 가운뎃점·공백 정규화(U+00B7 = U+318D)', drf.normName('남녀고용평등과 일·가정 양립') === drf.normName('남녀고용평등과 일ㆍ가정양립 '));
  check('drf 조문 번호 읽기', ['제60조', '60조', '60', '제 60 조'].every((x) => drf.articleKey(x) === '제60조') && drf.articleKey('76조의2') === '제76조의2' && drf.articleKey('별표1의2') === '별표 1의2' && drf.articleKey('육십조') === null);
  const at = (d) => { const v = drf.versionAt(lsa, d); return v && `${v.mst}@${v.effective}`; };
  check(`drf 그날 시행 판(10.1=${at('20261001')}, 12.31=${at('20261231')}, 1.1=${at('20270101')})`, at('20261001') === '283457@20260820' && at('20261231') === '285279@20261208' && at('20270101') === '900001@20270101');
  const A = fixJson('law-285279-20261208.json').법령;
  const B = fixJson('law-285279-20270101.json').법령;
  const artsA = drf.articles(A);
  check(`drf 본문 파서(장 제목 뺌·별표 넣음: ${Object.values(artsA).map((x) => x.article).join(' ')})`,
    !Object.values(artsA).some((x) => /제1장/.test(x.text)) && Object.values(artsA).some((x) => x.article === '별표') && drf.findArticle(artsA, '제60조')?.text.startsWith('제60조(연차 유급휴가)\n①'));
  const ch = drf.compareArticles(artsA, drf.articles(B));
  const flag44 = [].concat(B.조문.조문단위).find((u) => u.조문번호 === '44' && u.조문가지번호 === '4')?.조문변경여부;
  check(`drf 판 비교 = ${ch.map((x) => x.article + x.kind).join(', ')} (제44조의4 조문변경여부=${flag44}, 삭제로 남은 제102조는 안 나옴)`,
    ch.map((x) => `${x.article}${x.kind}`).join() === '제43조의6개정,제44조의4신설,제54조개정,제116조개정' && flag44 !== 'Y');
}

if (tools.includes('get_law_article') && hasDrfFix) {
  const g = await callRules('get_law_article', { law: '근로기준법', article: '제60조', date: '2026-12-31' });
  const want = drf.findArticle(drf.articles(fixJson('law-285279-20261208.json').법령), '제60조');
  check(`get_law_article 원문 = 법제처 응답 그대로(${g.law} ${g.article}(${g.articleTitle}) ${g.version?.effective} 시행 판)`,
    g.ok && g.articleText === want.text && g.articleTitle === '연차 유급휴가' && g.version?.mst === '285279' && g.version.effective === '2026-12-08' && g.version.link.startsWith('https://www.law.go.kr/lsInfoP.do'));
  const g2 = await callRules('get_law_article', { law: '근로기준법', article: '44조의4', date: '2027-01-01' });
  check(`get_law_article 시행 예정 판의 신설 조문(${g2.article} · 판 ${g2.version?.mst})`, g2.ok && g2.article === '제44조의4' && g2.version?.mst === '900001');
  const gNo = await callRules('get_law_article', { law: '근로기준법', article: '제999조', date: '2026-12-31' });
  check(`get_law_article 없는 조문(${gNo.error})`, gNo.ok === false);
  const gUnknown = await callRules('get_law_article', { law: '가상법', article: '제1조' });
  check('get_law_article 못 찾은 법령은 이름 목록과 함께 오류', gUnknown.ok === false && Array.isArray(gUnknown.candidates));
  const gHtml = await callRules('get_law_article', { law: '근로기준법', article: '제60조' });
  check(`get_law_article 법제처 오류 화면은 주소 없이 오류로(${gHtml.error})`, gHtml.ok === false && /JSON 이 아닌/.test(gHtml.error));
  const gBad = await callRules('get_law_article', { law: '근로기준법', article: '육십조' });
  check('get_law_article 조문 번호 형식 오류', gBad.ok === false);
}
if (tools.includes('compare_law_versions') && hasDrfFix) {
  const cv = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-12-08', dateB: '2027-01-01' });
  check(`compare_law_versions ${JSON.stringify(cv.counts)} — ${cv.changes?.map((x) => x.article + x.kind).join(', ')}`,
    cv.ok && cv.changes?.map((x) => `${x.article}${x.kind}`).join() === '제43조의6개정,제44조의4신설,제54조개정,제116조개정'
    && cv.changes[1].before === null && cv.from?.mst === '285279' && cv.to?.mst === '900001' && cv.between?.length === 2);
  const cvLatest = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-12-08' });
  check(`compare_law_versions dateB 없으면 가장 늦은 판(${cvLatest.to?.mst}@${cvLatest.to?.effective})`, cvLatest.ok && cvLatest.to?.mst === '900001' && cvLatest.changes?.length === 4);
  const cv1 = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-12-08', dateB: '2027-01-01', article: '제54조' });
  check('compare_law_versions 조문 하나만', cv1.ok && cv1.changes?.length === 1 && cv1.changes[0].before !== cv1.changes[0].after);
  const cvBad = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2027-01-01', dateB: '2026-12-08' });
  check('compare_law_versions 날짜 거꾸로면 오류', cvBad.ok === false);
  const cvSame = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-12-08', dateB: '2026-12-09' });
  check('compare_law_versions 같은 판이면 바뀐 조문 없음', cvSame.ok && cvSame.changes?.length === 0);
}

if (tools.includes('list_law_revisions')) {
  const lr = await callRules('list_law_revisions', { from: '2026-01-01', to: '2026-12-31', workRulesOnly: true });
  check(`list_law_revisions 2026 취업규칙 관련 ${lr.count}건 · 시행 예정 ${lr.upcoming}건`, lr.ok && lr.count > 0 && lr.events.every((e) => e.date >= '2026-01-01' && e.date <= '2026-12-31' && e.workRules.length > 0));
  if (hasDrfFix) {
    check(`list_law_revisions 법제처 실시간 확인(${lr.live?.mode})`, lr.live?.ok === true && lr.source === '묶은 자료 + 법제처 실시간 확인');
    const lw = await callRules('list_law_revisions', { from: '2026-10-01', to: '2027-12-31', law: '근로기준법' });
    const ev = lw.events?.filter((e) => e.id === '001872-20270101') ?? [];
    check(`list_law_revisions 법령별 — 묶은 자료 뒤 공포분을 같은 시행일 개정에 붙임(${ev[0]?.addedPromulgations?.join()})`,
      lw.live?.ok && lw.live.laws?.includes('근로기준법') && ev.length === 1 && ev[0].addedPromulgations?.some((x) => x.includes('제99999호')));
    const lrec = await callRules('list_law_revisions', { from: '2026-10-01', to: '2027-12-31' });
    const stat = await callRules('list_law_revisions', { from: '2026-10-01', to: '2027-12-31', live: false });
    const nev = lrec.events?.find((e) => e.id === '006859-20270301');
    check(`list_law_revisions 최근 공포분 — 새 개정 1건 더함(${lrec.count} = 묶은 자료 ${stat.count} + 1: ${nev?.law})`,
      lrec.live?.ok && lrec.count === stat.count + 1 && !!nev?.source && nev.link.startsWith('https://www.law.go.kr/lsInfoP.do') && !lrec.events.some((e) => /항만법/.test(e.law)));
    check('list_law_revisions live:false 는 묶은 자료만', stat.source === '묶은 자료' && stat.live?.ok === false);
    const wr = drfCalls.filter((x) => x.target === 'eflaw' || !LAW_TARGETS.has(x.target));
    check(`가짜 법제처 요청(work-rules) ${wr.length}건 전부 OC·JSON·eflaw`, wr.length > 0 && wr.every((x) => x.oc && x.type === 'JSON' && x.target === 'eflaw'));
  }
  check('list_law_revisions 오늘(2026-10-21) 뒤는 시행 예정', lr.events.every((e) => (e.date > '2026-10-21') === e.when.startsWith('시행 예정')));
  if (inRepo) {
    const want = readJson('index.json').events.filter((e) => e.date >= '20260101' && e.date <= '20261231' && e.rules.length).length;
    check(`list_law_revisions 건수 = 자료(${want})`, lr.count === want);
  }
  const lb = await callRules('list_law_revisions', { from: '2026-10-01', to: '2026-10-31', law: '근로기준법', detail: true });
  check(`list_law_revisions 법령 거르기·요지(${lb.count}건)`, lb.ok && lb.events.every((e) => e.law.includes('근로기준법') && typeof e.summary === 'string' && Array.isArray(e.changes)));
  const bad = await callRules('list_law_revisions', { from: '2026-12-31', to: '2026-01-01' });
  check('list_law_revisions 기간 거꾸로면 오류', bad.ok === false);
}
if (tools.includes('check_work_rules_revisions')) {
  // ① 화면 예시 본문(RulesCheck.SAMPLE) — 화면 기본 기간 2025-01-01 ~ 오늘
  const ex = await callRules('check_work_rules_revisions', { text: SAMPLE ?? '제1조(목적) 시험', lastRevised: '2025-01-01', asOf: '2026-10-21' });
  console.log(`  예시 본문 집계: ${JSON.stringify(ex.counts)}`);
  check(`check_work_rules 예시 본문 조문 ${ex.articlesRead}개 읽음`, ex.ok && ex.articlesRead === (SAMPLE ? 6 : 1));
  if (siteEngine && SAMPLE) {
    const s = screenView(SAMPLE, '20250101', '20261021');
    check(`check_work_rules 예시 본문 = 화면 계산(집계·항목 ${s.items.length}개·놓친 개정·제93조·필수 조문)`, JSON.stringify(mcpView(ex)) === JSON.stringify(s));
  }
  check('check_work_rules 바꿀 문안에 최저 기준 안내(사이트 FLOOR_NOTE 와 같은 글)', !inRepo || ex.proposalNotice.split('십시오. ').every((p) => fs.readFileSync(path.join(repo, 'src/app/laws/RulesCheck.tsx'), 'utf8').includes(p)));
  check(`check_work_rules reportChanges ${ex.reportChanges?.length}건(조문·현행·개정안·근거)`, Array.isArray(ex.reportChanges) && ex.reportChanges.every((r) => r.article && typeof r.after === 'string'));
  // ② 표준취업규칙 2026 본문 자체(저장소 standard.json) — 2023-01-01 ~ 2027-12-31, 오늘 2026-10-21 (laws-upcoming-split 시험과 같은 조건)
  if (inRepo) {
    const stdText = readJson('standard.json').articles.map((a) => a.text).join('\n\n');
    const st = await callRules('check_work_rules_revisions', { text: stdText, lastRevised: '2023-01-01', asOf: '2027-12-31', includeOk: false });
    console.log(`  표준취업규칙 집계: ${JSON.stringify(st.counts)}`);
    const s = screenView(stdText, '20230101', '20271231');
    check(`check_work_rules 표준취업규칙 = 화면 계산(항목 ${s.items.length}개)`, JSON.stringify(mcpView(st)) === JSON.stringify(s));
    const soon = (st.items || []).filter((i) => i.status === '시행 예정');
    check(`check_work_rules 시행 예정 ${soon.length}건은 전부 오늘 뒤 시행`, soon.length > 0 && soon.every((i) => i.rules.filter((r) => r.required).every((r) => r.effective > '2026-10-21')));
  }
  // ③ 본문 없이 기간만 — 문안 묶음
  const empty = await callRules('check_work_rules_revisions', { lastRevised: '2025-01-01', asOf: '2026-10-21' });
  check(`check_work_rules 본문 없이 문안 묶음(${JSON.stringify(empty.counts)})`, empty.ok && '바꿀 조문' in empty.counts && !!empty.notice);
  if (siteEngine) check('check_work_rules 문안 묶음 = 화면 계산', JSON.stringify(mcpView(empty)) === JSON.stringify(screenView('', '20250101', '20261021')));
  const rev = await callRules('check_work_rules_revisions', { text: SAMPLE ?? '제1조(목적) 시험', lastRevised: '2026-10-21', asOf: '2026-10-21' });
  check(`check_work_rules 기간 오류(${rev.error})`, rev.ok === false);
  const noArt = await callRules('check_work_rules_revisions', { text: '조문 머리 없는 글입니다.', lastRevised: '2025-01-01' });
  check(`check_work_rules 조문 인식 실패면 점검 안 함`, noArt.ok === false && /조문을 인식하지/.test(noArt.error));
  const rrn = await callRules('check_work_rules_revisions', { text: '제1조(목적) 900101-1234568', lastRevised: '2025-01-01' });
  check('check_work_rules 주민번호 모양이면 점검 안 함', rrn.ok === false);
  // ④ refresh — 묶은 자료 뒤 공포분(가짜 법제처의 합성 2줄)만 따로 싣고, 자동 대조는 그대로
  if (hasDrfFix && SAMPLE) {
    const plain = await callRules('check_work_rules_revisions', { text: SAMPLE, lastRevised: '2025-01-01', asOf: '2027-12-31' });
    const fresh = await callRules('check_work_rules_revisions', { text: SAMPLE, lastRevised: '2025-01-01', asOf: '2027-12-31', refresh: true });
    const adds = (fresh.liveAdditions || []).map((x) => `${x.law}@${x.effective}`);
    check(`check_work_rules refresh — 묶은 자료 뒤 공포분 ${adds.join(', ')}(범위 밖·이미 있는 판은 뺌)`,
      adds.join() === '근로기준법@2027-01-01,근로기준법 시행규칙@2027-03-01' && !!fresh.liveNotice && fresh.liveAdditions[0].compare?.dateB === '2027-01-01' && !('liveAdditions' in plain));
    check('check_work_rules refresh 는 자동 대조 결과를 바꾸지 않음', JSON.stringify(mcpView(fresh)) === JSON.stringify(mcpView(plain)));
  }
}
if (tools.includes('check_work_rules_file')) {
  if (SAMPLE) {
    const txt = path.join(tmp, 'rules.txt');
    fs.writeFileSync(txt, SAMPLE);
    const viaFile = await callRules('check_work_rules_file', { filePath: txt, lastRevised: '2025-01-01', asOf: '2026-10-21' });
    const viaText = await callRules('check_work_rules_revisions', { text: SAMPLE, lastRevised: '2025-01-01', asOf: '2026-10-21' });
    check('check_work_rules_file txt = 글자 입력 결과', viaFile.ok && JSON.stringify(mcpView(viaFile)) === JSON.stringify(mcpView(viaText)) && viaFile.file?.kind === 'txt');
  }
  const fx = path.join(repo, 'tests/fixtures/laws');
  if (fs.existsSync(fx)) {
    const got = {};
    for (const k of ['hwp', 'hwpx']) {
      const r = await callRules('check_work_rules_file', { filePath: path.join(fx, `sample-rules.${k}`), lastRevised: '2025-01-01', asOf: '2026-10-21' });
      got[k] = r;
      check(`check_work_rules_file ${k} 읽음(조문 ${r.articlesRead}개${r.ok ? '' : ` · ${r.error}`})`, r.ok && r.articlesRead === 3);
    }
    check('check_work_rules_file hwp = hwpx 결과', JSON.stringify(mcpView(got.hwp)) === JSON.stringify(mcpView(got.hwpx)));
    // sample-rules.pdf 는 글자 쪽과 그림 쪽이 섞인 시험본 — 사이트도 일부만 점검하지 않고 거절한다(tests/unit/rules-check-pdf-runtime.test.ts)
    const mixed = await callRules('check_work_rules_file', { filePath: path.join(fx, 'sample-rules.pdf'), lastRevised: '2025-01-01', asOf: '2026-10-21' });
    check(`check_work_rules_file 글자·그림 섞인 pdf 는 사이트처럼 거절(${mixed.error?.slice(0, 50)}…)`, mixed.ok === false && /일부만 점검하지 않습니다/.test(mixed.error));
  }
  // 글자 pdf — 예시 본문을 나눔고딕으로 그린 합성 pdf
  if (SAMPLE && inRepo) {
    const { createRequire } = await import('node:module');
    const rq = createRequire(path.join(repo, 'package.json'));
    const { PDFDocument } = rq('pdf-lib');
    const doc = await PDFDocument.create();
    doc.registerFontkit(rq('@pdf-lib/fontkit'));
    const font = await doc.embedFont(fs.readFileSync(path.join(repo, 'public/fonts/NanumGothic-Regular.ttf')), { subset: false });
    const page = doc.addPage([595, 842]);
    SAMPLE.split('\n').forEach((l, i) => page.drawText(l.replace(/[①-⑳]/g, ''), { x: 30, y: 810 - i * 11, size: 8, font }));
    const pf = path.join(tmp, 'rules-text.pdf');
    fs.writeFileSync(pf, await doc.save());
    const viaPdf = await callRules('check_work_rules_file', { filePath: pf, lastRevised: '2025-01-01', asOf: '2026-10-21' });
    check(`check_work_rules_file 글자 pdf 읽음(조문 ${viaPdf.articlesRead}개${viaPdf.ok ? '' : ` · ${viaPdf.error}`})`, viaPdf.ok && viaPdf.articlesRead === 6 && viaPdf.file?.kind === 'pdf' && !!viaPdf.pdfNotice);
  }
  const none = await callRules('check_work_rules_file', { filePath: path.join(tmp, 'none.hwpx'), lastRevised: '2025-01-01' });
  check('check_work_rules_file 없는 파일은 오류', none.ok === false);
}
let fullReport = null;
if (tools.includes('make_work_rules_report_forms')) {
  const outDir = path.join(tmp, 'report');
  const empty = await callRules('make_work_rules_report_forms', { kind: 'change', workplace: {}, outDir });
  check(`report_forms 빈 칸이면 만들지 않음(${empty.blanks?.length}칸)`, empty.ok === false && empty.blanks?.includes('사업장명') && empty.blanks.includes('근로자수') && !fs.existsSync(outDir));
  // 합성 사업장 — 실재하지 않는 이름·번호
  const WP = { name: '가상상회', businessType: '소매업', ownerName: '김대표', bizNo: '000-00-00000', address: '서울특별시 가상구 가상로 1', tel: '02-000-0000', workers: 12, male: 7, female: 5, unionMembers: 0 };
  const CHANGES = [
    { article: '제40조(배우자 출산휴가)', before: '① 회사는 근로자가 배우자의 출산을 이유로 휴가를 청구하는 경우 10일의 유급휴가를 준다.', after: '① 회사는 근로자가 배우자의 출산을 이유로 휴가를 청구하는 경우 20일의 유급휴가를 준다.', note: '남녀고용평등법 제18조의2 (2025. 2. 23. 시행)' },
    { article: '제25조(휴일)', before: '① 주휴일은 일요일로 한다.\n② 근로자의 날은 유급휴일로 한다.', after: '① 주휴일은 일요일로 한다.\n② 노동절은 유급휴일로 한다.', note: '명칭 변경', disadvantage: true },
    ...(hasDrfFix ? [{ article: '제45조(연차 유급휴가)', before: '① 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 준다.', after: '① 회사는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 준다.', note: '문구 정리', lawRef: { law: '근로기준법', article: '제60조', date: '2026-12-31' } }] : []),
  ];
  const full = { kind: 'change', workplace: WP, opinionDate: '2026-10-20', office: '서울지방고용노동청 서울가상지청', writtenDate: '2026-10-21', changes: CHANGES, effectiveDate: '2026-11-01', outDir, formats: ['pdf', 'hwpx', 'docx', 'xlsx'] };
  fullReport = full;
  const bizBad = await callRules('make_work_rules_report_forms', { ...full, workplace: { ...WP, bizNo: '123' } });
  check(`report_forms 형식 오류면 만들지 않음(${bizBad.errors?.[0]})`, bizBad.ok === false && bizBad.errors?.length > 0 && !fs.existsSync(outDir));
  const sum = await callRules('make_work_rules_report_forms', { ...full, workplace: { ...WP, male: 6 } });
  check('report_forms 남·여 합이 근로자수와 다르면 오류', sum.ok === false);
  const mk = await callRules('make_work_rules_report_forms', full);
  const magic = (mk.files || []).map((f) => `${f.format}:${fs.readFileSync(f.path).subarray(0, 4).toString('latin1')}`);
  console.log(`  report_forms 파일: ${(mk.files || []).map((f) => path.basename(f.path)).join(', ')}`);
  check(`report_forms 변경신고 4종 10파일(신고서·대비표 4형식·의견청취서·동의서)`, mk.ok && mk.files?.length === 10 && !mk.skipped
    && magic.every((m) => (m.startsWith('pdf:') ? m === 'pdf:%PDF' : m.endsWith('PK\u0003\u0004'))));
  check(`report_forms 날인 필요 안내(${mk.sealRequired?.length}곳)`, mk.sealRequired?.length === 3 && mk.sealRequired.every((s) => s.startsWith('날인 필요')));
  check(`report_forms 제출 경로 안내(${mk.submit?.url})`, mk.submit?.url === 'https://labor.moel.go.kr/minwonApply/minwonApply.do?searchGubun=3');
  if (hasDrfFix) check(`report_forms lawRef — 근거 조문 원문을 법제처에서 받아 붙임(${JSON.stringify(mk.quoted)})`, mk.quoted?.length === 1 && mk.quoted[0].article === '제60조' && mk.quoted[0].effective === '2026-12-08' && !mk.warnings);
  const again = await callRules('make_work_rules_report_forms', full);
  check(`report_forms 덮어쓰지 않음(${again.exists?.length}개)`, again.ok === false && again.exists?.length === 10);
  const neu = await callRules('make_work_rules_report_forms', { ...full, kind: 'new', changes: [], majorityUnion: '가상노동조합', workplace: { ...WP, unionMembers: 8 }, outDir: path.join(tmp, 'report-new'), formats: undefined });
  check(`report_forms 최초 신고·과반수 노동조합(${neu.files?.length}파일, 대비표·동의서 없음)`, neu.ok && neu.files?.length === 4 && neu.files.every((f) => !/대비표|동의서/.test(f.path)));
  const rrnIn = await callRules('make_work_rules_report_forms', { ...full, agent: '900101-1234568', outDir: path.join(tmp, 'report-rrn') });
  check('report_forms 주민번호 모양이면 만들지 않음', rrnIn.ok === false && !fs.existsSync(path.join(tmp, 'report-rrn')));
  // 서류 글자 — 한글 파일을 다시 읽어 서식 문구·금지어를 본다(저장소 안에서만)
  if (inRepo && mk.ok) {
    const { createRequire } = await import('node:module');
    const JSZip = createRequire(path.join(repo, 'package.json'))('jszip');
    const hwpxText = async (f) => {
      const z = await JSZip.loadAsync(fs.readFileSync(f));
      return (await z.file('Contents/section0.xml').async('string')).replace(/<[^>]+>/g, ' ');
    };
    const docText = {};
    for (const f of mk.files.filter((x) => x.format === 'hwpx')) docText[path.basename(f.path)] = await hwpxText(f.path);
    const report = Object.entries(docText).find(([k]) => k.includes('신고서'))?.[1] ?? '';
    check('report_forms 신고서에 별지 제15호서식·[√] 변경신고서·의견청취일', /별지 제15호서식/.test(report) && /\[  \] 신고서\s+\[√\] 변경신고서/.test(report) && /2026년 10월 20일/.test(report) && /000-00-00000/.test(report));
    const consent = Object.entries(docText).find(([k]) => k.includes('동의서'))?.[1] ?? '';
    check('report_forms 동의서에 불리한 변경 조문·서명 빈 줄 12줄', /제25조\(휴일\)/.test(consent) && /제94조 제1항 단서/.test(consent) && (consent.match(/>\s*12\s*</g) || consent.includes(' 12 ')));
    if (hasDrfFix) {
      const cmp = Object.entries(docText).find(([k]) => k.includes('대비표'))?.[1] ?? '';
      // 한글 파일 안에서 「<개정 …>」 꼬리표는 &lt; 로 적히므로 그 앞까지 본다
      const want60 = drf.findArticle(drf.articles(fixJson('law-285279-20261208.json').법령), '제60조').text.split('\n')[1].split(' <')[0];
      check(`report_forms 대비표 아래 근거 법령 원문(법제처 2026. 12. 8. 시행 판 제60조 제1항 글자 그대로: ${want60.slice(0, 20)}…)·비고에서 가리킴`,
        /근거 법령 원문\(법제처 국가법령정보에서 받은 글자 그대로\)/.test(cmp) && /근로기준법 제60조 — 2026\. 12\. 8\. 시행 판/.test(cmp) && cmp.includes(want60) && cmp.includes('근거 법령 원문 1 참조'));
    }
    const hits = bannedIn(Object.values(docText).join('\n'));
    check(`report_forms 서류 글자 금지어 없음${hits.length ? ` (${hits.join(',')})` : ''}`, hits.length === 0);
  }
  console.log(`  report_forms 폴더: ${outDir}`);
}

// ── OC 없이 — 묶은 자료로만 답하고 LAW_OC 를 알려 준다(홈 폴더를 임시 폴더로 바꿔 ~/.claude/.env 도 읽지 않게) ──
if (tools.includes('get_law_article')) {
  const noOcEnv = { ...process.env, HOME: tmp, USERPROFILE: tmp };
  delete noOcEnv.LAW_OC;
  delete noOcEnv.LLG_DRF_BASE;
  const c2 = new Client({ name: 'smoke-no-oc', version: '0' });
  await c2.connect(spawn(noOcEnv, ['--groups', 'work-rules']));
  const l2 = await callRules('list_law_revisions', { from: '2026-01-01', to: '2026-12-31', workRulesOnly: true }, c2);
  check(`OC 없음 — list_law_revisions 는 묶은 자료로 답함(${l2.count}건, ${l2.live?.error?.slice(0, 40)}…)`, l2.ok && l2.count > 0 && l2.source === '묶은 자료' && /LAW_OC/.test(l2.live?.error ?? ''));
  const g2 = await callRules('get_law_article', { law: '근로기준법', article: '제60조' }, c2);
  check('OC 없음 — get_law_article 은 LAW_OC 를 알려 줌', g2.ok === false && /LAW_OC/.test(g2.error));
  const v2 = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-01-01' }, c2);
  check('OC 없음 — compare_law_versions 도 같음', v2.ok === false && /LAW_OC/.test(v2.error));
  const k2 = await callRules('check_work_rules_revisions', { lastRevised: '2025-01-01', asOf: '2026-10-21', refresh: true }, c2);
  check('OC 없음 — refresh 는 liveError 로 알리고 대조 결과는 그대로', k2.ok && /LAW_OC/.test(k2.liveError ?? '') && !k2.liveAdditions);
  if (fullReport && hasDrfFix) {
    const f2 = await callRules('make_work_rules_report_forms', { ...fullReport, outDir: path.join(tmp, 'report-no-oc'), formats: ['hwpx'] }, c2);
    check('OC 없음 — 서류는 만들고 원문을 못 붙였다고 알림', f2.ok && !f2.quoted && f2.warnings?.some((w) => /근거 조문 원문을 붙이지 못했습니다/.test(w)));
  }
  await c2.close();

  // 실제 법제처 — 이 셸에 LAW_OC 가 있을 때만 도구 두 번(목록 조회 2번 + 본문 3번)
  if (!REAL_OC) console.log('SKIP 실제 법제처 호출 — 이 셸에 LAW_OC 가 없습니다');
  else {
    const liveEnv = { ...process.env };
    delete liveEnv.LLG_DRF_BASE;
    const c3 = new Client({ name: 'smoke-live', version: '0' });
    await c3.connect(spawn(liveEnv, ['--groups', 'work-rules']));
    const g3 = await callRules('get_law_article', { law: '근로기준법', article: '제60조' }, c3);
    check(`실제 법제처 — 근로기준법 제60조(${g3.version?.effective} 시행 판, ${g3.articleText?.length}자${g3.ok ? '' : ` · ${g3.error}`})`, g3.ok && g3.articleText?.startsWith('제60조(연차 유급휴가)'));
    const v3 = await callRules('compare_law_versions', { law: '근로기준법', dateA: '2026-12-08', dateB: '2027-01-01' }, c3);
    check(`실제 법제처 — 2026. 12. 8. → 2027. 1. 1. 판 비교(${v3.changes?.map((x) => x.article + x.kind[0]).join(', ') ?? v3.error})`, v3.ok && v3.changes?.some((x) => x.article === '제44조의4' && x.kind === '신설'));
    await c3.close();
  }
}

// ── law 묶음(법제처 조회) — 가짜 법제처 고정 응답으로. 원문 칸(LAW_OPEN_TEXT_FIELDS)은 빼고 이 묶음이 쓴 글의 금지어를 본다 ──
if (tools.includes('search_laws') && hasDrfFix) {
  const { LAW_OPEN_TEXT_FIELDS } = await import('./lib/law-open.mjs');
  const OPEN_SKIP = new Set(LAW_OPEN_TEXT_FIELDS);
  const own = (v, key = '') => {
    if (OPEN_SKIP.has(key)) return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap((x) => own(x));
    if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => own(x, k));
    return [];
  };
  const callLaw = async (name, args, client = c) => {
    const j = await callJson(name, args, client);
    const h = bannedIn(own(j).join('\n'));
    check(`${name}: 이 묶음이 쓴 글 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
    return j;
  };
  const before = drfCalls.length;
  const sl = await callLaw('search_laws', { query: '근로기준법' });
  check(`search_laws(${sl.laws?.[0]?.law} ${sl.laws?.[0]?.lawId}, 판 화면 주소)`, sl.ok && sl.laws?.[0]?.lawId === '001872' && sl.laws[0].link?.startsWith('https://www.law.go.kr/lsInfoP.do'));
  const lf = await callLaw('list_law_forms', { law: '근로기준법 시행규칙', kind: '서식' });
  check(`list_law_forms(${lf.forms?.length}건, ${lf.forms?.[0]?.label} · 파일 주소)`, lf.ok && lf.forms?.[0]?.label === '별지 제8호서식' && lf.forms.every((x) => /^https:\/\/www\.law\.go\.kr\/LSW\/flDownload\.do\?flSeq=\d+$/.test(x.file)));
  const ah = await callLaw('get_article_history', { law: '근로기준법', article: '제60조' });
  check(`get_article_history(${ah.history?.length}판, 첫 판 ${ah.history?.[0]?.effective} ${ah.history?.[0]?.changeReason})`, ah.ok && ah.history?.[0]?.changeReason === '제정');
  const sp = await callLaw('search_precedents', { query: '통상임금' });
  check(`search_precedents(${sp.precedents?.[0]?.caseNo})`, sp.ok && sp.precedents?.[0]?.caseNo === '2023다216777' && sp.precedents[0].link?.includes('precSeq=608505'));
  const gp = await callLaw('get_precedent', { id: '608505' });
  check(`get_precedent(${gp.caseNo}, 판시사항 ${gp.holdings?.length}자, 전문 ${gp.fullText?.length}자)`, gp.ok && gp.holdings?.startsWith('[1] 통상임금') && gp.fullText?.length > 0);
  const gpNo = await callLaw('get_precedent', { id: '1' });
  check(`get_precedent 없는 번호(${gpNo.error})`, gpNo.ok === false);
  const si = await callLaw('search_interpretations', { query: '연차' });
  check(`search_interpretations 기본 고용노동부(${si.interpretations?.[0]?.caseNo})`, si.ok && si.source === 'moel' && si.interpretations?.[0]?.id === '15234');
  const gi = await callLaw('get_interpretation', { id: '325381', source: 'moleg' });
  check(`get_interpretation 법제처(${gi.caseNo})`, gi.ok && gi.caseNo === '07-0039' && gi.reason?.length > 0);
  const cc = await callLaw('check_citations', { text: '> [관련 판결] 대법원 2024. 12. 19. 선고 2023다216777 판결\n> 근로기준법 시행령 제6조 제1항은 통상임금을 "근로자에게 정기적이고 일률적으로 소정근로 또는 총근로' });
  check(`check_citations 법제처 전문 대조(${cc.rows?.[0]?.verdict})`, cc.ok && cc.rows?.[0]?.verdict === '일치' && cc.rows[0].source === '법제처');
  const rrn = await callLaw('search_precedents', { query: '900101-1234568' });
  const sent = drfCalls.slice(before);
  check('law 주민번호 모양 입력은 멈춤', rrn.ok === false && !sent.some((x) => (x.query ?? '').includes('900101')));
  check(`가짜 법제처 요청(law) ${sent.length}건 전부 OC·JSON`, sent.length > 0 && sent.every((x) => x.oc && x.type === 'JSON' && LAW_TARGETS.has(x.target)));

  // OC 없음 — 부르지 않고 LAW_OC 를 알린다
  const noOcEnv = { ...process.env, HOME: tmp, USERPROFILE: tmp };
  delete noOcEnv.LAW_OC;
  delete noOcEnv.LLG_DRF_BASE;
  const c4 = new Client({ name: 'smoke-law-no-oc', version: '0' });
  await c4.connect(spawn(noOcEnv, ['--groups', 'law']));
  const n4 = await callLaw('search_precedents', { query: '통상임금' }, c4);
  check('OC 없음 — law 묶음은 LAW_OC 를 알림', n4.ok === false && /LAW_OC/.test(n4.error));
  await c4.close();

  // 실제 법제처 — LAW_OC 가 있을 때만(목록 1번 + 본문 1번 + 해석 1번)
  if (!REAL_OC) console.log('SKIP 실제 법제처 호출(law) — 이 셸에 LAW_OC 가 없습니다');
  else {
    const liveEnv = { ...process.env };
    delete liveEnv.LLG_DRF_BASE;
    const c5 = new Client({ name: 'smoke-law-live', version: '0' });
    await c5.connect(spawn(liveEnv, ['--groups', 'law']));
    const p5 = await callLaw('search_precedents', { caseNo: '2023다216777' }, c5);
    check(`실제 법제처 — 판례 2023다216777 검색(${p5.precedents?.[0]?.id ?? p5.error})`, p5.ok && p5.precedents?.some((x) => x.caseNo === '2023다216777'));
    const q5 = await callLaw('search_precedents', { query: '통상임금 재직조건', display: 3 }, c5);
    check(`실제 법제처 — 판례 본문 검색 「통상임금 재직조건」 ${q5.total ?? q5.error}건`, q5.ok && q5.total > 0);
    const f5 = await callLaw('list_law_forms', { law: '고용보험법 시행규칙', limit: 3 }, c5);
    check(`실제 법제처 — 고용보험법 시행규칙 별표·서식 ${f5.total ?? f5.error}건(100개 넘는 목록을 쪽 넘겨 모음)`, f5.ok && f5.total > 100 && !f5.incomplete && f5.forms.every((x) => x.file?.includes('flDownload.do')));
    const i5 = await callLaw('search_interpretations', { query: '연차 사용촉진', display: 3 }, c5);
    check(`실제 법제처 — 고용노동부 해석 ${i5.total ?? i5.error}건`, i5.ok && i5.total > 0);
    await c5.close();
  }
}

// call 모드 — 셸에서 도구 하나를 부른다(로컬 스킬이 엔진을 부르는 통로). .cmd 설치본 시험에서는 건너뛴다
if (!/\.cmd$/i.test(target)) {
  const { spawnSync } = await import('node:child_process');
  const dir = path.join(tmp, '한글 호출');
  fs.mkdirSync(dir, { recursive: true });
  const argf = path.join(dir, '인자.json');
  const run = (tool = 'check_min_wage') => spawnSync(process.execPath, [target, 'call', tool, argf, '--groups', 'calc'], { encoding: 'utf8' });
  fs.writeFileSync(argf, JSON.stringify({ unit: 'hour', amount: 20000, year: 2026 }));
  const r1 = run();
  check('call — 한글 경로 인자 파일로 도구를 부르고 종료 코드 0', r1.status === 0 && JSON.parse(r1.stdout).ok === true);
  fs.writeFileSync(argf, JSON.stringify({ unit: 'hour', amount: 20000, year: 1990 }));
  const r2 = run();
  check('call — 도구가 ok:false 로 멈추면 종료 코드 1', r2.status === 1 && JSON.parse(r2.stdout).ok === false);
  fs.writeFileSync(argf, JSON.stringify({ amount: 'x' }));
  check('call — 입력 검사 실패도 종료 코드 1', run().status === 1);
  check('call — 없는 도구는 종료 코드 1', run('no_such_tool').status === 1);
  check('call — 인자 파일이 없으면 종료 코드 2', spawnSync(process.execPath, [target, 'call', 'check_min_wage', path.join(dir, '없음.json')], { encoding: 'utf8' }).status === 2);
  // JSON 이 아닌 인자 파일 — 파서 오류문은 파일 내용 조각을 싣는다(261120 적대 검토). 경로·위치·종류만 알리고 내용은 내보내지 않는다
  const MARK = 'SYNTHMARK7Q';
  fs.writeFileSync(argf, `${MARK} {`);
  const bad = run();
  check('call — JSON 이 아닌 인자 파일: 종료 코드 2 · 경로는 알리고 내용 조각은 싣지 않음', bad.status === 2 && bad.stderr.includes(argf) && !bad.stderr.includes(MARK) && !bad.stdout.includes(MARK));
  fs.writeFileSync(argf, `{"note": "${MARK}" oops}`);
  const bad2 = run();
  check('call — JSON 중간 오류: 위치만 알리고 내용 조각은 싣지 않음', bad2.status === 2 && /위치 \d+/.test(bad2.stderr) && !bad2.stderr.includes(MARK) && !bad2.stdout.includes(MARK));
  fs.writeFileSync(argf, String.fromCharCode(0xfeff) + JSON.stringify({ unit: 'hour', amount: 20000, year: 2026 }));
  check('call — BOM 이 붙은 인자 파일도 읽는다', run().status === 0);
}

// 빌드 출처 — server.mjs 옆 build-info.json(빌드 커밋·잠금파일·server.mjs 해시)과 --version 둘째 줄. .cmd 설치본 시험에서는 건너뛴다
if (!/\.cmd$/i.test(target)) {
  const { spawnSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  let info = null;
  try {
    info = JSON.parse(fs.readFileSync(path.join(path.dirname(target), 'build-info.json'), 'utf8'));
  } catch { /* 없음 */ }
  const v = spawnSync(process.execPath, [target, '--version'], { encoding: 'utf8' });
  const [v1 = '', v2 = ''] = v.stdout.trim().split(/\r?\n/);
  const KEYS = ['builtAt', 'commit', 'dirty', 'kLaborLockfileSha256', 'lockfileSha256', 'node', 'serverSha256', 'toegoSha256', 'version'];
  check('build-info.json 이 server.mjs 옆에 있고 칸이 9개', !!info && JSON.stringify(Object.keys(info).sort()) === JSON.stringify(KEYS));
  // 퇴고 가벼운 실행 파일 — 해시가 build-info 와 같고, MCP check_prose·check_norms·check_semantic·check_rhetoric 와 같은 판정을 낸다.
  // 의미범주·AI 수사는 키를 줄 때만 돈다. 이 시험에는 비공개 팩이 없으므로 키를 주면 불완전 → ok:false → 종료 코드 1,
  // 키를 주지 않으면 문체·공개 규범만 보고 종료 코드 0 이 맞다
  const toego = path.join(path.dirname(target), 'toego.mjs');
  check('build-info toegoSha256 = 지금 toego.mjs 의 sha256', fs.existsSync(toego) && info?.toegoSha256 === sha(fs.readFileSync(toego)));
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-labor-toego-'));
    const doc = '가상 회사는 이를 검토하였고, 도급인이 할수 있는 조치임 .\n결과를 가르는 것은 시간입니다.';
    const f = path.join(dir, 'a.json');
    fs.writeFileSync(f, JSON.stringify({ text: doc, genre: 'general' }));
    const t0 = spawnSync(process.execPath, [toego, f], { encoding: 'utf8' });
    let t0r = null;
    try { t0r = JSON.parse(t0.stdout); } catch { /* 아래 FAIL */ }
    check(`toego.mjs — 의미범주·AI 수사 키가 없으면 문체·공개 규범만(rc ${t0.status})`, t0.status === 0 && !!t0r && t0r.ok === true
      && !('semantic' in t0r) && !('rhetoric' in t0r));
    fs.writeFileSync(f, JSON.stringify({ text: doc, genre: 'general', semantic: { genre: 'general' }, rhetoric: {} }));
    const t = spawnSync(process.execPath, [toego, f], { encoding: 'utf8' });
    let tr = null;
    try { tr = JSON.parse(t.stdout); } catch { /* 아래 FAIL */ }
    const viaProse = await callNew('check_prose', { text: doc, genre: 'general' });
    const viaNorms = await callNew('check_norms', { text: doc });
    const viaSem = await callNew('check_semantic', { text: doc, genre: 'general' });
    const viaRh = await callNew('check_rhetoric', { text: doc });
    const noRef = (o) => JSON.stringify(o, (k, val) => (k === 'ref' ? undefined : val));
    check(`toego.mjs = MCP check_prose·check_norms·check_semantic·check_rhetoric (rc ${t.status})`, t.status === 1 && !!tr && tr.ok === false
      && noRef(tr.prose) === noRef(viaProse) && JSON.stringify(tr.norms) === JSON.stringify(viaNorms)
      && JSON.stringify(tr.semantic) === JSON.stringify(viaSem) && JSON.stringify(tr.rhetoric) === JSON.stringify(viaRh)
      && tr.semantic?.code === 'NO_PRIVATE_PACK' && tr.rhetoric?.code === 'NO_PRIVATE_PACK');
    fs.writeFileSync(f, JSON.stringify({ text: '가상 900101-1234567' }));
    const s = spawnSync(process.execPath, [toego, f], { encoding: 'utf8' });
    check('toego.mjs — 주민번호 모양이면 멈추고 종료 코드 1, 숫자를 되풀이하지 않음', s.status === 1 && /주민등록번호/.test(s.stdout) && !s.stdout.includes('1234567'));
    check('toego.mjs — 인자 파일이 없으면 종료 코드 2', spawnSync(process.execPath, [toego, path.join(dir, '없음.json')], { encoding: 'utf8' }).status === 2);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  check(`build-info version(${info?.version}) = --version 첫 줄(${v1}) · node(${info?.node}) · builtAt(${info?.builtAt})`,
    info?.version === v1 && /^\d+\.\d+\.\d+$/.test(v1) && /^v\d+\./.test(info?.node ?? '') && !Number.isNaN(Date.parse(info?.builtAt ?? '')));
  check('build-info serverSha256 = 지금 server.mjs 의 sha256', info?.serverSha256 === sha(fs.readFileSync(target)));
  check(`build-info 모양 — lockfileSha256(${String(info?.lockfileSha256).slice(0, 12)}) · commit(${String(info?.commit).slice(0, 12)}) · dirty(${info?.dirty})`,
    /^[0-9a-f]{64}$/.test(info?.lockfileSha256 ?? '') && (info?.commit === null || /^[0-9a-f]{40}$/.test(info?.commit ?? '')) && (info?.dirty === null || typeof info?.dirty === 'boolean') && /^[0-9a-f]{64}$/.test(info?.kLaborLockfileSha256 ?? ''));
  check('--version 첫 줄 = 맨 버전, 둘째 줄 = 커밋·server 해시 앞 12자·빌드 시각', v.status === 0 && !!info && v2.includes(info.serverSha256.slice(0, 12)) && v2.includes(info.builtAt)
    && (info.commit === null || v2.includes(info.commit.slice(0, 12))));
  const pkgDir = path.dirname(path.dirname(target));
  const strays = fs.readdirSync(pkgDir).filter((n) => /^\.?dist[.-](tmp|old)/.test(n));
  check(`빌드 임시·이전 폴더가 남지 않음${strays.length ? ` (${strays.join(', ')})` : ''}`, strays.length === 0);
}

await c.close();
mockDrf.close();
console.log(`tmp ${tmp}`);
console.log(fails.length ? `FAIL ${fails.length}건` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
