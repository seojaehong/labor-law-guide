// 육아기 근로시간 단축 급여 + 사업주 출산육아기 고용안정장려금 — 정본 엔진(src/lib/calc/childcare-reduction)을 그대로 불러 쓴다.
// 금액·시간·날짜와 예/아니오 사실만 받는다. 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다.
// 사이트 화면은 아직 없다(261127 — 엔진·도구만 먼저).
import { z } from 'zod';
import { calcChildcareReduction } from '@/lib/calc/childcare-reduction';
import { text } from '../../lib/common.mjs';

export const name = 'calc_childcare_reduction_pay';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DATE = 'YYYY-MM-DD';
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const dot = (s) => s.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, '$1. $2. $3.');

export const WAGE_NOTE =
  '단축 기간에 회사가 지급하는 임금은 계산하지 않습니다. 줄어든 근로시간만큼 어떤 항목을 얼마나 줄이는지는 임금 구성(기본급·고정수당·식대 등을 시간에 비례해 줄이는지)에 따라 달라지므로 ' +
  '취업규칙·근로계약과 서면으로 정한 단축 후 근로조건으로 확인합니다. 근로시간에 비례해 적용하는 경우 외에는 단축을 이유로 근로조건을 불리하게 하지 못합니다(남녀고용평등법 제19조의3제1항).';

const BASIS = [
  '고용보험법 제73조의2(육아기 근로시간 단축 급여) · 시행령 제104조의2(급여액 계산식·상한·하한)',
  '남녀고용평등법 제19조의2(단축 후 주 15~35시간·기간) · 제19조의4제2항(나눠 쓰면 1회 1개월 이상)',
  '고용보험법 시행령 제29조(출산육아기 고용안정장려금) · 시행규칙 제51조(신청 시기·기간)',
  '고용창출장려금·고용안정장려금의 신청 및 지급에 관한 규정(고용노동부 고시, 2026. 7. 1. 시행) 제16조·제17조·별표 5',
];

function headline(r) {
  const lines = [];
  const w = r.worker;
  if (!w) {
    lines.push(`급여를 세려면 ${r.needs.map((n) => n.key).join('·')} 값이 더 필요합니다(needs 참고).`);
  } else {
    const ruleDay = dot(w.rule.from);
    const parts = [`앞 ${w.firstHours}시간분 ${won(w.firstPart)}`];
    if (w.restHours > 0) parts.push(`나머지 ${w.restHours}시간분 ${won(w.restPart)}`);
    const p = w.payable;
    if (w.verdict === 'not-eligible') {
      lines.push(`육아기 근로시간 단축 급여(근로자) — 미충족 요건이 있어 지급액 0원(산식 월액 ${won(w.monthly)}은 참고값).`);
    } else {
      lines.push(`육아기 근로시간 단축 급여(근로자) 산식 월 ${won(w.monthly)} — ${parts.join(' + ')}(${ruleDay} 시행 상한 기준).`);
      lines.push(p.monthly === null
        ? '실제 지급액은 회사가 단축 중 주는 금액과 합해 통상임금을 넘으면 그만큼 줄어듭니다(시행령 제104조의4) — employerPaidMonthly 를 넣으면 셉니다.'
        : `감액 반영 지급액 월 ${won(p.monthly)}(감액 ${won(p.deduction)}).`);
      if (w.schedule) lines.push(w.schedule.total === null ? '기간 합계는 내지 않았습니다(assumptions 참고).' : `단축 기간 산식 합계 ${won(w.schedule.total)}(${w.schedule.periods.length}개 기간, 감액 전).`);
    }
    const check = w.eligibility.filter((c) => c.status === 'check').length;
    const unmet = w.eligibility.filter((c) => c.status === 'unmet').length;
    lines.push(`근로자 요건 — ${w.verdict === 'eligible' ? '넣은 사실로 모두 충족' : `미충족 ${unmet}건 · 확인 필요 ${check}건`}.`);
    if (w.verdict !== 'not-eligible') lines.push(`급여 신청 ${dot(w.apply.from)}부터${w.apply.until ? ` ${dot(w.apply.until)}까지(일반 신청기한, 법정 예외는 apply.note)` : ' — 끝난 날 이후 12개월 이내'}.`);
  }
  const tally = (list) => `미충족 ${list.filter((c) => c.status === 'unmet').length}건 · 확인 필요 ${list.filter((c) => c.status === 'check').length}건`;
  const s = r.employer.subsidy;
  if (s.monthly === null) {
    lines.push(s.withheld ?? (r.employer.needs.length ? '사업주 장려금은 우선지원대상기업인지 알려 주면 셉니다(employer.needs 참고).' : '사업주 장려금도 위 사실을 넣으면 셉니다.'));
  } else {
    lines.push(`사업주 육아기 근로시간 단축 지원금 월 ${won(s.monthly)}${s.bonus ? `(기본 ${won(s.base)} + 최초 허용 ${won(s.bonus)})` : ''}${s.total !== null ? ` · 기간 합계 ${won(s.total)}(절반 ${won(s.firstHalf)}은 3개월마다, 나머지 ${won(s.rest)}은 끝난 뒤 6개월 계속 고용 후)` : ''}.`);
    lines.push(`사업주 요건 — ${tally(s.eligibility)}.`);
    if (s.monthly > 0 && s.apply.firstFrom) lines.push(`장려금 신청 ${dot(s.apply.firstFrom)}부터 3개월마다${s.apply.restFrom ? ` · 나머지 50%는 ${dot(s.apply.restFrom)}부터` : ''}.`);
  }
  const ws = r.employer.workSharing;
  if (ws && ws.monthly !== null) lines.push(`업무분담 지원금 월 ${won(ws.monthly)} — 요건 ${tally(ws.eligibility)}.`);
  return lines;
}

