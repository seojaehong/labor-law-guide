// contract 묶음 — 근로계약서 임금 구성 설계 · 근로계약서 점검 · 계약서 파일(xlsx·hwpx·pdf) 만들기.
// 사이트와 같은 엔진과 같은 입력 검증을 그대로 불러온다 — 계산·문구가 사이트와 한 벌로 유지된다.
//   설계·점검 되먹임: src/lib/contract-write(+ 입력 해석 src/app/tools/contract-write/formState.toWriteForm)
//   점검: src/lib/contract-check + 오프라인판 src/offline/contract-check(check·detailFor·validateInput)
// ★ 주민등록번호를 받지 않는다. 근로자 이름은 선택(없으면 「근로자」).
// ★ design_contract_wage·check_contract 는 읽기 전용이라 원격판에도 실을 수 있다(contractRemoteSafe).
//   make_contract_files 는 이 PC 에 파일을 쓰므로 로컬 전용이다(contractLocalOnly).
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { absorbOptions, INITIAL, toWriteForm } from '@/app/tools/contract-write/formState';
import { designFromForm, publicText, rateText, reviewWritten, WEEK_DAYS } from '@/lib/contract-write/contract';
import { ITEM_LABEL } from '@/lib/contract-write/design';
import { buildContractDocument } from '@/lib/contract-write/document';
import { buildContractHwpx, buildContractPdf, buildContractXlsx } from '@/lib/contract-write/export';
import { countByStatus, RESULT_DISCLAIMER, ruleName, sortFindings, STATUS_CHIP_ORDER, STATUS_LABEL } from '@/lib/contract-check/present';
import { blankTemplate, check, detailFor, validateInput } from '@/offline/contract-check/entry';
import { looksLikeRrn, text } from '../lib/common.mjs';

export const contractTools = ['design_contract_wage', 'check_contract', 'make_contract_files'];
/** 원격(HTTP)판에 실어도 되는 도구 — 읽기 전용, 파일·네트워크를 건드리지 않는다 */
export const contractRemoteSafe = ['design_contract_wage', 'check_contract'];
/** 이 PC 에 파일을 쓰는 도구 — 원격판에서 뺀다 */
export const contractLocalOnly = ['make_contract_files'];

const SITE = 'https://yellowenvelope.kr';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// 계약서 PDF 글꼴 — 사이트와 같은 나눔고딕 전체(OFL). 묶은 뒤에는 dist/server.mjs 하나라 here = dist/ 다.
const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_FONT = 'NanumGothic-Regular.ttf';
function fontPath() {
  const root = process.env.LLG_ROOT;
  return root ? path.join(root, 'public/fonts', PDF_FONT) : path.join(here, 'assets', PDF_FONT);
}

