// 스모크 시험 — 합성 값만 쓴다(주민번호는 체크섬 맞춘 가상값). 실제 전송은 하지 않는다(confirm 없음).
//   node smoke.mjs                         → ./dist/server.mjs
//   node smoke.mjs <server.mjs 경로|.cmd>   → 설치본 시험
// 결과는 묶어서 PASS/FAIL 로 낸다. 팝빌 응답(잔액·발신번호)은 화면에 찍지 않는다.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] || fileURLToPath(new URL('./dist/server.mjs', import.meta.url));
const extra = process.argv.slice(3);
const transport = /\.cmd$/i.test(target)
  ? new StdioClientTransport({ command: 'cmd', args: ['/c', target, 'mcp', ...extra], env: process.env })
  : new StdioClientTransport({ command: process.execPath, args: [target, 'mcp', ...extra], env: process.env });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ilmunui-mcp-'));
const c = new Client({ name: 'smoke', version: '0' });
await c.connect(transport);
const fails = [];
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };
const callJson = async (name, args) => {
  const r = await c.callTool({ name, arguments: args });
  const t = r.content[0].text;
  check(`${name}: 응답에 가상 주민번호 없음`, !t.includes('9001011234568') && !t.includes('900101-1234568'));
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
await c.close();
console.log(`tmp ${tmp}`);
console.log(fails.length ? `FAIL ${fails.length}건` : 'ALL PASS');
process.exit(fails.length ? 1 : 0);
