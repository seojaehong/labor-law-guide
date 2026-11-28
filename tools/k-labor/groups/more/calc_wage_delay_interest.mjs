// 임금 지연이자 — 사이트 정본 엔진(src/lib/calc/wage-delay-interest)과 계산기 문구(src/app/tools/wage-delay-interest/copy)를 그대로 불러 쓴다.
// 금액·날짜·재직 여부만 받는다. 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다.
import { z } from 'zod';
import { calcWageDelayInterest, calcWageDelayInterestChecked } from '@/lib/calc/wage-delay-interest';
import { BASIS, CONSEQUENCES, EXCLUSION_REASONS, FORMULA, NOT_COVERED, headline, itemLine } from '@/app/tools/wage-delay-interest/copy';
import { todayKst } from '@/lib/tool-kit';
import { text } from '../../lib/common.mjs';

export const name = 'calc_wage_delay_interest';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DATE = 'YYYY-MM-DD';

export function register(server) {
  server.registerTool(
    name,
    {
      title: '임금 지연이자 계산',
      description:
        '늦게 지급했거나 아직 지급하지 않은 임금·퇴직금을 항목별로 받아 근로기준법 제37조의 연 20% 지연이자를 계산한다(사이트 /tools/wage-delay-interest 와 같은 엔진). ' +
        '기준일 — 퇴직 때 정산하는 임금·퇴직금 일시금(제1호)은 마지막 근무일(사망이면 사망일) + 14일, 재직 중 임금(제2호)은 정기지급일. ' +
        '2025. 10. 22.까지의 정기지급일 임금은 재직 중에는 붙지 않고(법률 제20520호 부칙 제2조), 퇴직할 때까지 받지 못했으면 제1호로 센다. 2호 이자가 생긴 뒤 퇴직하면 정기지급일 그대로(제37조 제2항). ' +
        '지연이자 = 금액 × 20/100 × (기준일 다음 날부터 지급일까지 일수 − 적용 제외 일수) ÷ 365, 항목마다 원 미만 버림, 합계는 항목 값의 합. 기준일이 토요일·공휴일이어도 미루지 않는다. ' +
        '적용 제외 기간(제37조 제3항·시행령 제18조)은 넣은 기간을 빼기만 하고 사유 해당 여부는 가리지 않는다. 사유가 일부 항목에만 있으면 그 항목의 exclusions 에 넣는다(바깥 exclusions 는 모든 항목 공통). ' +
        '민법·상법 지연손해금, 퇴직연금 부담금 지연이자, 재직 중 중간정산, 1개월을 넘는 기간으로 산정하는 상여금의 재직 중 기준일, 일부 지급 때의 충당 순서는 다루지 않는다. ' +
        '사용자가 말한 값만 넣는다 — 재직 여부(employed)와 마지막 근무일을 둘 다 비우면 금액을 내지 않고(status needs-input, result.total null) needs 에 물을 질문이 온다. needs 의 question 을 사용자에게 묻고, 재직 확인 시 employed: true 또는 퇴직 확인 시 lastWorkDay 를 기존 항목과 함께 넣어 다시 부른다. employed 가 도구 입력에 없으면 도구 목록을 새로 불러온다.',
      inputSchema: {
        employed: z
          .boolean()
          .optional()
          .describe('사용자가 말한 값만 넣는다. true = 지금도 재직 중(lastWorkDay 는 비운다) · false = 퇴직(lastWorkDay 필요). 재직 여부도 lastWorkDay 도 비우면 금액 없이 needs 로 묻는다(종전에는 재직 중으로 봤다)'),
        lastWorkDay: z
          .string()
          .optional()
          .describe(`마지막 근무일(근로관계의 마지막 날 = 4대보험 상실일의 전날) 또는 사망일 ${DATE}. 퇴직했으면 넣는다(넣으면 employed 는 비워도 된다)`),
        items: z
          .array(
            z.object({
              kind: z
                .enum(['retirement', 'periodic'])
                .describe('retirement = 퇴직금(일시금)·퇴직 때 정산하는 임금(마지막 근무일 필요) · periodic = 정기지급일이 정해진 임금(월급 등)'),
              amount: z.number().int().describe('늦게 지급한(또는 아직 지급하지 않은) 금액(원, 1원 이상)'),
              periodicPayDate: z.string().optional().describe(`periodic 일 때 취업규칙·계약에서 정한 정기지급일 ${DATE}`),
              paidDate: z.string().describe(`실제로 지급한 날 ${DATE}. 아직 지급하지 않았으면 계산할 날`),
              exclusions: z
                .array(
                  z.object({
                    from: z.string().describe(`적용 제외 시작일 ${DATE}`),
                    to: z.string().describe(`적용 제외 끝나는 날 ${DATE}(그날 포함)`),
                  }),
                )
                .optional()
                .describe('이 항목에만 적용 제외 사유가 있을 때 그 기간. 모든 항목에 공통이면 바깥 exclusions 에 넣는다'),
            }),
          )
          .min(1)
          .describe('항목 목록. 일부만 늦게 지급했으면 지급한 금액과 날을 항목으로 나눠 넣는다'),
        exclusions: z
          .array(
            z.object({
              from: z.string().describe(`적용 제외 시작일 ${DATE}`),
              to: z.string().describe(`적용 제외 끝나는 날 ${DATE}(그날 포함)`),
            }),
          )
          .optional()
          .describe('모든 항목에 공통인 적용 제외 사유(근로기준법 제37조 제3항·시행령 제18조)가 이어진 기간. 일부 항목에만 사유가 있으면 그 항목의 exclusions 에 넣는다. 겹치면 한 번만 뺀다. 없으면 비운다'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const lastWorkDay = a.lastWorkDay || undefined;
        const has = (l) => Array.isArray(l) && l.length > 0;
        const hasExcl = has(a.exclusions) || a.items.some((it) => has(it.exclusions));
        // 261128 — 재직 여부를 비우면 재직 중으로 보지 않는다. 엔진이 needs 로 돌려준다
        const checked = calcWageDelayInterestChecked({ employed: a.employed, lastWorkDay, items: a.items, ...(has(a.exclusions) ? { exclusions: a.exclusions } : {}) });
        if (checked.status === 'needs-input') {
          return text({
            ok: true, status: 'needs-input', needs: checked.needs, assumptions: checked.assumptions,
            headline: [
              '임금 지연이자는 금액을 내지 않습니다.',
              checked.needs.some((need) => need.key === 'employed')
                ? '재직 중이라고 확인되면 기존 항목에 employed: true를 더해 다시 호출하세요. 도구 입력에 employed가 없으면 도구 목록을 새로 불러오세요. 퇴직했다면 마지막 근무일을 확인하세요.'
                : '마지막 근무일을 확인한 뒤 기존 항목에 lastWorkDay를 더해 다시 호출하세요.',
            ],
            result: { items: [], total: null },
            site: 'https://yellowenvelope.kr/tools/wage-delay-interest',
          });
        }
        const { status: _s, needs, assumptions, ...r } = checked;
        // 화면과 같이 — 적용 제외 기간(공통·항목별)을 넣었을 때만 「빼지 않으면」 값을 함께 낸다. 그 값은 항목별 기간도 뺀다
        const full = hasExcl
          ? calcWageDelayInterest({ lastWorkDay, items: a.items.map(({ kind, amount, periodicPayDate, paidDate }) => ({ kind, amount, periodicPayDate, paidDate })) })
          : undefined;
        const today = todayKst();
        return text({
          ok: true,
          status: 'ok',
          needs,
          assumptions,
          headline: headline(r, full),
          result: r,
          ...(full ? { totalWithoutExclusions: full.total } : {}),
          itemLines: r.items.map((it, i) => itemLine(it, i, today)),
          formula: FORMULA,
          consequences: CONSEQUENCES,
          ...(hasExcl ? { exclusionReasons: EXCLUSION_REASONS } : {}),
          notCovered: NOT_COVERED,
          basis: BASIS,
          site: 'https://yellowenvelope.kr/tools/wage-delay-interest',
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
