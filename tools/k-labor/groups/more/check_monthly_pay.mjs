// 월급 대조 — 사이트 /tools/pay-check 와 같은 엔진(src/lib/pay-check)과 화면 입력 규칙(src/app/tools/pay-check/build-input)을 그대로 불러 쓴다.
// 확인한 값만 받는다. 파일·네트워크·주민등록번호를 건드리지 않는다 — 원격판에 그대로 실을 수 있다.
import { z } from 'zod';
import { check } from '@/lib/pay-check/check';
import { renderCard, STATUS_TEXT } from '@/lib/pay-check/card';
import { POLICY_NAME } from '@/lib/pay-check/policies';
import { fieldsFor, OUTSIDE_NOTE, PICKS } from '@/app/tools/pay-check/build-input';
import { text } from '../../lib/common.mjs';

export const name = 'check_monthly_pay';

const SITE = 'https://yellowenvelope.kr/tools/pay-check';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// PayCheckClient.tsx 의 DISCLAIMER 와 같은 문장(엔진 renderCard 의 마지막 줄도 같다).
// 클라이언트 파일은 React·next/link 를 끌고 와 불러오지 않는다.
const DISCLAIMER = '이 결과는 입력하고 확인한 값의 대조이며 법률 판단이 아닙니다.';

// 화면 아래 「이 도구가 쓰는 조문」 목록(PayCheckClient.tsx footer). 결과마다 엔진이 붙이는 조문은 뒤에 더한다.
const SCREEN_BASIS = [
  '근로기준법 제18조제3항',
  '근로기준법 제55조제1항',
  '근로기준법 시행령 제30조제1항',
  '근로기준법 시행령 [별표 2] 제2호나목',
];

// 화면 footer 「범위 밖」 문장에서 금지어가 든 항목 하나를 뺀 목록.
const NOT_COVERED = ['두 가지 이상 겹친 예외', '교대제', '가산수당', '연차', '퇴직금', '보험', '세액'];

const SCENARIO_IDS = PICKS.map((p) => p.id);
const POLICY_IDS = Object.keys(POLICY_NAME);

const dateStr = (what) => z.string().optional().describe(`${what} YYYY-MM-DD`);
const numOpt = (what) => z.number().optional().describe(what);

const FACT_SCHEMA = {
  // 날짜
  employment_start: dateStr('입사일(중도입사)'),
  employment_end: dateStr('퇴사일(중도퇴사)'),
  pay_period_start: dateStr('급여기간 첫날(명세서에 적힌 기간, 중도입사·중도퇴사)'),
  pay_period_end: dateStr('급여기간 마지막 날(명세서에 적힌 기간, 중도입사·중도퇴사)'),
  last_scheduled_workday: z.string().nullable().optional().describe('마지막 소정근로일 YYYY-MM-DD(중도퇴사). null = 모름'),
  paid_holiday_treatment: z.enum(['paid', 'unpaid']).nullable().optional().describe('퇴사월 유급휴일 처리(중도퇴사) — paid = 유급으로 처리됨 · unpaid = 무급으로 처리됨 · null = 모름'),
  // 명세서 금액
  payslip_amount: numOpt('명세서의 입사월·퇴사월 기본급(원, 중도입사·중도퇴사)'),
  payslip_absence_deduction: numOpt('명세서 결근 공제액(원, −로 찍혀 있어도 그대로)'),
  payslip_weekly_holiday_pay: numOpt('명세서 주휴 금액(원, 시급제·주휴)'),
  // 결근 공제
  unpaid_absence_hours: numOpt('무급 결근시간(시간, 결근 공제)'),
  scheduled_workday_confirmed: z.boolean().optional().describe('공제된 날이 소정근로일임을 근무표로 확인함 = true · 확인하지 못함 = false(결근 공제)'),
  paid_leave_or_holiday: z.boolean().nullable().optional().describe('그날이 유급휴가·유급휴일이었는지 — true = 그렇다고 확인됨 · false = 아님을 확인함 · null = 모름(결근 공제)'),
  // 시급제·주휴
  four_week_scheduled_hours: numOpt('평균 기간의 약정 소정근로시간 합계(시간) — 보통 4주, 근로한 기간이 4주 미만이면 그 기간. 계약서에 적힌 시간'),
  averaging_weeks: numOpt('평균을 낸 주수 — 보통 4, 근로한 기간이 4주 미만이면 그 주수(예: 2)'),
  temporary_actual_hours_in_one_week: numOpt('대타로 실제 일한 그 주의 시간(대타가 있었을 때만)'),
  contract_change_confirmed: z.boolean().optional().describe('대타 시간이 계약상 약정시간 변경으로 확인됨 = true · 변경이 아니거나 확인하지 못함 = false'),
  employment_continued_for_7_days: z.boolean().optional().describe('그 주 7일 동안 계약이 이어짐 = true · 이어지지 않았거나 모름 = false'),
  weekly_holiday_designated: z.boolean().nullable().optional().describe('주휴일 지정 — true = 계약·규칙에 지정됨 · false = 지정되지 않음을 확인함 · null = 모름'),
  all_scheduled_days_attended: z.boolean().optional().describe('그 주 소정근로일 개근을 근무표로 확인함 = true · 개근 아님 또는 확인하지 못함 = false'),
  // 계산 기준 칸(고른 기준에 딸린 칸만 쓰인다)
  hourly_rate: numOpt('확정 시급(원) — 시간 기준·시간 단위 결근 공제·주휴 고정 스케줄'),
  paid_hours: numOpt('유급 처리된 시간(시간) — 시간 기준'),
  monthly_base_pay: numOpt('월 기본급(원) — 30일 기준'),
  eligible_days: numOpt('인정일수(일, 30일 기준으로 셀 날수) — 30일 기준'),
  full_time_scheduled_days_4w: numOpt('같은 기간 통상 근로자의 소정근로일수(일, 주 5일 사업장이면 4주에 보통 20일) — 주휴 고정 스케줄'),
  holiday_weeks: numOpt('명세서 주휴 항목이 몇 주분인지(주) — 주휴 고정 스케줄'),
};

