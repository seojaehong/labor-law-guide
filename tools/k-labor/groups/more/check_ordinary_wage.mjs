// 통상임금 점검 — 사이트 엔진(src/lib/calc/ordinary-wage-check)과 근거 원문(ordinary-wage-sources)을 그대로 불러 쓴다.
// 화면(src/app/tools/ordinary-wage-check/OrdinaryWageClient.tsx)의 toItem·합계·문장 순서를 따른다.
// 금액·날짜·답만 받는다. 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다.
import { z } from 'zod';
import {
  AGREED_WAGE_NOTICE, KIND_LABEL, OLD_ERA_NOTICE, RIGHT_TO_PAY_NOTICE, ROUNDING_NOTE, UNIT_HOURS_NOTE,
  checkItem, directionSentence, eraLabel, eraOn, hourlyText, itemNotes, sumIncluded, summaryLines,
} from '@/lib/calc/ordinary-wage-check';
import { SOURCES } from '@/lib/calc/ordinary-wage-sources';
import { todayKst } from '@/lib/tool-kit';
import { text } from '../../lib/common.mjs';

export const name = 'check_ordinary_wage';

const SITE = 'https://yellowenvelope.kr/tools/ordinary-wage-check';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const won = (n) => `${n.toLocaleString('ko-KR')}원`;

// 화면의 종류별 기본 지급 횟수(OrdinaryWageClient DEFAULT_TIMES)
const DEFAULT_TIMES = { bonus: 6, holiday: 2, performance: 1, business: 1 };

// 화면 page.tsx 의 근거 목록 그대로
const BASIS = [
  '근로기준법 시행령 제6조 제1항 — 통상임금은 정기적이고 일률적으로 소정근로 또는 총 근로에 대하여 지급하기로 정한 금액',
  '대법원 2024. 12. 19. 선고 2020다247190·2023다302838 전원합의체 판결 — 고정성을 통상임금의 요건에서 뺐고, 2024. 12. 19. 이후 제공한 연장근로 등부터 적용(이 사건·병행사건은 소급)',
  '대법원 2013. 12. 18. 선고 2012다89399 전원합의체 판결 — 정기성·일률성·소정근로 대가의 뜻, 가족수당·근속수당, 2024. 12. 18.까지 제공분의 종전 기준(고정성)',
  '대법원 2025. 1. 23. 선고 2019다204876 판결 · 2025. 8. 14. 선고 2023다216777 판결 — 장애인수당, 지급 조건의 효력, 약정 통상임금, 전년도 실적분 성과급',
  '대법원 2025. 8. 14. 선고 2021다258296 판결 — 소정근로일수에 미치지 못하는 출근율 조건·재직조건이 붙은 상여금',
  '근로기준법 시행령 제6조 제2항 제4·5·7호 — 월 밖의 기간으로 정한 임금도 같은 방식으로 시간급을 내 합산',
  '고용노동부 「(개정)통상임금 노사지도 지침」(2025. 2. 6.) — 행정 내부 지침, 요지만 적음',
];

const ANSWER = z.enum(['yes', 'no', 'unknown']);
const KINDS = Object.keys(KIND_LABEL);

