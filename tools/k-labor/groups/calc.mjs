// calc 묶음 — 사이트 계산기 엔진(src/lib/calc·src/lib/headcount-plan)을 그대로 불러 쓰는 순수 계산 도구.
// 결과 문장은 사이트가 쓰는 문구 모듈(src/app/tools/*/copy.ts)이 있으면 그것을, 없으면 사이트 화면 문장을 옮겨 쓴다.
// ★ 전부 읽기 전용이다. 파일·네트워크를 건드리지 않고 주민등록번호를 받지 않는다 — 원격판에 그대로 실을 수 있다(calcRemoteSafe).
import { z } from 'zod';
import { rateOn } from '@/content/rates';
import { checkMinWage } from '@/lib/calc/min-wage';
import { calcWeeklyHoliday } from '@/lib/calc/weekly-holiday';
import { calcTakeHomePay, takeHomeRatesOn } from '@/lib/calc/take-home-pay';
import { WITHHOLDING_REVISION } from '@/lib/calc/wage-withholding-2026-02-27';
import { calcNoticePay } from '@/lib/calc/notice-pay';
import { calcLeavePay } from '@/lib/calc/leave-pay';
import { answerPlan, explainDate, parseIsoDate } from '@/lib/headcount-plan';
import { todayKst } from '@/lib/tool-kit';
import { headline as hcHeadline, whyLines as hcWhy, leaveLines as hcLeave, tenLine as hcTen, basisLine as hcBasis } from '@/app/tools/headcount/copy';
import { headline as thHeadline, items as thItems, formulaLines as thFormula, NOTICE as TH_NOTICE } from '@/app/tools/take-home-pay/copy';
import { headline as lpHeadline, formulaLines as lpFormula, effectLines as lpEffect } from '@/app/tools/leave-pay/copy';
import { calcSeverance } from '@/lib/calc/severance';
import { calcHolidayPay } from '@/lib/holiday-pay';
import { calcProration, calcAbsence } from '@/lib/calc/pay-proration';
import {
  headline as ppHeadline, effectLines as ppEffect, methodLines as ppMethods, formulaLines as ppFormula, referenceLines as ppReference,
  absenceHeadline, absenceEffectLines, absenceRowLines, NOT_COVERED as PP_NOT_COVERED,
} from '@/app/tools/pay-proration/copy';
import { calcShutdownAllowance } from '@/lib/calc/shutdown-allowance';
import { headline as saHeadline, formulaLines as saFormula, effectLines as saEffect, SCOPE_ITEMS as SA_SCOPE } from '@/app/tools/shutdown-allowance/copy';
import { text } from '../lib/common.mjs';
// 통상임금 점검·임금 체불 지연이자·근로자성 점검·월급 대조 — 도구마다 한 파일(groups/more). 이름·주민등록번호를 받지 않는다
import * as ordinaryWage from './more/check_ordinary_wage.mjs';
import * as wageDelay from './more/calc_wage_delay_interest.mjs';
import * as contractor from './more/check_contractor.mjs';
import * as monthlyPay from './more/check_monthly_pay.mjs';

const MORE = [ordinaryWage, wageDelay, contractor, monthlyPay];
export const calcTools = [
  'check_min_wage', 'calc_weekly_holiday_pay', 'count_regular_workers', 'calc_take_home_pay', 'calc_notice_pay', 'calc_leave_pay',
  'calc_severance', 'calc_holiday_pay', 'calc_pay_proration', 'calc_shutdown_allowance',
  ...MORE.map((m) => m.name),
];
/** 원격(HTTP)판에 실어도 되는 도구 — 전부 */
export const calcRemoteSafe = [...calcTools];

const SITE = 'https://yellowenvelope.kr';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const hoursText = (n) => `${(Math.round(n * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}시간`;