const DESCRIPTION =
  '한 사람의 한 달 급여에서 예외 하나(중도입사·중도퇴사·결근 공제·시급제 주휴수당)를 골라, 확인한 값과 회사 문서에 적힌 계산 기준으로 명세서 그 항목 금액을 대조한다(사이트 /tools/pay-check 와 같은 엔진). ' +
  '계산 기준: 시간 기준 = 시급 × 유급 처리된 시간 · 30일 기준 = 월 기본급 ÷ 30 × 인정일수 · 시간 단위 결근 공제 = 시급 × 무급 결근시간 · ' +
  '주휴 고정 스케줄 = 시급 × (평균 기간 약정 소정근로시간 ÷ 같은 기간 통상 근로자 소정근로일수) × 주수(시행령 [별표 2] 제2호나목). 4주(4주 미만 근로면 그 기간) 평균 1주 15시간 미만은 주휴 대조 밖(근로기준법 제18조제3항). ' +
  '차이 = 계산값 − 명세서(결근 공제는 명세서 − 계산값), 양수면 근로자가 덜 받는 쪽. 결과는 대조 일치·어긋남 가능성·계산 기준 확인 필요·범위 밖 넷 중 하나다. ' +
  '회사 기준을 모르면(policy 없음) 금액을 만들지 않고 회사에 물어볼 문장을 낸다. 기준은 골랐지만 문서에서 확인하지 못했으면 참고 계산으로 내고 「계산 기준 문서 미확인」을 남긴다. 끝수가 생겼는데 처리 방법·단위 중 하나라도 모르면 금액을 만들지 않는다. ' +
  '빈 칸은 모름이며 대조를 멈춘다. 날짜를 고치거나 기준을 짐작하지 않는다. 정상 근무월, 두 가지 이상 겹친 예외, 교대제·가산수당·연차·퇴직금·보험·세액은 다루지 않는다. 결과는 법률 판단이 아니다.';