const ITEM = z.object({
  kind: z.enum(KINDS).describe(`종류 — ${KINDS.map((k) => `${k}(${KIND_LABEL[k]})`).join(' · ')}`),
  name: z.string().optional().describe('회사에서 부르는 이름(비우면 종류 이름)'),
  amount: z.number().describe('1회 지급액(원, 근무를 빠짐없이 했을 때 정해진 금액). 0 이면 비어 있는 것으로 보고 보류'),
  timesPerYear: z.number().int().optional().describe('1년에 주는 횟수 — 12(매달)·6(격월)·4(분기)·3(연 3번)·2(반기·명절)·1(연 1번). 비우면 종류별 기본값(정기상여금 6, 명절상여 2, 성과급·경영성과급 1, 그 밖 12)'),
  regular: ANSWER.default('unknown').describe('정해진 주기: 매달 또는 정해진 주기마다 지급하도록 정해져 있나 — yes(예)·no(아니오)·unknown(모름)'),
  uniform: ANSWER.default('unknown').describe('지급 대상: 모두에게, 또는 직무·자격·근속기간처럼 일의 가치와 관련된 조건을 갖춘 사람 모두에게 주나. 부양가족 수·장애 여부처럼 일과 무관한 조건이면 no'),
  forWork: ANSWER.default('unknown').describe('근무시간의 대가: 정해진 근무시간을 빠짐없이 일하면 그 대가로 받나. 실적 평가·무사고·추가 근무 같은 요건이면 no. 재직·근무일수·출근율 조건만 있으면 yes(조건은 아래 칸에). 성과급은 보지 않는다'),
  employedOnPayday: z.boolean().optional().describe('지급일에 재직 중이어야 받는다'),
  workDays: z.object({
    required: z.number().int().describe('조건 일수'),
    scheduled: z.number().int().describe('그 기간의 소정근로일수(2개월마다 따지면 2개월분)'),
  }).optional().describe('일정 근무일수를 채워야 받는 조건(출근율 조건과 함께 넣지 않는다)'),
  attendanceRate: z.number().optional().describe('전액을 주는 출근율(%) 조건(근무일수 조건과 함께 넣지 않는다)'),
  proRataOnLeave: z.boolean().optional().describe('지급일 전에 퇴직해도 그때까지 근무일수에 비례해 지급한다(지급일 재직 조건이 있을 때만, 2024. 12. 18.까지 제공분에만 영향)'),
  proRataOnShortDays: z.boolean().optional().describe('정한 일수·출근율을 못 채워도 일한 날만큼 일할해 지급한다(근무일수·출근율 조건이 있을 때만, 2024. 12. 18.까지 제공분에만 영향)'),
  leaveOrDisciplineOnly: z.boolean().optional().describe('휴직자·복직자·징계 대상자에게는 주지 않는다는 규정이 있다'),
  minimum: z.number().optional().describe('성과급만 — 평가와 무관하게 최소로 보장된 1회 금액(원, 없으면 0)'),
  performanceYear: z.enum(['current', 'previous', 'unknown']).optional().describe('성과급만 — current(점검 기준일이 속한 해의 실적분, 지급이 다음 해여도)·previous(전년도 실적분, 지급 시기만 기준일이 속한 해)·unknown(모름)'),
  baseForAll: z.number().optional().describe('가족수당만 — 부양가족과 상관없이 모두에게 주는 1회 기본금액(원, 없으면 0)'),
});

/** 화면 toItem 과 같다 — 법정수당은 조건 칸을 숨기고, 종류에 맞지 않는 칸은 엔진에 넘기지 않는다 */
function toItem(r) {
  const cond = r.kind !== 'statutory';
  const days = cond && r.workDays ? r.workDays : undefined;
  const rate = cond && r.attendanceRate !== undefined ? r.attendanceRate : undefined;
  const payday = cond && Boolean(r.employedOnPayday);
  return {
    kind: r.kind,
    name: r.name || KIND_LABEL[r.kind],
    amount: r.amount,
    timesPerYear: r.timesPerYear ?? DEFAULT_TIMES[r.kind] ?? 12,
    regular: r.regular ?? 'unknown',
    uniform: r.uniform ?? 'unknown',
    forWork: r.forWork ?? 'unknown',
    employedOnPayday: payday,
    workDays: days,
    attendanceRate: rate,
    proRataOnLeave: payday && Boolean(r.proRataOnLeave),
    proRataOnShortDays: Boolean(days || rate !== undefined) && Boolean(r.proRataOnShortDays),
    leaveOrDisciplineOnly: cond && Boolean(r.leaveOrDisciplineOnly),
    minimum: r.kind === 'performance' ? (r.minimum ?? 0) : undefined,
    performanceYear: r.kind === 'performance' ? (r.performanceYear ?? 'unknown') : undefined,
    baseForAll: r.kind === 'family' ? (r.baseForAll ?? 0) : undefined,
  };
}