/** 엔진이 던진 입력 오류를 그대로 돌려준다(엔진 문구가 곧 사이트 화면의 오류 문구다) */
function run(fn) {
  try {
    return fn();
  } catch (e) {
    return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const UNIT = z.enum(['hour', 'day', 'week', 'month']);
const UNIT_DESC = '임금 단위 — hour(시급)·day(일급)·week(주급)·month(월급)';

export function registerCalc(server) {
  for (const m of MORE) m.register(server);
  // ── 최저임금 ──
  const PER = { month: '한 달', week: '1주', day: '하루', hour: '1시간' };
  server.registerTool(
    'check_min_wage',
    {
      title: '최저임금 비교',
      description:
        '받는 임금을 시간급으로 바꿔 그해 시간급 최저임금과 비교한다(사이트 /tools/min-wage 와 같은 엔진). 월급 환산 시간 = (1주 소정근로시간 + 주휴 시간) × 365 ÷ 7 ÷ 12 반올림(주 40시간이면 209시간). ' +
        'year 를 비우면 올해와 (고시가 있으면) 내년을 함께 본다. 정기상여금·현금 복리후생비(월급일 때)는 넣은 만큼 산입한다. 수습 90% 는 1년 이상 계약·수습 3개월 이내·단순노무 직종 아님을 모두 갖췄을 때만 쓴다.',
      inputSchema: {
        unit: UNIT.describe(UNIT_DESC),
        amount: z.number().describe('소정근로의 대가(기본급 등, 단위 기간 금액, 원). 연장·야간·휴일 가산분과 현물은 넣지 않는다'),
        monthlyBonus: z.number().optional().describe('월급일 때 매월 주는 정기상여금(원)'),
        monthlyWelfareCash: z.number().optional().describe('월급일 때 현금으로 매월 주는 식비·교통비 등(원)'),
        weeklyHours: z.number().optional().describe('1주 소정근로시간(주급·월급일 때 필요)'),
        dailyHours: z.number().optional().describe('1일 소정근로시간(일급일 때 필요)'),
        year: z.number().int().optional().describe('비교할 해(예: 2026). 비우면 올해와 내년'),
        probation: z.object({ oneYearContract: z.boolean(), withinThreeMonths: z.boolean(), simpleLabor: z.boolean() }).optional().describe('수습 감액 요건'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const today = todayKst();
        const y = Number(today.slice(0, 4));
        const years = a.year ? [a.year] : [y, y + 1];
        const rows = years.flatMap((year) => {
          const rate = rateOn('minWageHourly', `${year}-${year === y ? today.slice(5) : '01-01'}`);
          if (!rate) return [];
          const r = checkMinWage({ ...a, minHourly: rate.value });
          const base = r.applied === rate.value
            ? `${year}년 최저임금(시간당 ${won(rate.value)})`
            : `${year}년 수습 기준(최저임금 ${won(rate.value)}의 90%, 시간당 ${won(r.applied)})`;
          return [{
            year, minHourly: rate.value, notice: rate.basis,
            line: r.meets ? `${base} 이상입니다.` : `${base}보다 ${PER[a.unit]} ${won(r.shortfall)} 적습니다.`,
            ...r,
          }];
        });
        if (!rows.length) return text({ ok: false, error: `${years.join('·')}년 최저임금 고시가 이 도구에 없습니다.` });
        return text({
          ok: true,
          rows,
          fields: 'counted = 비교에 넣은 금액 · hours = 나눈 시간 수 · hourly = 시간급 환산 · applied = 적용한 시간급 최저임금 · required = 단위 기간 최저임금 · shortfall = 모자란 금액',
          basis: ['최저임금법 시행령 제5조제1항(시간급 환산)', '최저임금법 제6조제4항(산입 범위)', '최저임금법 제5조제2항·시행령 제3조(수습 90%)'],
          site: `${SITE}/tools/min-wage`,
        });
      }),
  );

  // ── 주휴수당 ──
  server.registerTool(
    'calc_weekly_holiday_pay',
    {
      title: '주휴수당 계산',
      description:
        '1주 주휴수당과 한 달 평균을 계산한다(사이트 /tools/weekly-holiday-pay 와 같은 엔진). 주휴수당 = 시급 × 1일 소정근로시간, 1일 소정근로시간 = 1주 소정근로시간 ÷ 통상근로자 1주 소정근로일 수(보통 5일, 8시간까지). 주 15시간 미만이면 없고, 그 주 소정근로일을 개근해야 생긴다.',
      inputSchema: {
        hourlyWage: z.number().describe('시급(원)'),
        weeklyHours: z.number().describe('1주 소정근로시간(4주 평균, 연장근로 제외)'),
        fullAttendance: z.boolean().optional().describe('그 주 소정근로일을 모두 나왔나(기본 true)'),
        fullTimeDays: z.number().int().optional().describe('같은 일을 하는 통상근로자의 1주 소정근로일 수(기본 5)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const r = calcWeeklyHoliday({ ...a, fullAttendance: a.fullAttendance ?? true });
        const headline =
          r.status === 'under15' ? [`1주 ${hoursText(a.weeklyHours)}이면 주휴수당이 없습니다.`, '4주를 평균한 1주 소정근로시간이 15시간 미만입니다.']
            : r.status === 'absent' ? ['이번 주는 주휴수당이 없습니다.', '그 주 소정근로일을 모두 나와야 생깁니다.']
              : [`1주 주휴수당은 ${won(r.amount)}입니다.`, `시급 ${won(a.hourlyWage)} × 1일 소정근로시간 ${hoursText(r.dailyHours)}, 한 달 평균 ${won(r.monthly)}(× 365 ÷ 7 ÷ 12)`];
        return text({
          ok: true, headline, ...r,
          basis: ['근로기준법 제55조제1항(유급휴일)', '근로기준법 시행령 별표2 제2호나목(1일 소정근로시간)', '근로기준법 제18조제3항(주 15시간 미만)', '근로기준법 시행령 제30조제1항(개근)'],
          site: `${SITE}/tools/weekly-holiday-pay`,
        });
      }),
  );

  // ── 상시 근로자 수 ──
  const ISO = z.string().describe('YYYY-MM-DD');
  server.registerTool(
    'count_regular_workers',
    {
      title: '상시 근로자 수 계산',
      description:
        '사업장이 상시 5명 이상(근로기준법 시행령 제7조의2)으로 보는 기간을 계산한다(사이트 /tools/headcount 와 같은 엔진). 기준일마다 그 전 1개월의 가동일 연인원 ÷ 가동일 수로 평균을 내고, 5명 미만인 날이 가동일의 절반에 이르는지로 정한다. ' +
        '「N명이 이 기간·이 요일에 일한다」는 묶음(crews)으로 넣는다. 날짜를 넣지 않은 묶음은 1년 넘게 일해 온 것으로 본다. 결과에 10명 이상 기간(취업규칙 제93조)과 1년 이상 근속자 연차(제60조제1항) 적용 여부도 붙는다. baseDate 를 주면 그날의 1개월 산정 근거도 돌려준다.',
      inputSchema: {
        openDays: z.array(z.number().int().min(0).max(6)).optional().describe('문을 여는 요일(0=일 … 6=토, 기본 월~금 [1,2,3,4,5])'),
        closedDates: z.array(z.string()).optional().describe('문을 여는 요일 중 쉰 날(YYYY-MM-DD). 비우면 공휴일도 연 날로 센다'),
        businessStart: z.string().optional().describe('사업 시작일 YYYY-MM-DD(1개월이 안 됐을 때만 결과가 달라진다)'),
        crews: z.array(z.object({
          count: z.number().int().min(1).max(99).describe('인원'),
          from: z.string().optional().describe('첫 근무일 YYYY-MM-DD(비우면 원래부터 일하던 사람)'),
          to: z.string().optional().describe('마지막 근무일 YYYY-MM-DD(비우면 계속)'),
          days: z.array(z.number().int().min(0).max(6)).optional().describe('일하는 요일(비우면 문을 여는 날 모두)'),
          kind: z.enum(['regular', 'dispatched', 'family']).optional().describe('regular = 통상·기간제·단시간 등(기본) · dispatched = 파견(세지 않음) · family = 동거친족'),
        })).min(1).describe('같은 기간·같은 요일·같은 구분으로 일하는 N명 묶음 목록'),
        today: ISO.optional().describe('살펴보기 시작할 날(기본 오늘, KST)'),
        baseDate: ISO.optional().describe('이날의 1개월 산정 근거를 따로 볼 때'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const today = a.today ?? todayKst();
        if (!parseIsoDate(today)) throw new Error('today 를 YYYY-MM-DD 로 넣어 주세요');
        const bad = [a.businessStart, ...(a.closedDates ?? []), ...a.crews.flatMap((c) => [c.from, c.to]), a.baseDate].filter((d) => d !== undefined && d !== '' && !parseIsoDate(d));
        if (bad.length) throw new Error(`날짜를 YYYY-MM-DD 로 넣어 주세요: ${bad.join(', ')}`);
        const openDays = [...new Set(a.openDays ?? [1, 2, 3, 4, 5])].sort();
        if (!openDays.length) throw new Error('문을 여는 요일을 하나 이상 넣어 주세요');
        const plan = {
          site: { openDays, closedDates: a.closedDates ?? [], ...(a.businessStart ? { businessStart: a.businessStart } : {}) },
          crews: a.crews.map((c, i) => ({ id: `c${i + 1}`, count: c.count, from: c.from || undefined, to: c.to || undefined, days: c.days?.length ? c.days : 'site', kind: c.kind ?? 'regular' })),
        };
        const ans = answerPlan(plan, today);
        const ten = hcTen(ans, today);
        const notes = ans.notes.map((n) => {
          if (n.kind === 'staff-assumed') return `날짜를 넣지 않은 ${n.count}명은 1년 넘게 일해 온 것으로 보고 셉니다. 입사 1년이 안 됐으면 from 에 입사일을 넣습니다.`;
          if (n.kind === 'holidays-counted') return '공휴일도 문을 연 날로 셉니다. 쉰 날이 있으면 closedDates 에 넣습니다.';
          if (n.kind === 'period-reversed') return `crews[${Number(n.crewId.slice(1)) - 1}] 는 끝나는 날이 시작일보다 빨라 세지 않았습니다.`;
          return `오늘에서 1년 넘게 떨어진 날짜(${n.date})는 살펴보는 기간에서 뺐습니다. baseDate 로 그 날짜를 따로 봅니다.`;
        });
        const five = ans.five.kind === 'spans'
          ? {
            kind: 'spans',
            spans: ans.five.spans.map((s) => ({ from: s.start === 'open' ? null : s.start.date, to: s.end === 'open' ? null : s.end.date })),
            note: 'from 이 null 이면 살펴본 기간(window) 시작 전부터 이미, to 가 null 이면 기간 끝 뒤로도 계속 5인 이상입니다.',
          }
          : { kind: ans.five.kind };
        let explain;
        if (a.baseDate) {
          const r = explainDate(plan, a.baseDate);
          const { days: _days, ...rest } = r;
          explain = { ...rest, average: Math.round(r.average * 100) / 100, line: hcBasis(r) };
        }
        return text({
          ok: true,
          window: ans.window,
          headline: hcHeadline(ans, today),
          why: hcWhy(ans, today),
          fivePlus: five,
          tenPlus: { spans: ans.ten, ...(ten ? { line: ten } : {}) },
          annualLeave: { kind: ans.leave.kind, lines: hcLeave(ans, today) },
          notes,
          ...(explain ? { baseDate: explain } : {}),
          basis: ['근로기준법 시행령 제7조의2(상시 사용하는 근로자 수의 산정)'],
          site: `${SITE}/tools/headcount`,
        });
      }),
  );

  // ── 실수령액 ──
  server.registerTool(
    'calc_take_home_pay',
    {
      title: '실수령액 계산',
      description:
        '월 급여에서 4대보험 근로자 몫(국민연금·건강보험·장기요양·고용보험)과 근로소득세(간이세액표)·지방소득세를 빼 예상 실수령액을 낸다(사이트 /tools/take-home-pay 와 같은 엔진). 요율은 date 에 적용되는 값을 쓴다. 월 과세 급여 1,000만원 초과분 소득세는 계산하지 않는다.',
      inputSchema: {
        pay: z.number().int().describe('월 급여(세전, 비과세 포함 지급 총액, 원)'),
        meal: z.number().int().optional().describe('식대(식사를 따로 제공받지 않는 경우, 월 20만원까지 비과세)'),
        otherNonTax: z.number().int().optional().describe('그 밖의 비과세 금액(한도 안의 금액)'),
        family: z.number().int().optional().describe('공제대상가족 수(본인 포함, 기본 1)'),
        children: z.number().int().optional().describe('공제대상가족 중 8세 이상 20세 이하 자녀 수'),
        ratio: z.union([z.literal(80), z.literal(100), z.literal(120)]).optional().describe('원천징수 비율(근로자가 신청하면 80·120, 기본 100)'),
        npsExempt: z.boolean().optional().describe('국민연금 공제 대상이 아님(만 60세 이상 등)'),
        employmentExempt: z.boolean().optional().describe('만 65세 이후 새로 고용됨(고용보험 실업급여 보험료 없음)'),
        date: z.string().optional().describe('요율 기준일 YYYY-MM-DD(기본 오늘)'),
      },
      annotations: READ_ONLY,
    },
    async ({ date, ...input }) =>
      run(() => {
        const on = date ?? todayKst();
        const rates = takeHomeRatesOn(on);
        if (!rates) return text({ ok: false, error: `${on} 기준 보험료율이 없어 계산할 수 없습니다.` });
        const r = calcTakeHomePay({ ...input, family: input.family ?? 1 }, rates);
        const rateKeys = ['npsEmployeePerMillion', 'healthEmployeePerMillion', 'ltcToHealthPerMillion', 'employmentEmployeePerMillion', 'mealNonTaxMonthly'];
        return text({
          ok: true, date: on,
          headline: thHeadline(r),
          items: thItems(r),
          formula: thFormula(r, rates),
          result: r,
          basis: [...new Set(rateKeys.map((k) => rateOn(k, on)?.basis).filter(Boolean)), `근로소득 간이세액표 — ${WITHHOLDING_REVISION}`],
          notice: TH_NOTICE,
          site: `${SITE}/tools/take-home-pay`,
        });
      }),
  );

  // ── 해고예고수당 ──
  server.registerTool(
    'calc_notice_pay',
    {
      title: '해고예고수당 계산',
      description:
        '30일 전에 해고를 예고하지 않았을 때의 해고예고수당(30일분 통상임금)을 계산한다(사이트 /tools/notice-pay 와 같은 엔진). 1일 통상임금 = 시간급 × 1일 소정근로시간, 월급은 (1주 소정 + 주휴) × 365 ÷ 7 ÷ 12 시간으로 나눈다. 30일이 안 되게 예고했어도 30일분 전액이다. 계속 근로 3개월 미만이면 적용하지 않는다.',
      inputSchema: {
        unit: UNIT.describe(UNIT_DESC),
        amount: z.number().describe('통상임금(단위 기간 금액, 원)'),
        weeklyHours: z.number().optional().describe('1주 소정근로시간(주급·월급일 때 필요)'),
        dailyHours: z.number().describe('1일 소정근로시간'),
        hireDate: z.string().describe('입사일 YYYY-MM-DD'),
        dismissalDate: z.string().describe('해고일(근로관계가 끝나는 날) YYYY-MM-DD'),
        noticeDate: z.string().optional().describe('해고를 알린 날 YYYY-MM-DD(비우면 예고하지 않은 것)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const r = calcNoticePay(a);
        const headline = {
          under3m: ['해고예고수당이 없습니다.', '계속 근로한 기간이 3개월이 되지 않았습니다.'],
          noticed: ['해고예고수당이 없습니다.', `해고일 ${r.noticeDays}일 전에 예고했습니다.`],
          short: [`해고예고수당은 ${won(r.amount)}입니다.`, `예고가 해고일 ${r.noticeDays}일 전이라 30일에 못 미쳐 30일분 전액입니다.`],
          pay: [`해고예고수당은 ${won(r.amount)}입니다.`, '30일 전에 예고하지 않았으면 30일분 통상임금입니다.'],
        }[r.status];
        return text({
          ok: true, headline, ...r, hourly: Math.round(r.hourly * 100) / 100,
          basis: ['근로기준법 제26조(해고의 예고)', '근로기준법 시행령 제6조제2항·제3항(통상임금 시간급·1일 통상임금)', '근로기준법 제26조 단서 제1호(계속 근로 3개월 미만)'],
          site: `${SITE}/tools/notice-pay`,
        });
      }),
  );

  // ── 연차수당 ──
  server.registerTool(
    'calc_leave_pay',
    {
      title: '연차수당 계산',
      description:
        '쓰지 않은 연차유급휴가에 대한 수당을 계산한다(사이트 /tools/leave-pay 와 같은 엔진). 통상 근로자 = 남은 일수 × 1일 통상임금(시간급 × 1일 소정근로시간), 단시간 근로자 = 남은 시간 × 시간급. 퇴직이면 입사일·마지막 재직일로 발생 누계를 셀 수 있다. ' +
        '상시 4명 이하·주 15시간 미만이면 계산하지 않는다. 사용 촉진·소멸시효로 금액을 줄이지 않는다.',
      inputSchema: {
        timing: z.enum(['employed', 'termination']).describe('employed = 재직 중(쓸 수 있는 1년이 끝남) · termination = 퇴직'),
        fivePlus: z.boolean().describe('상시 근로자 5명 이상'),
        weeklyHours: z.number().describe('1주 소정근로시간'),
        dailyHours: z.number().describe('1일 소정근로시간'),
        rate: z.discriminatedUnion('basis', [
          z.object({ basis: z.literal('ordinary-wage'), unit: UNIT.describe(UNIT_DESC), amount: z.number().describe('통상임금(단위 기간 금액, 원)') }),
          z.object({ basis: z.literal('average-wage'), dailyRate: z.number().describe('취업규칙 등이 평균임금으로 정한 경우 1일 평균임금(원)') }),
        ]).describe('1일 단가 기준 — 보통 ordinary-wage(통상임금)'),
        days: z.discriminatedUnion('source', [
          z.object({ source: z.literal('unused'), unusedDays: z.number().describe('남은 연차 일수') }),
          z.object({ source: z.literal('ledger'), hireDate: z.string().describe('입사일 YYYY-MM-DD'), lastWorkDate: z.string().describe('마지막 재직일 YYYY-MM-DD'), usedDays: z.number().describe('이미 쓰거나 수당으로 받은 일수') }),
        ]).optional().describe('통상 근로자의 남은 일수 — 알면 unused, 퇴직이면 ledger 로 발생 누계를 센다'),
        partTime: z.object({
          fullTimeWeeklyHours: z.number().describe('같은 일을 하는 통상 근로자의 1주 소정근로시간'),
          fullTimeDays: z.number().describe('통상 근로자라면 생겼을 연차일수(한 번에 생기는 일수, 25일 이하)'),
          usedHours: z.number().describe('이미 쓴 연차 시간'),
        }).optional().describe('단시간 근로자일 때'),
        otherPaidHours: z.boolean().optional().describe('주휴 말고 소정근로시간 밖에 유급으로 정한 시간(토요일 유급 등)이 있다 — 월급·주급이면 계산하지 않는다'),
        promotion: z.enum(['none', 'claimed', 'unknown']).optional().describe('회사가 사용 촉진을 했다고 하는가(금액은 바뀌지 않는다)'),
        arisenBeforeTermination: z.boolean().optional().describe('퇴직: 퇴직 전에 이미 지급 사유가 생겨 있던 수당인가(퇴직금 평균임금 산입 표시)'),
        alreadyPaid: z.number().optional().describe('회사가 지급했거나 지급하려는 금액(대조용)'),
        asOf: z.string().optional().describe('기준일 YYYY-MM-DD(기본 오늘, 조문 번호 표시)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const r = calcLeavePay({ ...a, asOf: a.asOf ?? todayKst() });
        return text({
          ok: true,
          headline: lpHeadline(r),
          formula: lpFormula(r),
          effect: lpEffect(r),
          result: r,
          basis: [`근로기준법 ${r.payArticle}(통상임금 또는 평균임금 지급)`, '근로기준법 시행령 제6조(통상임금)', '대법원 2005. 5. 27. 선고 2003다48549 판결(근로관계가 끝나도 수당 청구권은 남는다)'],
          site: `${SITE}/tools/leave-pay`,
        });
      }),
  );

  // ── 퇴직금 ──
  const dec2 = (n) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  server.registerTool(
    'calc_severance',
    {
      title: '퇴직금 계산',
      description:
        '퇴직금 = 1일 평균임금 × 30 × 재직일수 ÷ 365 를 계산한다(사이트 /tools/severance.html 과 같은 엔진). 평균임금 = 퇴직일(마지막 근무일 다음 날) 전 3개월 임금총액 + 1년 상여금·연차수당의 3/12, 그 기간 총일수로 나눈다. ' +
        '1일 평균임금은 소수 둘째 자리 올림, 퇴직금은 원 단위 반올림(고용노동부 퇴직금 계산기와 같은 끝수). 1일 통상임금을 넣으면 평균임금보다 높을 때 통상임금으로 계산한다. 계속근로 1년 요건만 보고, 1주 15시간 요건은 보지 않는다.',
      inputSchema: {
        hireDate: z.string().describe('입사일 YYYY-MM-DD'),
        lastWorkDate: z.string().describe('마지막 근무일 YYYY-MM-DD(퇴직일은 그 다음 날)'),
        wageTotal: z.number().min(0).describe('퇴직일 전 3개월 동안 받은 임금 총액(상여금·연차수당은 빼고, 원)'),
        annualBonus: z.number().min(0).optional().describe('퇴직 전 1년 동안 받은 상여금 총액(원) — 3/12을 더한다'),
        annualLeavePay: z.number().min(0).optional().describe('퇴직 전 1년 연차수당 중 평균임금에 넣는 금액(원) — 3/12을 더한다'),
        dailyOrdinaryWage: z.number().min(0).optional().describe('1일 통상임금(원, 알면)'),
        wageType: z.enum(['auto', 'average', 'ordinary']).optional().describe('auto = 평균임금과 통상임금 중 높은 쪽(기본) · average · ordinary'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const r = calcSeverance(a);
        const kind = r.applied === 'ordinary' ? '통상임금' : '평균임금';
        const formula = `1일 ${kind} ${dec2(r.dailyApplied)}원 × 30 × 재직 ${r.serviceDays.toLocaleString('ko-KR')}일 ÷ 365`;
        const headline = r.eligible
          ? [`퇴직금은 ${won(r.amount)}입니다.`, formula]
          : ['계속근로 기간이 1년이 되지 않아 퇴직금 지급 대상이 아닙니다.', `퇴직일 ${r.retirementDate}까지 재직 ${r.serviceDays}일입니다(근로자퇴직급여 보장법 제4조제1항). 같은 식으로 세면 ${won(r.amount)}입니다.`];
        if (r.eligible && r.applied === 'ordinary' && (a.wageType ?? 'auto') === 'auto') headline.push(`1일 평균임금 ${dec2(r.dailyAverage)}원이 1일 통상임금보다 낮아 통상임금으로 계산했습니다(근로기준법 제2조제2항).`);
        return text({
          ok: true, headline, result: r,
          notice: '1주 소정근로시간이 15시간 미만이면 퇴직금 지급 대상이 아닙니다(근로자퇴직급여 보장법 제4조제1항 단서). 이 계산은 그 요건을 따로 보지 않습니다. 퇴직소득세는 calc_retirement_tax 로 계산합니다.',
          basis: ['근로자퇴직급여 보장법 제8조제1항(30일분 이상의 평균임금 × 계속근로기간 1년)', '근로기준법 제2조제1항제6호(평균임금)·제2항(평균임금이 통상임금보다 적으면 통상임금)', '근로자퇴직급여 보장법 제4조제1항(계속근로기간 1년 이상)'],
          site: `${SITE}/tools/severance.html`,
        });
      }),
  );

  // ── 공휴일 근로 수당 ──
  const HOLIDAY_KIND = { labor_day: '노동절(5월 1일)', public_holiday: '관공서 공휴일' };
  server.registerTool(
    'calc_holiday_pay',
    {
      title: '공휴일 근로 수당 계산',
      description:
        '노동절(5월 1일)·관공서 공휴일에 일했을 때 더 주는 임금을 계산한다(사이트 /tools/holiday-pay 와 같은 엔진). 상시 5명 이상이면 휴일근로 8시간까지 1.5배·8시간 넘는 부분 2배, 야간(22시~6시) 0.5배 가산. ' +
        '월급제는 1.0배분이 월급에 들어 있어 가산분만, 일용·시급제는 1.0배분과 가산분을 함께 낸다. 4명 이하 사업장은 가산하지 않고, 관공서 공휴일은 유급휴일 의무도 없다(노동절은 규모와 상관없이 유급휴일).',
      inputSchema: {
        workerType: z.enum(['monthly', 'daily', 'hourly']).describe('monthly = 월급제 · daily = 일용직(일급) · hourly = 시급제'),
        fivePlus: z.boolean().describe('상시 근로자 5명 이상'),
        holidayKind: z.enum(['labor_day', 'public_holiday']).describe('labor_day = 노동절(5월 1일) · public_holiday = 관공서 공휴일'),
        workedHours: z.number().min(0).describe('그 공휴일에 실제로 일한 시간'),
        nightHours: z.number().min(0).optional().describe('그중 22시~6시 야간근로 시간'),
        monthlyPay: z.number().optional().describe('월급제: 월 통상임금 항목 합계(기본급 + 고정수당, 원)'),
        monthlyHours: z.number().optional().describe('월급제: 월 소정근로시간(기본 209)'),
        dailyWage: z.number().optional().describe('일용직: 일급(원)'),
        dailyHours: z.number().optional().describe('일용직: 1일 근로시간(기본 8)'),
        paidContinuously: z.boolean().optional().describe('일용직: 같은 사업장에서 계속 일해 왔다(기본 true). false = 하루만 일하고 끝난 경우라 가산하지 않는다'),
        hourlyWage: z.number().optional().describe('시급제: 시급(원)'),
        hourlyIncludesWeekly: z.boolean().optional().describe('시급제: 시급에 주휴수당이 들어 있다'),
        weeklyHours: z.number().optional().describe('시급제: 1주 소정근로시간'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const common = { site_size: a.fivePlus ? 'large' : 'small', holiday_kind: a.holidayKind, worked_hours: Math.max(a.workedHours || 0, 0), night_hours: Math.max(a.nightHours || 0, 0) };
        let input;
        if (a.workerType === 'monthly') {
          if (!(a.monthlyPay > 0)) throw new Error('월 통상임금 항목 합계를 입력해주세요.');
          input = { ...common, worker_type: 'monthly', monthly_pay: a.monthlyPay, monthly_hours: a.monthlyHours || 209 };
        } else if (a.workerType === 'daily') {
          if (!(a.dailyWage > 0)) throw new Error('일급을 입력해주세요.');
          input = { ...common, worker_type: 'daily', daily_wage: a.dailyWage, daily_hours: a.dailyHours || 8, paid_continuously: a.paidContinuously ?? true };
        } else {
          if (!(a.hourlyWage > 0)) throw new Error('시급을 입력해주세요.');
          input = { ...common, worker_type: 'hourly', hourly_wage: a.hourlyWage, hourly_includes_weekly: !!a.hourlyIncludesWeekly, weekly_hours: a.weeklyHours || 0 };
        }
        const r = calcHolidayPay(input);
        const day = HOLIDAY_KIND[a.holidayKind];
        const premium = r.already_in_monthly_pay ? r.total : r.total - r.regular_pay_equivalent;
        const headline = r.already_in_monthly_pay
          ? [`${day}에 ${hoursText(common.worked_hours)} 일했을 때 월급 외에 더 줄 금액은 ${won(r.total)}입니다.`, `통상시급 ${won(r.base_hourly)} 기준 가산분이고, 1.0배분은 월급에 들어 있습니다.`]
          : [`${day}에 ${hoursText(common.worked_hours)} 일했을 때 줄 임금은 ${won(r.total)}입니다.`, `통상시급 ${won(r.base_hourly)} 기준 1.0배분 ${won(r.regular_pay_equivalent)}${premium > 0 ? ` + 가산분 ${won(premium)}` : '(가산 없음)'}`];
        return text({
          ok: true, headline, result: r,
          basis: r.legal_basis,
          site: `${SITE}/tools/holiday-pay`,
        });
      }),
  );

  // ── 급여 일할계산 ──
  const ROUNDING = z.object({ how: z.enum(['FLOOR', 'ROUND', 'CEIL']).describe('FLOOR = 버림 · ROUND = 반올림 · CEIL = 올림'), unit: z.union([z.literal(1), z.literal(10), z.literal(100)]).describe('끝수 처리 단위(원)') });
  server.registerTool(
    'calc_pay_proration',
    {
      title: '급여 일할계산',
      description:
        '월급제 근로자가 그달 중간에 입사·퇴사한 달의 일할 급여(mode=prorate), 그달 내내 재직하며 결근·지각·조퇴한 달의 공제액(mode=absence)을 계산한다(사이트 /tools/pay-proration 과 같은 엔진). ' +
        '법은 일할 방식을 정하지 않아 30일 기준(지급식·공제식)·그달 달력 일수·소정근로일·시간 기준·전액 지급 값을 나란히 낸다. 회사 기준(method)을 알면 그 값을 앞에 둔다. 원 미만이 남으면 끝수 기준(rounding)이 없을 때 금액을 정하지 않는다(null). ' +
        '주 40시간(월~금 8시간)·주휴일 일요일 월급제, 급여기간 그달 1일~말일만 다룬다. 공휴일은 넣은 날만 센다.',
      inputSchema: {
        mode: z.enum(['prorate', 'absence']).describe('prorate = 중간 입사·퇴사한 달 · absence = 결근·지각 공제'),
        month: z.string().describe('급여 달 YYYY-MM'),
        monthlyPay: z.number().int().describe('일할하는 월급(기본급과 매달 고정으로 주는 수당, 원)'),
        fivePlus: z.boolean().describe('상시 근로자 5명 이상(관공서 공휴일 유급 적용)'),
        holidays: z.array(z.string()).optional().describe('그달 평일 중 쉬는 공휴일 YYYY-MM-DD'),
        rounding: ROUNDING.optional().describe('회사의 원 미만 끝수 처리(모르면 비운다)'),
        start: z.string().optional().describe('prorate: 그달 중간 입사일 YYYY-MM-DD'),
        end: z.string().optional().describe('prorate: 그달 중간 퇴사일(근로관계 마지막 날, 포함) YYYY-MM-DD'),
        method: z.enum(['DAY_30', 'DAY_30_DEDUCT', 'CALENDAR', 'WORKDAY', 'HOUR_ACTUAL', 'FULL']).optional()
          .describe('prorate: 회사가 정한 일할 방식(모르면 비운다) — DAY_30 = 30일 기준 지급식 · DAY_30_DEDUCT = 30일 기준 공제식 · CALENDAR = 그달 달력 일수 · WORKDAY = 소정근로일 · HOUR_ACTUAL = 시간 기준 · FULL = 전액 지급'),
        payslip: z.number().optional().describe('prorate: 대조할 명세서 금액(원)'),
        absences: z.array(z.string()).optional().describe('absence: 무급 결근일 YYYY-MM-DD(소정근로일)'),
        lateHours: z.number().optional().describe('absence: 지각·조퇴 합계 시간'),
        companyDeduction: z.number().optional().describe('absence: 대조할 회사 공제액(원)'),
        avgDailyWage: z.number().optional().describe('absence: 평균임금 1일분(감급 한도를 볼 때, 원)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        if (!/^\d{4}-\d{2}$/.test(a.month)) throw new Error('급여 달을 넣어 주세요.');
        const common = { month: a.month, monthlyPay: a.monthlyPay, fivePlus: a.fivePlus, holidays: a.holidays ?? [], rounding: a.rounding ?? null };
        if (a.mode === 'prorate') {
          if (!a.start && !a.end) throw new Error('그달 중간에 입사했으면 입사일을, 퇴사했으면 퇴사일을 넣어 주세요.');
          const r = calcProration({ ...common, start: a.start || undefined, end: a.end || undefined, payslip: a.payslip });
          const basis = a.method ?? 'unknown';
          const methods = ppMethods(r).map((m) => ({ ...m, amounts: r.rows.find((x) => x.id === m.id).variants.map((v) => v.amount) }));
          return text({
            ok: true, mode: 'prorate',
            headline: ppHeadline(r, basis),
            effect: ppEffect(r, basis),
            methods,
            formula: ppFormula(r),
            reference: ppReference(r),
            result: r,
            notCovered: PP_NOT_COVERED,
            site: `${SITE}/tools/pay-proration`,
          });
        }
        const r = calcAbsence({ ...common, absences: a.absences ?? [], lateHours: a.lateHours, companyDeduction: a.companyDeduction, avgDailyWage: a.avgDailyWage });
        return text({
          ok: true, mode: 'absence',
          headline: absenceHeadline(r),
          effect: absenceEffectLines(r),
          rows: absenceRowLines(r),
          result: r,
          notCovered: PP_NOT_COVERED,
          site: `${SITE}/tools/pay-proration`,
        });
      }),
  );

  // ── 휴업수당 ──
  server.registerTool(
    'calc_shutdown_allowance',
    {
      title: '휴업수당 계산',
      description:
        '회사 사정(사용자의 귀책사유)으로 휴업한 기간의 휴업수당 = 평균임금의 70% 이상을 계산한다(사이트 /tools/shutdown-allowance 와 같은 엔진, 근로기준법 제46조). 평균임금의 70%가 통상임금보다 많으면 통상임금 기준 금액을 나란히 낸다(제46조제1항 단서 — 회사가 고른다). ' +
        '휴업 중 일부 임금을 받았으면 (평균임금 × 휴업일수 − 받은 임금) × 70%(시행령 제26조). 평균임금은 휴업 시작일 전 3개월로 산정하거나 1일 금액을 넣는다. 상시 4명 이하·불가항력·노동위원회 승인은 금액을 내지 않는다. 귀책사유가 있는지는 정하지 않는다.',
      inputSchema: {
        fivePlus: z.boolean().describe('상시 근로자 5명 이상'),
        cause: z.enum(['employer', 'force-majeure', 'commission']).describe('employer = 회사 사정 휴업 · force-majeure = 천재지변 등 불가항력 · commission = 노동위원회 승인(제46조제2항)'),
        average: z.discriminatedUnion('source', [
          z.object({
            source: z.literal('period'),
            hireDate: z.string().describe('입사일 YYYY-MM-DD'),
            startDate: z.string().describe('휴업을 시작한 날 YYYY-MM-DD'),
            wageTotal: z.number().describe('휴업 시작일 전 3개월 동안 받은 임금 총액(상여금 빼고, 원)'),
            excludedDays: z.number().optional().describe('그 3개월 안에 빼는 기간(시행령 제2조제1항 — 앞선 휴업·출산전후휴가·요양 등)의 일수'),
            excludedWages: z.number().optional().describe('그 빼는 기간에 받은 임금(원)'),
            annualBonus: z.number().optional().describe('휴업 시작일 전 12개월 동안 받은 상여금 합계(원) — 3/12을 더한다'),
          }),
          z.object({ source: z.literal('direct'), daily: z.number().describe('1일 평균임금(원)') }),
        ]).describe('평균임금 — period = 3개월 임금으로 산정 · direct = 1일 금액을 안다'),
        ordinary: z.object({
          unit: UNIT.describe(UNIT_DESC),
          amount: z.number().describe('통상임금(단위 기간 금액, 원)'),
          weeklyHours: z.number().optional().describe('1주 소정근로시간(주급·월급일 때)'),
          dailyHours: z.number().describe('1일 소정근로시간(8시간 이하)'),
        }).describe('통상임금'),
        days: z.number().int().describe('휴업일수 — 휴업기간 안의 유급휴일 포함, 무급 휴무일 제외'),
        paidDuring: z.number().optional().describe('휴업한 기간에 받은 임금 합계(원)'),
      },
      annotations: READ_ONLY,
    },
    async (a) =>
      run(() => {
        const r = calcShutdownAllowance(a);
        return text({
          ok: true,
          headline: saHeadline(r),
          effect: saEffect(r),
          formula: saFormula(r),
          result: r,
          notCovered: SA_SCOPE,
          basis: ['근로기준법 제46조(휴업수당)', '근로기준법 시행령 제26조(휴업기간 중 임금 일부를 받은 경우)', '근로기준법 제2조제1항제6호·제2항(평균임금)'],
          site: `${SITE}/tools/shutdown-allowance`,
        });
      }),
  );
}
