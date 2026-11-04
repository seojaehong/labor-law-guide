// 출근율(연차 80%) — 사이트 엔진(src/lib/calc/attendance-rate)과 문구 모듈(src/app/tools/attendance-rate/copy)을 그대로 불러 쓴다.
// 날짜와 날 수만 받는다. 파일·네트워크를 건드리지 않고 주민등록번호를 받지 않는다 — 원격판에 그대로 실을 수 있다.
import { z } from 'zod';
import { calcAttendanceRate, monthlyLeaveDay, CAUSE_IDS, CAUSES } from '@/lib/calc/attendance-rate';
import {
  headline, effectLines, formulaLines, monthLines, fmtPct, fmtDays,
  CAUSE_COPY, GROUP_COPY, MONTH_RULES, OPEN_ITEMS, SCOPE_ITEMS, SCHEDULED_HINT, ACCRUAL_HINT,
} from '@/app/tools/attendance-rate/copy';
import { bannedHits, SERVICE_BANNED, RESULT_BANNED } from '@/lib/tool-kit/banned';
import { text } from '../../lib/common.mjs';

export const name = 'calc_attendance_rate';

const SITE = 'https://yellowenvelope.kr/tools/attendance-rate';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// 응답에 싣지 않는 말 — 사이트 금지어 + 「대신·대행·대리·포괄」. 사이트 문구에 들어 있으면 그 문장을 뺀다.
const WORDS = [...SERVICE_BANNED, ...RESULT_BANNED, '대신', '대행', '대리', '포괄'];
const clean = (lines) => lines.filter((l) => bannedHits(l, WORDS).length === 0);

const GROUP_TAG = { deemed: '출근한 것으로 보는 날', excluded: '소정근로일수에서 빼는 날', absent: '결근으로 세는 날' };

const daysShape = Object.fromEntries(
  CAUSE_IDS.map((c) => {
    const def = CAUSES[c];
    const tag = def.alt ? `${GROUP_TAG[def.cls]}(출근한 것으로 본 값도 함께 냄)` : GROUP_TAG[def.cls];
    return [c, z.number().optional().describe(`${CAUSE_COPY[c].label} — ${tag}. 일수`)];
  }),
);

const pctText = (r) => (r ? `${fmtPct(r)}%` : null);
const daysText = (r) => (r ? `${fmtDays(r)}일` : null);
const outcomeText = (o) =>
  o && { status: o.status, rate: pctText(o.rate), realRate: pctText(o.realRate), days: daysText(o.days), tally: o.tally };

export function register(server) {
  server.registerTool(
    name,
    {
      title: '출근율(연차 80%)',
      description:
        '입사일·연차가 생기는 날·그 1년의 소정근로일수와 원인별 일수(출근한 것으로 보는 날·소정근로일수에서 빼는 날·결근)로 연차휴가가 생기는 출근율 80%를 채웠는지와 생기는 일수를 계산한다(사이트 /tools/attendance-rate 와 같은 엔진, 근로기준법 제60조). ' +
        '소정근로일수 S = 출근 A + 출근 간주 D + 빼는 날 X + 결근 B(넣지 않은 날은 출근으로 센다). 출근율 = (A+D) ÷ S. ' +
        '(A+D)/S 가 80% 이상(5×(A+D) ≥ 4×S)이면 기본일수 전부(근속 가산 포함, 25일 한도). 80%에 못 미치고 빼는 날을 뺀 (A+D)/(S−X) 가 80% 이상이면 기본일수 × (S−X) ÷ S(끝수 처리 없음, 대법원 2015다66052). 그 밖이면 1개월 개근할 때마다 1일(제60조제2항). S 전부가 빼는 날이면 생기지 않는다. ' +
        '부당하다고 확정된 정직·회사 사정 휴업은 해석이 갈려 출근한 것으로 본 값을 나란히 낸다. month 를 넣으면 그 달 개근 여부(1일)도 본다. ' +
        '1년 소정근로일수를 달력에서 세는 일, 쟁의행위·징계가 정당한지, 단시간 근로자 시간 비례, 회계연도 첫해 비례, 연차수당 금액, 연차가 생기는 날이 2012. 8. 2. 전인 연차(1년 이상이면 2013. 8. 2. 전), 입사 1년이 되는 날이 2018. 5. 29. 이전인 연차는 다루지 않는다.',
      inputSchema: {
        hireDate: z.string().describe('입사일 YYYY-MM-DD'),
        accrualDate: z.string().describe(`연차가 생기는 날 YYYY-MM-DD. ${ACCRUAL_HINT}`),
        scheduledDays: z.number().describe(`그 1년의 소정근로일수(1~366 정수). ${SCHEDULED_HINT}`),
        days: z.object(daysShape).optional().describe('원인별 일수(0 이상 정수). 여기에 넣지 않은 소정근로일은 출근한 날로 센다. 합이 소정근로일수를 넘으면 안 된다'),
        month: z
          .object({
            scheduled: z.number().describe('그 달 소정근로일수(1~31)'),
            excluded: z.number().describe('그 달 소정근로일수에서 빼는 날'),
            absent: z.number().describe('그 달 결근한 날'),
          })
          .optional()
          .describe('한 달 개근 확인(제60조제2항) — 출근한 것으로 보는 날은 어느 칸에도 넣지 않는다'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const r = calcAttendanceRate({ hireDate: a.hireDate, accrualDate: a.accrualDate, scheduledDays: a.scheduledDays, days: a.days ?? {} });
        const m = a.month ? monthlyLeaveDay(a.month) : null;
        const entered = CAUSE_IDS.filter((c) => (a.days?.[c] ?? 0) > 0).map((c) => ({
          cause: c,
          label: CAUSE_COPY[c].label,
          group: GROUP_COPY[CAUSES[c].cls].title,
          days: a.days[c],
          basis: CAUSE_COPY[c].basis,
        }));
        return text({
          ok: true,
          headline: clean(headline(r)),
          effect: clean(effectLines(r)),
          formula: clean(formulaLines(r)),
          result: { ...r, primaryText: outcomeText(r.primary), altText: outcomeText(r.alt) },
          entered: entered.map((e) => ({ ...e, basis: clean([e.basis])[0] ?? null })),
          ...(m ? { month: { ...m, lines: clean(monthLines(m)) }, monthRules: clean(MONTH_RULES) } : {}),
          openItems: clean(OPEN_ITEMS),
          notCovered: clean(SCOPE_ITEMS),
          basis: [
            '근로기준법 제60조제1항·제2항·제4항',
            '근로기준법 제60조제6항(2027. 6. 10.부터 제7항) — 출근한 것으로 보는 기간',
            '대법원 2013. 12. 26. 선고 2011다4629 판결',
            '대법원 2019. 2. 14. 선고 2015다66052 판결',
            '대법원 2014. 3. 13. 선고 2011다95519 판결',
            '대법원 2017. 5. 17. 선고 2014다232296, 232302 판결',
            '고용노동부 「연차유급휴가 등의 부여 시 소정근로일수 및 출근여부 판단기준」(임금근로시간정책팀-3228, 2007. 10. 25.)',
            '임금근로시간과-906·-636, 근로개선정책과-3370, 근로기준과-3296, 임금근로시간과-1818',
          ],
          site: SITE,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