// ── 입력 ──────────────────────────────────────────────
// 화면 입력(WriteState)은 문자열 칸이다. 도구는 숫자·불리언으로 받아 같은 칸으로 옮긴 뒤 toWriteForm 으로 검증한다(사이트와 같은 검증).
const DAY = z.enum(WEEK_DAYS);
const ITEM_KEYS = Object.keys(ITEM_LABEL);
const formShape = {
  payType: z.enum(['monthly', 'hourly']).optional().describe('monthly(기본) = 월 임금 총액을 항목으로 나눈다 · hourly = 시급·일급 파트, 시간당 지급액 × 휴게 포함 출근~퇴근 시간(하루 지급액)을 나눈다'),
  monthlyTotal: z.number().optional().describe('월급제 — 월 임금 총액(세전, 원)'),
  netPay: z.number().optional().describe('월급제에서 총액 대신 월 실수령액(원)으로 넣을 때. 4대보험 근로자 몫·간이세액표 소득세·지방소득세를 빼고 이 금액 이상이 되는 가장 작은 총액을 찾는다(비과세 없음)'),
  family: z.number().optional().describe('netPay 를 쓸 때 공제대상가족 수(본인 포함, 기본 1)'),
  hourlyWage: z.number().optional().describe('hourly — 시간당 지급액(원)'),
  absentWeekHoliday: z.enum(['deduct', 'keep']).optional().describe('hourly — 결근한 주에 미리 준 주휴수당을 공제한다(deduct, 기본) / 공제하지 않는다(keep)'),
  workDays: z.array(DAY).describe('근무 요일(예: ["월","화","수","목"])'),
  start: z.string().describe('출근 시각 HH:MM'),
  end: z.string().describe('퇴근 시각 HH:MM(출근보다 이르면 자정을 넘긴 근무)'),
  breakMinutes: z.number().describe('하루 휴게시간(분)'),
  weeklyRestDay: DAY.optional().describe('주휴일 요일(기본 일). 근무 요일과 겹치면 안 된다'),
  holidayDaysPerYear: z.number().optional().describe('연간 공휴일 근무 예정 일수(주 5일 기준, 기본 0). 주 4일 이하면 근무일 비율로 줄인다'),
  fivePlus: z.boolean().optional().describe('상시 5명 이상 사업장(기본 true). false 면 연장·야간 가산, 공휴일 유급휴일, 연차를 넣지 않는다'),
  rounding: z.enum(['won', 'ceil10', 'ceil100']).optional().describe('잔액을 받지 않는 항목 금액 단위 — won(원 단위 반올림, 기본) · ceil10 · ceil100(그 단위로 올림)'),
  absorbInto: z.enum(ITEM_KEYS).optional().describe(`끝에 남는 금액을 받는 항목(기본 base). 월급제: base·overtime·night·holiday·leave, 파트: 여기에 weeklyHoliday 도 된다. 이름: ${Object.entries(ITEM_LABEL).map(([k, v]) => `${k}=${v}`).join(', ')}`),
  overrides: z.object({
    overtimeHours: z.number().optional(),
    holidayHours: z.number().optional(),
    leaveHours: z.number().optional(),
  }).optional().describe('월급제 — 계약서에 이미 정한 월 연장·휴일·연차 시간이 있으면 그 값을 쓴다(가산 반영 시간)'),
  probation: z.object({
    months: z.number().describe('수습 개월 수'),
    reduced: z.boolean().optional().describe('처음 3개월 임금을 최저임금의 100분의 90 으로 정한다'),
    simpleLabor: z.boolean().optional().describe('단순노무업무 고시 직종(감액할 수 없다)'),
  }).optional(),
  startDate: z.string().describe('계약 시작일 YYYY-MM-DD(최저임금 비교 연도도 이 날짜로 정한다)'),
  endDate: z.string().optional().describe('계약 종료일 YYYY-MM-DD. 비우면 기간의 정함이 없음'),
  writtenDate: z.string().optional().describe('계약서 작성일 YYYY-MM-DD(기본 오늘)'),
  workplaceName: z.string().optional().describe('사업체명'),
  ownerName: z.string().optional().describe('대표자 이름'),
  employeeName: z.string().optional().describe('근로자 이름(선택, 없으면 「근로자」). 주민등록번호는 받지 않는다'),
  location: z.string().optional().describe('근무장소'),
  duty: z.string().optional().describe('업무'),
  payday: z.string().optional().describe(`임금 지급일(기본 「${INITIAL.payday}」)`),
  paymentMethod: z.string().optional().describe(`지급 방법(기본 「${INITIAL.paymentMethod}」)`),
};

/** 계약서에만 필요한 글 칸 — 설계는 이 칸 없이도 계산한다 */
const PAPER_FIELDS = [['workplaceName', '사업체명'], ['location', '근무장소'], ['duty', '업무']];
const PLACEHOLDER = '미정';

const str = (n) => (n === undefined || n === null ? '' : String(n));

/** 도구 입력 → 화면 입력(WriteState). fillPaper = 계약서 글 칸이 비면 「미정」으로 채워 설계만 계산한다 */
function toState(a, fillPaper) {
  const paper = (k) => (a[k] ?? '').trim() || (fillPaper ? PLACEHOLDER : '');
  return {
    ...INITIAL,
    workplaceName: paper('workplaceName'),
    ownerName: a.ownerName ?? '',
    fivePlus: a.fivePlus === false ? 'no' : 'yes',
    employeeName: (a.employeeName ?? '').trim() || '근로자',
    startDate: a.startDate ?? '',
    endDate: a.endDate ?? '',
    writtenDate: a.writtenDate ?? '',
    location: paper('location'),
    duty: paper('duty'),
    probation: a.probation ? 'yes' : 'none',
    probationMonths: str(a.probation?.months ?? 3),
    probationReduced: a.probation?.reduced ? 'yes' : 'no',
    simpleLabor: a.probation?.simpleLabor ? 'yes' : 'no',
    workDays: a.workDays ?? [],
    start: a.start ?? '',
    end: a.end ?? '',
    breakMinutes: str(a.breakMinutes),
    weeklyRestDay: a.weeklyRestDay ?? '일',
    payType: a.payType ?? 'monthly',
    amountMode: a.netPay != null ? 'net' : 'gross',
    monthlyTotal: str(a.monthlyTotal),
    netPay: str(a.netPay),
    family: str(a.family ?? 1),
    hourlyWage: str(a.hourlyWage),
    absentWeekHoliday: a.absentWeekHoliday ?? 'deduct',
    holidayDaysPerYear: str(a.holidayDaysPerYear ?? 0),
    overtimeHours: str(a.overrides?.overtimeHours),
    holidayHours: str(a.overrides?.holidayHours),
    leaveHours: str(a.overrides?.leaveHours),
    rounding: a.rounding ?? 'won',
    absorbInto: a.absorbInto ?? 'base',
    payday: a.payday ?? INITIAL.payday,
    paymentMethod: a.paymentMethod ?? INITIAL.paymentMethod,
  };
}