export function register(server) {
  server.registerTool(
    name,
    {
      title: '통상임금 점검',
      description:
        '임금 항목마다 세 요소(정해진 주기·지급 대상·근무시간의 대가)와 붙어 있는 조건(지급일 재직·근무일수·출근율)을 받아, 통상임금에 들어가는 쪽 / 빠지는 쪽 / 입력만으로 가리기 어려움(보류) 중 어느 쪽으로 볼 요소가 있는지와 근거 판결 원문을 낸다(사이트 /tools/ordinary-wage-check 와 같은 엔진). ' +
        '기준은 연장근로 등을 제공한 날로 가른다 — 2024. 12. 19.부터 새 기준(대법원 2020다247190 전원합의체, 고정성 제외), 2024. 12. 18.까지 종전 기준(2012다89399, 고정성). 두 기준 결과를 함께 보인다. ' +
        '시간급(참고) = 들어가는 쪽 항목의 1년 금액 합 ÷ 12 ÷ 월 기준시간(시행령 제6조 제2항 제4·5·7호), 소수 셋째 자리에서 반올림. 성과급은 평가와 무관한 최소 보장분만, 가족수당은 모두에게 주는 기본금액만 더하고, 전년도 실적분 성과급과 주휴수당 같은 법정수당은 합계에 넣지 않는다. ' +
        '결과는 규정 원문과 운용 실태에 따라 달라질 수 있는 점검이며 단정하지 않는다. 연장·야간·휴일근로수당 금액은 계산하지 않고, 병행사건(새 기준 소급) 여부는 가리지 않는다.',
      inputSchema: {
        date: z.string().optional().describe('연장근로 등을 제공한 날(점검 기준일) YYYY-MM-DD. 비우면 오늘(KST)'),
        unitHours: z.number().optional().describe('월 기준시간(소수 둘째 자리까지, 744 이하). 비우면 209 — 주 40시간 + 주휴 8시간을 365일로 셈해 반올림한 값'),
        items: z.array(ITEM).min(1).describe('임금 항목 목록'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const date = a.date || todayKst();
        const era = eraOn(date);
        const other = era === 'old' ? 'new' : 'old';
        const h = a.unitHours ?? 209;

        const used = new Set();
        const checked = a.items.map((row, k) => {
          const label = row.name || KIND_LABEL[row.kind];
          try {
            if (row.kind !== 'statutory' && row.workDays && row.attendanceRate !== undefined) {
              throw new Error('근무일수 조건과 출근율 조건 중 하나만 넣어 주세요');
            }
            const item = toItem(row);
            const now = checkItem(item, era);
            const alt = checkItem(item, other);
            now.reasons.forEach((id) => used.add(id));
            return {
              item, now,
              out: {
                no: k + 1,
                name: label,
                kind: KIND_LABEL[row.kind],
                direction: now.direction,
                sentence: directionSentence(now.direction, era),
                ...(alt.direction !== now.direction ? { otherEra: directionSentence(alt.direction, other) } : {}),
                notes: itemNotes(item, now),
                ...(now.direction === 'in' ? { annual: now.annual, annualText: `1년 ${won(now.annual)}${now.priorYear ? '(전년도분)' : ''}` } : {}),
                partial: now.partial,
                priorYear: now.priorYear,
                open: now.open,
                reasons: now.reasons,
              },
            };
          } catch (e) {
            return { out: { no: k + 1, name: label, kind: KIND_LABEL[row.kind], error: e instanceof Error ? e.message : String(e) } };
          }
        });

        const invalid = checked.filter((c) => 'error' in c.out).length;
        const items = checked.flatMap((c) => (c.item ? [c.item] : []));
        const cur = sumIncluded(items, era, h);
        const neu = sumIncluded(items, 'new', h);
        const old = sumIncluded(items, 'old', h);
        const checks = checked.flatMap((c) => (c.now ? [c.now] : []));
        const payday = items.some((i) => i.employedOnPayday);

        const sources = Object.fromEntries([...used].map((id) => {
          const s = SOURCES[id];
          return [id, { cite: s.cite, ...(s.quote ? { quote: s.quote } : { note: `요지: ${s.note}` }) }];
        }));

        return text({
          ok: true,
          headline: summaryLines(era, checks, cur.hourly, invalid),
          result: { date, era, eraLabel: eraLabel(era), unitHours: h, current: cur, newEra: neu, oldEra: old, invalid },
          compare: `${eraLabel('new')} ${hourlyText(neu)} · ${eraLabel('old')} ${hourlyText(old)}`,
          formula: cur.count > 0
            ? `들어가는 쪽 항목 1년 합계 ${won(cur.annual)} ÷ 12 ÷ ${h.toLocaleString('ko-KR')}시간 = ${hourlyText(cur)}`
            : '들어가는 쪽 항목이 없어 시간급을 내지 않았습니다.',
          items: checked.map((c) => c.out),
          notices: [
            ...(era === 'old' ? [OLD_ERA_NOTICE] : []),
            ...(payday ? [RIGHT_TO_PAY_NOTICE] : []),
            AGREED_WAGE_NOTICE,
          ],
          unitHoursNote: UNIT_HOURS_NOTE,
          roundingNote: ROUNDING_NOTE,
          sources,
          basis: BASIS,
          site: SITE,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