export function register(server) {
  server.registerTool(
    name,
    {
      title: '육아기 근로시간 단축 급여·장려금 계산',
      description:
        '육아기 근로시간 단축 급여(고용보험법 제73조의2·시행령 제104조의2)를 앞 10시간분(월 통상임금 100%)과 나머지 시간분(월 통상임금 80%)으로 나눠 계산하고, ' +
        '사업주 출산육아기 고용안정장려금(시행령 제29조·고시 별표 5 — 단축 지원금·처음 허용한 사업장 추가분·업무분담 지원금)과 신청 시기(시행규칙 제51조)를 함께 낸다. ' +
        '상한·하한은 곱하기 전 월 통상임금 해당 금액에 붙이고, 지급대상 기간이 속한 날의 판(2024. 7. 1.·2025. 1. 1.·2026. 1. 1. 시행)을 쓴다. 1개월이 안 되는 기간은 그 기간이 시작하는 달의 일수로 나눠 일할한다. ' +
        '월 통상임금·단축 전·후 1주 소정근로시간·개시일이 없으면 금액을 내지 않고 needs 로 묻는다. 요건은 충족·미충족·확인 필요로 나누고 넣지 않은 사실은 확인 필요로 둔다. ' +
        '단축 후 회사가 지급하는 임금(시간 비례 감액)은 임금 구성에 따라 달라 계산하지 않는다. 회사가 단축 중 매월 주는 금액(employerPaidMonthly)을 넣으면 시행령 제104조의4 감액을 뺀 지급액(payable)을 내고, 요건 미충족이면 지급액은 0이다. 이름·주민등록번호를 받지 않는다.',
      inputSchema: {
        monthlyOrdinaryWage: z.number().optional().describe('단축 개시일 기준, 단축 전 근로시간으로 받던 월 통상임금(원)'),
        weeklyHoursBefore: z.number().optional().describe('단축 전 1주 소정근로시간(연장근로 제외, 40 이하)'),
        weeklyHoursAfter: z.number().optional().describe('단축 후 1주 소정근로시간(15 이상 35 이하)'),
        startDate: z.string().optional().describe(`단축 개시일 ${DATE}`),
        endDate: z.string().optional().describe(`단축 끝나는 날 ${DATE}(그날 포함). 비우면 월액만 낸다`),
        insuredDays180: z.boolean().optional().describe('개시일 전 고용보험 피보험 단위기간 합산 180일 이상이면 true'),
        childEligible: z.boolean().optional().describe('대상 자녀가 만 12세 이하 또는 초등학교 6학년 이하이면 true'),
        maternityOverlapDays: z.number().int().optional().describe('단축 기간 중 출산전후휴가와 겹친 일수(없으면 0)'),
        priorUseDays: z.number().int().optional().describe('같은 자녀로 앞서 쓴 육아기 근로시간 단축 일수(처음이면 0). 1년 한도는 나눠 쓴 기간의 합이다'),
        priorityFirm: z.boolean().optional().describe('회사가 우선지원대상기업이면 true(고용보험법 시행령 제12조). 비우면 사업주 금액을 내지 않는다'),
        firstTimeGrant: z.boolean().optional().describe('육아기 근로시간 단축을 한 번도 허용하지 않던 사업장이 처음 허용했고 이 근로자가 첫~세 번째 허용 사례면 true'),
        ownerRelative: z.boolean().optional().describe('근로자가 사업주(법인은 대표이사)의 배우자·직계 존비속이면 true'),
        foreignNonResident: z.boolean().optional().describe('근로자가 거주(F-2)·영주(F-5)·결혼이민자(F-6)가 아닌 외국인이면 true'),
        employerExcluded: z.boolean().optional().describe('공공기관·지방공기업·제외 업종 등 장려금 지원 제외 사업주(고시 제17조)이면 true'),
        monthlyReportedPay: z.number().optional().describe('사업주가 신고한 근로자의 월평균 보수(원)'),
        employerPaidMonthly: z.number().optional().describe('단축 기간 중 회사가 매월 주는 임금과 단축을 이유로 주는 금품의 합계(원). 넣으면 급여 감액(시행령 제104조의4)을 반영한 지급액을 낸다'),
        currentlyInsured: z.boolean().optional().describe('근로자가 지금 이 사업장의 고용보험 피보험자이면 true(장려금 요건, 개시 전 180일 이력과 별개)'),
        workSharing: z
          .object({
            paidMonthly: z.number().describe('업무분담자에게 업무분담을 사유로 매월 지급한 금액(원)'),
            startDate: z.string().optional().describe(`업무분담 시작일 ${DATE}(비우면 단축 개시일)`),
            otherSupport: z.boolean().optional().describe('업무분담자가 다른 근로시간 단축·대체인력 지원금의 지원 대상이면 true'),
            otherSupportMonthly: z.number().optional().describe('같은 업무분담 지정·대체인력으로 사업주가 매월 받은 다른 지원금(원) — 뺀다'),
          })
          .optional()
          .describe('업무분담자를 지정해 금전을 지원했을 때만'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const r = calcChildcareReduction(a);
        return text({
          ok: true,
          headline: headline(r),
          needs: r.needs,
          assumptions: r.assumptions,
          result: { status: r.status, worker: r.worker, employer: r.employer },
          wageNote: WAGE_NOTE,
          basis: BASIS,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