/** 입력 → 설계·되먹임·계약서 본문. 사이트 ContractWriteClient 와 같은 순서(toWriteForm → designFromForm → reviewWritten → buildContractDocument) */
function compute(a, { fillPaper }) {
  const payType = a.payType ?? 'monthly';
  if (payType === 'monthly' && a.netPay != null && a.monthlyTotal != null) {
    return { ok: false, error: 'monthlyTotal(총액)과 netPay(실수령액) 중 하나만 넣어 주세요.' };
  }
  const absorb = a.absorbInto ?? 'base';
  const state = toState(a, fillPaper);
  // 화면과 같이 근무형태로 시간이 생기는 항목만 고를 수 있다
  const options = absorbOptions(state);
  if (!options.some((o) => o.value === absorb)) {
    return { ok: false, error: `absorbInto 는 ${options.map((o) => `${o.value}(${o.label})`).join(', ')} 가운데 하나입니다.` };
  }
  const paperMissing = PAPER_FIELDS.filter(([k]) => !(a[k] ?? '').trim()).map(([, label]) => label);
  const parsed = toWriteForm(state);
  if (!parsed.form) {
    return parsed.missing.length
      ? { ok: false, missing: parsed.missing, error: `비었거나 형식이 맞지 않는 칸: ${parsed.missing.join(', ')}` }
      : { ok: false, error: parsed.error };
  }
  try {
    const design = designFromForm(parsed.form);
    const review = reviewWritten(parsed.form, design);
    return { ok: true, form: parsed.form, design, review, netNote: parsed.netNote, paperMissing, doc: buildContractDocument(parsed.form, design) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

/** 설계 결과 요약 — 사이트 화면의 표와 같은 값 */
function designSummary(form, design) {
  const day = design.period === 'day';
  return {
    period: day ? '하루(시급·일급 파트)' : '한 달',
    total: design.total,
    ...(day ? { monthlyEstimate: Math.round(design.total * form.workDays.length * 4.345), monthlyEstimateNote: `주 ${form.workDays.length}일 × 4.345주, 실제 근무일 기준으로 지급` } : {}),
    totalHours: r4(design.totalHours),
    ordinaryHourly: r2(design.rate),
    ordinaryHourlyText: `${rateText(design.rate)}원`,
    items: design.items.map((i) => ({ key: i.key, label: i.label, hours: r4(i.hours), amount: i.amount, beforeRounding: r2(i.exact), absorbsRemainder: i.absorbs })),
  };
}

/** 점검 되먹임(checkWritten) 한 줄 — 사이트와 같이 「규칙 이름: 설명」, 「포괄」은 「임금 구성」으로 */
const reviewLine = (f) => ({
  status: STATUS_LABEL[f.status],
  rule: publicText(ruleName(f.rule_code)),
  detail: f.detail == null ? null : publicText(f.detail),
  statute: f.statute == null ? null : publicText(f.statute),
});

const fail = (r) => text({ ok: false, ...(r.missing ? { missing: r.missing } : {}), error: r.error });

// ── 점검 ──────────────────────────────────────────────

/** 점검 입력에서 rrn_masked 칸을 뺀다 — 엔진이 쓰지 않는 칸이고, 이 도구는 주민등록번호를 다루지 않는다 */
function dropRrnField(data) {
  const strip = (c) => {
    if (c && typeof c === 'object' && c.employee && typeof c.employee === 'object' && 'rrn_masked' in c.employee) {
      const { rrn_masked: _drop, ...employee } = c.employee;
      return { ...c, employee };
    }
    return c;
  };
  if (Array.isArray(data)) return data.map(strip);
  if (data && typeof data === 'object' && Array.isArray(data.contracts)) return { ...data, contracts: data.contracts.map(strip) };
  return strip(data);
}

export function registerContract(server) {
  // ── 임금 구성 설계(읽기 전용) ──
  server.registerTool(
    'design_contract_wage',
    {
      title: '근로계약서 임금 구성 설계',
      description:
        '근로계약서에 적을 임금 구성을 계산한다. 월 임금 총액(또는 월 실수령액)이나 시급·일급 파트의 시간당 지급액과 근무 요일·출퇴근 시각·휴게·공휴일 근무 일수로 기본급(주휴 포함)·주휴·연장·야간·휴일·연차 항목의 월(파트는 하루) 시간과 금액, 통상시급을 낸다. ' +
        '만든 설계를 일의 무늬 근로계약서 점검 규칙으로 다시 돌린 결과(손볼 항목·최저임금 한 줄)와 입력 오류도 함께 돌려준다. 사이트 /tools/contract-write 와 같은 엔진·같은 입력 검증이다. ' +
        '사업체명·근무장소·업무가 없어도 금액은 계산한다(계약서 파일을 만들 때는 필요하다). 파일은 만들지 않는다 — 파일은 make_contract_files.',
      inputSchema: formShape,
      annotations: READ_ONLY,
    },
    async (a) => {
      const r = compute(a, { fillPaper: true });
      if (!r.ok) return fail(r);
      return text({
        ok: true,
        ...designSummary(r.form, r.design),
        ...(r.netNote ? { netNote: r.netNote } : {}),
        minimumWage: r.review.minimumWage,
        review: {
          title: '근로계약서 점검 규칙으로 다시 본 결과',
          summary: r.review.problems.length ? `손볼 항목 ${r.review.problems.length}개` : '손볼 항목이 없습니다.',
          items: r.review.problems.map(reviewLine),
        },
        ...(r.paperMissing.length ? { contractFieldsMissing: r.paperMissing, contractFieldsNote: '계약서 파일(make_contract_files)을 만들려면 이 칸을 넣어 주세요.' } : {}),
        note: '연장·휴일 시간은 근무형태로 미리 정한 월 예정 시간입니다. 실제 근로가 이를 넘으면 넘는 시간의 수당을 따로 지급해야 합니다.',
        site: `${SITE}/tools/contract-write`,
      });
    },
  );

  // ── 근로계약서 점검(읽기 전용) ──
  server.registerTool(
    'check_contract',
    {
      title: '근로계약서 점검',
      description:
        '근로계약서 내용을 일의 무늬 근로계약서 점검 규칙으로 본다(사이트 /tools/contract-check 와 같은 엔진, 오프라인판과 같은 입력 모양). ' +
        'contract 에 계약 객체 1건이나 그 목록을 넣는다. 주요 칸: workplace{name,employee_count_5plus} · employee{name,hire_date,is_minor,employment_type} · period{start_date,end_date,indefinite,probation{applied,months,wage_rate_pct,simple_labor_job}} · job{location,duty} · ' +
        'work_time{days_per_week,start,end,breaks[{minutes}],daily_schedules[{day,start,end}],night_work} · wage{monthly_total,pay_type(hourly|monthly),items[{code,label,amount,basis_hours,rate_multiplier,basis_text,includes_weekly_holiday}],payday,payment_method} · ' +
        'holidays_leave{weekly_rest,weekly_rest_day_specified,annual_leave_clause} · signatures{written_date,employer_signed,employee_signed,copy_delivered_confirmed}. 모르는 값은 null. ' +
        '항목 code: BASE·WEEKLY_HOLIDAY·OT_WEEKDAY·OT_WEEKEND·ANNUAL_LEAVE·HOLIDAY_EXTRA·NIGHT·MEAL·BONUS·OTHER. contract 를 비우면 빈 양식을 돌려준다. 주민등록번호는 받지 않는다.',
      inputSchema: {
        contract: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]).optional().describe('계약 객체 1건 또는 목록(비우면 빈 양식을 돌려준다)'),
      },
      annotations: READ_ONLY,
    },
    async ({ contract }) => {
      if (contract === undefined) {
        return text({ ok: true, template: blankTemplate(), next: '값을 채워 contract 로 다시 부르세요. 모르는 값은 null 로 둡니다.' });
      }
      if (looksLikeRrn(JSON.stringify(contract))) {
        return text({ ok: false, error: '입력에 주민등록번호 모양의 숫자가 있어 점검하지 않았습니다. 이 도구는 주민등록번호를 받지 않습니다 — 지우고 다시 넣어 주세요.' });
      }
      const data = dropRrnField(contract);
      const v = validateInput(data);
      if (v.errors.length) return text({ ok: false, error: '점검하지 않았습니다. 아래 칸을 고쳐 주세요.', errors: v.errors, warnings: v.warnings });
      let results;
      try {
        results = check(data);
      } catch (e) {
        return text({ ok: false, error: `점검 중 오류가 났습니다: ${e instanceof Error ? e.message : String(e)}` });
      }
      return text({
        ok: true,
        ...(v.warnings.length ? { warnings: v.warnings } : {}),
        results: results.map((r) => {
          const counts = countByStatus(r.findings);
          return {
            contractId: r.contract_id || '(번호 없음)',
            counts: Object.fromEntries(STATUS_CHIP_ORDER.map((s) => [STATUS_LABEL[s], counts[s]])),
            findings: sortFindings(r.findings).map((f) => {
              const detail = detailFor(r, f);
              const amend = r.amendments[f.rule_code];
              return {
                status: STATUS_LABEL[f.status],
                rule: publicText(ruleName(f.rule_code)),
                statute: f.statute == null ? null : publicText(f.statute),
                detail: detail == null ? null : publicText(detail),
                ...(amend ? { amendment: publicText(amend) } : {}),
              };
            }),
          };
        }),
        disclaimer: RESULT_DISCLAIMER,
        site: `${SITE}/tools/contract-check`,
      });
    },
  );

  // ── 계약서 파일(쓰기, 로컬 전용) ──
  const FORMATS = ['xlsx', 'hwpx', 'pdf'];
  server.registerTool(
    'make_contract_files',
    {
      title: '근로계약서 파일 만들기(로컬 전용)',
      description:
        'design_contract_wage 와 같은 입력으로 임금 구성을 다시 계산해 근로계약서를 엑셀(xlsx)·한글(hwpx)·PDF 로 outDir 에 저장한다(사이트 /tools/contract-write 와 같은 서식). ' +
        '사업체명·근무장소·업무가 필요하다. 이미 있는 파일은 덮어쓰지 않는다. 이 PC 에 파일을 쓰는 로컬 전용 도구다. 주민등록번호는 받지 않는다.',
      inputSchema: {
        ...formShape,
        outDir: z.string().describe('저장할 폴더(없으면 만든다)'),
        fileBase: z.string().optional().describe('파일 이름(확장자 없이). 기본 「근로계약서_근로자이름」'),
        formats: z.array(z.enum(FORMATS)).optional().describe('만들 형식(기본 xlsx·hwpx·pdf 셋 다)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (a) => {
      const { outDir, fileBase, formats } = a;
      const r = compute(a, { fillPaper: false });
      if (!r.ok) return fail(r);
      const want = [...new Set(formats?.length ? formats : FORMATS)];
      const base = (fileBase?.trim() || `근로계약서_${r.form.employeeName}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
      const target = (ext) => path.join(outDir, `${base}.${ext}`);
      const exists = want.map(target).filter((p) => fs.existsSync(p));
      if (exists.length) return text({ ok: false, error: '이미 있는 파일은 덮어쓰지 않습니다. fileBase 나 outDir 를 바꿔 주세요.', exists });

      const files = [];
      const skipped = [];
      fs.mkdirSync(outDir, { recursive: true });
      for (const ext of want) {
        try {
          let bytes;
          if (ext === 'xlsx') bytes = await buildContractXlsx(r.doc);
          else if (ext === 'hwpx') bytes = await buildContractHwpx(r.doc);
          else bytes = await buildContractPdf(r.doc, new Uint8Array(fs.readFileSync(fontPath())));
          fs.writeFileSync(target(ext), bytes);
          files.push({ format: ext, path: target(ext), bytes: bytes.length });
        } catch (e) {
          skipped.push({ format: ext, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return text({
        ok: files.length > 0,
        files,
        ...(skipped.length ? { skipped } : {}),
        total: r.design.total,
        ordinaryHourlyText: `${rateText(r.design.rate)}원`,
        minimumWage: r.review.minimumWage,
        review: r.review.problems.length ? r.review.problems.map(reviewLine) : '손볼 항목이 없습니다.',
        check: '서명하기 전에 파일을 열어 사업장·근로자 정보와 금액을 확인하세요.',
      });
    },
  );
}