/** 화면 buildInput 과 같은 규칙: 그 예외·기준의 칸만 넣고, 빈 칸(undefined)은 키를 뺀다. null 은 「모름」으로 그대로 넣는다. */
function toInput(a) {
  const scenario = a.scenario;
  const policy = a.policy ?? null;
  const { facts, basis } = fieldsFor(scenario, policy);
  const used = new Set();
  const confirmed = {};
  for (const def of [...facts, ...basis]) {
    used.add(def.key);
    const v = a[def.key];
    if (v === undefined) continue;
    confirmed[def.key] = v;
  }
  if (policy && typeof a.basisDocumented === 'boolean') confirmed.calculation_basis_documented = a.basisDocumented;
  if (a.rounding) confirmed.rounding = a.rounding;
  if (a.roundingUnit != null) confirmed.rounding_unit = a.roundingUnit;
  const ignored = Object.keys(FACT_SCHEMA).filter((k) => a[k] !== undefined && !used.has(k));
  return { input: { scenario, confirmed, policy_id: policy }, ignored };
}

const won = (n) => `${n.toLocaleString('ko-KR')}원`;

export function register(server) {
  server.registerTool(
    name,
    {
      title: '월급 대조',
      description: DESCRIPTION,
      inputSchema: {
        scenario: z.enum(SCENARIO_IDS).describe(
          '예외 — MID_JOIN(중도입사) · MID_LEAVE(중도퇴사) · ABSENCE_DEDUCTION(결근 공제) · HOURLY_WEEKLY_HOLIDAY(시급제·주휴) · NORMAL_MONTH(예외 없는 달, 범위 밖) · MULTIPLE(두 가지 이상 겹침, 범위 밖)',
        ),
        policy: z.enum(POLICY_IDS).nullable().optional().describe(
          '회사 계산 기준 — HOUR_ACTUAL(시간 기준, 중도입사·중도퇴사) · DAY_30(30일 기준, 중도입사·중도퇴사) · ABSENCE_HOUR(시간 단위 결근 공제) · WEEKLY_HOLIDAY_FIXED(주휴 고정 스케줄). 비우거나 null = 없음·모름(금액을 만들지 않는다)',
        ),
        basisDocumented: z.boolean().nullable().optional().describe('고른 기준을 근로계약서·취업규칙 등 회사 문서에서 확인했는지 — true 가 아니면 참고 계산'),
        rounding: z.enum(['FLOOR', 'ROUND', 'CEIL']).optional().describe('끝수 처리 방법 — FLOOR 버림 · ROUND 반올림 · CEIL 올림. 비우면 모름'),
        roundingUnit: z.union([z.literal(1), z.literal(10), z.literal(100)]).optional().describe('끝수 처리 단위(원) — 1·10·100. 비우면 모름'),
        ...FACT_SCHEMA,
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        if (a.scenario === 'NORMAL_MONTH' || a.scenario === 'MULTIPLE') {
          return text({
            ok: true,
            headline: [`[${STATUS_TEXT.OUTSIDE_SCOPE}] ${OUTSIDE_NOTE[a.scenario]}`],
            result: { scenario: a.scenario, status: 'OUTSIDE_SCOPE' },
            statusText: STATUS_TEXT.OUTSIDE_SCOPE,
            observation: OUTSIDE_NOTE[a.scenario],
            notCovered: NOT_COVERED,
            disclaimer: DISCLAIMER,
            basis: SCREEN_BASIS,
            site: SITE,
          });
        }
        const { input, ignored } = toInput(a);
        const r = check(input);
        const amounts = r.expected_amount !== null && r.payslip_amount !== null && r.difference !== null
          ? {
              payslip: won(r.payslip_amount),
              expected: won(r.expected_amount),
              expectedLabel: r.reasons.includes('BASIS_NOT_DOCUMENTED') ? '고른 기준으로 참고 계산' : '확인한 기준으로 계산',
              difference: won(Math.abs(r.difference)),
            }
          : null;
        return text({
          ok: true,
          headline: [`[${STATUS_TEXT[r.status]}] ${r.observation}`],
          result: r,
          statusText: STATUS_TEXT[r.status],
          amounts,
          openConfirmations: r.open_confirmations,
          grounds: r.grounds,
          conditions: r.conditions,
          evidenceNeeded: r.evidence_needed,
          question: r.required_question,
          card: renderCard(r),
          disclaimer: DISCLAIMER,
          ...(ignored.length ? { ignoredFields: ignored } : {}),
          notCovered: NOT_COVERED,
          basis: [...SCREEN_BASIS, ...r.citations.filter((x) => !SCREEN_BASIS.includes(x))],
          site: SITE,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
