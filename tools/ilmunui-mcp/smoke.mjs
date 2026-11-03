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
const REAL_OC = process.env.LAW_OC || null;
const MOCK_OC = 'synthetic-smoke-oc';
const drfFix = fileURLToPath(new URL('../../tests/fixtures/laws/drf/', import.meta.url));
const hasDrfFix = fs.existsSync(drfFix);
const DRF_LAW_FILES = { '285279-20261208': 'law-285279-20261208.json', '285279-20270101': 'law-285279-20270101.json', '900001-20270101': 'law-285279-20270101.json' };
const drfCalls = [];
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ilmunui-mcp-'));
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
  const h = bannedIn(t);
  check(`${name}: 응답 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
  return JSON.parse(t);
};

const ANN = {
  design_contract_wage: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  check_contract: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  make_contract_files: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  ...Object.fromEntries(['check_min_wage', 'calc_weekly_holiday_pay', 'count_regular_workers', 'calc_take_home_pay', 'calc_notice_pay', 'calc_leave_pay']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, openWorldHint: false }])),
  ...Object.fromEntries(['list_law_revisions', 'get_law_article', 'compare_law_versions', 'check_work_rules_revisions', 'check_work_rules_file']
    .map((n) => [n, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }])),
  make_work_rules_report_forms: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};
for (const t of (await c.listTools()).tools.filter((x) => ANN[x.name])) {
  const a = t.annotations || {};
  const same = Object.entries(ANN[t.name]).every(([k, v]) => a[k] === v);
  console.log(`  ${t.name} | ${t.title} | ro=${a.readOnlyHint} destr=${a.destructiveHint} idem=${a.idempotentHint} open=${a.openWorldHint}`);
  check(`${t.name}: title·annotations`, !!t.title && same);
  const h = bannedIn(`${t.title} ${t.description} ${JSON.stringify(t.inputSchema)}`);
  check(`${t.name}: 이름·설명·입력 설명 금지어 없음${h.length ? ` (${h.join(',')})` : ''}`, h.length === 0);
}

// 의정부 표본(합성) — 주4 월화수목 10:00~22:00 휴게 155분, 공휴일 22일, 월 260만원, 5명 이상.
// 기대값 = tests/unit/contract-write-design.test.ts 「의정부 주4」
const UIJ = { monthlyTotal: 2_600_000, workDays: ['월', '화', '수', '목'], start: '10:00', end: '22:00', breakMinutes: 155, holidayDaysPerYear: 22, fivePlus: true, startDate: '2026-11-01', writtenDate: '2026-11-01' };
const PAPER = { workplaceName: '가상상회', ownerName: '김대표', location: '경기 의정부시 가상로 1', duty: '매장 관리' };
if (tools.includes('design_contract_wage')) {
  const d = await callTool('design_contract_wage', UIJ);
  const amt = Object.fromEntries((d.items || []).map((i) => [i.key, i.amount]));
  const want = { base: 1_870_364, overtime: 414_013, holiday: 243_879, leave: 71_744 };
  check(`design 의정부 항목 금액 ${JSON.stringify(amt)}`, JSON.stringify(amt) === JSON.stringify(want));
  check(`design 의정부 통상시급 ${d.ordinaryHourly}(${d.ordinaryHourlyText})`, d.ordinaryHourly === 11_209.99 && d.ordinaryHourlyText === '11,209.99원');
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
}
if (tools.includes('calc_take_home_pay')) {
  const t = await callTool('calc_take_home_pay', { pay: 3_000_000, meal: 200_000, date: '2026-10-28' });
  const r = t.result || {};
  const got = [r.nps, r.health, r.ltc, r.employment, r.tax?.incomeTax, r.tax?.localTax, r.takeHome];
  check(`take_home C01 300만·식대 20만 ${JSON.stringify(got)}`, JSON.stringify(got) === JSON.stringify([133_000, 100_660, 13_220, 25_200, 56_800, 5_680, 2_665_440]));
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
  check(`leave_pay 260만 ÷ 209 × 8 × 5 = 497,607(${l.headline?.[0]})`, l.result?.hours === 209 && l.result?.amount === 497_607);
  const u5 = await callTool('calc_leave_pay', { timing: 'employed', fivePlus: false, weeklyHours: 40, dailyHours: 8, rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 }, asOf: '2026-10-29' });
  check('leave_pay 4명 이하는 계산하지 않음', u5.result?.status === 'under5' && u5.result.amount === null);
  const err = await callTool('calc_leave_pay', { timing: 'employed', fivePlus: true, weeklyHours: 40, dailyHours: 8, rate: { basis: 'ordinary-wage', unit: 'month', amount: 2_600_000 }, asOf: '2026-10-29' });
  check(`leave_pay 일수 없으면 오류(${err.error})`, err.ok === false && !!err.error);
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
    check(`가짜 법제처 요청 ${drfCalls.length}건 전부 OC·JSON·eflaw`, drfCalls.length > 0 && drfCalls.every((x) => x.oc && x.type === 'JSON' && x.target === 'eflaw'));
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

await c.close();
mockDrf.close();
console.log(`tmp ${tmp}`);
console.log(fails.length ? `FAIL ${fails.length}건` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
