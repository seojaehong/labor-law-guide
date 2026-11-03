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
import { text } from '../lib/common.mjs';

export const calcTools = ['check_min_wage', 'calc_weekly_holiday_pay', 'count_regular_workers', 'calc_take_home_pay', 'calc_notice_pay', 'calc_leave_pay'];
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
}
