// 중도퇴사자 연말정산(고정형) — 사이트 정본 엔진(src/lib/calc/midyear-settlement)과 계산기 문구(src/app/tools/midyear-settlement/copy)를 그대로 불러 쓴다.
// 금액과 퇴사한 해만 받는다. 파일·네트워크·주민등록번호를 건드리지 않는다 — 원격판에 그대로 실을 수 있다.
// 화면 문구 가운데 금지어(SERVICE_BANNED·RESULT_BANNED·대신·대행·대리·포괄)를 품은 줄은 응답에 싣지 않는다
//   (예: NOTICE 의 「세무대리·신고서 작성 대행이 아닙니다」, SCOPE_ITEMS 의 세후 계약 줄, 기준 없는 해 headline 둘째 줄).
import { z } from 'zod';
import { calcMidyear, defaultYear } from '@/lib/calc/midyear-settlement';
import {
  effectLines, formulaLines, headline, HOMETAX_LINK, HOMETAX_URL, LIMITS, NOTICE, SCOPE_ITEMS, SCOPE_STOP, whyLines,
} from '@/app/tools/midyear-settlement/copy';
import { bannedHits, SERVICE_BANNED, RESULT_BANNED } from '@/lib/tool-kit/banned';
import { todayKst } from '@/lib/tool-kit';
import { text } from '../../lib/common.mjs';

export const name = 'calc_midyear_settlement';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const SITE = 'https://yellowenvelope.kr/tools/midyear-settlement';
const WORDS = [...SERVICE_BANNED, ...RESULT_BANNED, '대신', '대행', '대리', '포괄'];
/** 금지어를 품은 줄은 뺀다 */
const clean = (lines) => lines.filter((l) => bannedHits(l, WORDS).length === 0);

// 화면(page.tsx) 근거 목록 그대로
const BASIS = [
  '소득세법 제137조 제1항 — 퇴직하는 달의 근로소득을 줄 때 연말정산',
  '소득세법 제20조 제2항, 제47조 제1항 — 총급여는 비과세를 뺀 금액, 근로소득공제 5구간(한도 2천만원)',
  '소득세법 제50조 제1항 제1호, 제51조의3, 제52조 제1항 — 본인 기본공제 150만원, 국민연금 연금보험료공제, 건강·장기요양·고용보험료 소득공제',
  '소득세법 제55조 제1항, 제59조 제1항·제2항 — 기본세율, 근로소득세액공제와 총급여 구간별 한도',
  '소득세법 제52조 제8항, 제59조의4 제9항 제1호 — 표준세액공제 13만원은 보험료 소득공제를 신청하지 않은 경우에만. 그래서 두 방식을 다 계산해 나란히 보여 줌. 어느 쪽인지는 근로자가 보험료 소득공제를 신청했는지로 정해짐',
  '소득세법 제61조 — 세액공제가 산출세액을 넘는 부분은 없는 것으로 봄(결정세액 0 아래로 내려가지 않음)',
  '국고금 관리법 제47조, 지방세법 제103조의13 제1항, 지방세기본법 제59조 — 10원 미만 버림, 지방소득세는 소득세의 100분의 10',
  '소득세법 제86조 제1호 — 1천원 미만 원천징수세액은 징수하지 않음. 더 낼 소득세가 그런 경우는 그 방식 금액에 징수하지 않는다고 적음. 지방소득세에 따로 걸리는지는 확인하지 못해 계산한 금액을 보여 줌',
];

const WON = (what) => z.number().describe(`${what}(원)`);

export function register(server) {
  server.registerTool(
    name,
    {
      title: '중도퇴사자 연말정산',
      description:
        '퇴사한 해에 받은 급여·비과세·4대보험료(근로자 부담)·이미 낸 소득세로 퇴직하는 달 연말정산(소득세법 제137조 제1항)에서 더 내거나 돌려받을 소득세·지방소득세 예상액을 계산한다(사이트 /tools/midyear-settlement 와 같은 엔진). ' +
        '고정형 — 본인 기본공제 150만원·국민연금 연금보험료공제에 더해 두 방식을 다 계산해 나란히 낸다: A = 건강·장기요양·고용보험료 소득공제, B = 표준세액공제 13만원(둘은 함께 받을 수 없고, 어느 쪽인지는 근로자가 보험료 소득공제를 신청했는지로 정해진다). ' +
        '총급여 = 받은 급여 − 비과세 → 근로소득공제(5구간, 한도 2천만원) → 과세표준 → 기본세율 = 산출세액 − 근로소득세액공제(총급여 구간별 한도) [− 표준세액공제] = 결정세액(0 아래로 내려가지 않음). ' +
        '차감 소득세 = 결정세액 − 퇴직월 전 달까지 낸 소득세, 10원 미만은 0 쪽으로 버림. 지방소득세 = 결정세액의 10%(원 미만 버림) − 이미 낸 지방소득세. 퇴직월 간이세액은 정산액에 쓰지 않고, 회사가 그것을 먼저 뗀 경우의 영수증 대조값만 따로 낸다. ' +
        '부양가족·추가공제·종전 근무지·중소기업 취업자 감면·주택자금·신용카드 등 소득공제·특별세액공제·혼인세액공제·세후 금액 계약은 다루지 않고(해당하면 계산하지 않는다), 총급여 1억 2천만원 이상과 기준을 넣지 않은 해(지금은 2026년만)도 계산하지 않는다. 결과는 예상 금액이며 원천징수영수증·신고서를 만들지 않는다.',
      inputSchema: {
        hasExcludedItem: z
          .boolean()
          .describe(
            '올해 아래 가운데 하나라도 해당하면 true — 부양가족 공제 신청 · 본인 추가공제(70세 이상·장애인·부녀자·한부모) · 주택자금·주택청약·신용카드 등 소득공제 · 올해 다른 회사 급여 · 중소기업 취업자 소득세 감면 · 보장성보험료·의료비·교육비·기부금·월세·연금계좌 세액공제 · 혼인세액공제 · 일용근로자·비거주자·외국인 단일세율 · 회사가 세금을 부담하는 세후 금액 계약. true 이면 계산하지 않는다',
          ),
        year: z.number().int().optional().describe('퇴사한 해(귀속연도). 비우면 올해(KST) — 올해 기준이 없으면 직접 넣어야 한다'),
        totalPay: WON('받은 급여 합계 — 그해 1월부터 퇴직월까지, 비과세 포함'),
        nonTaxable: WON('비과세 급여 합계 — 퇴직월까지(급여명세서에 비과세로 적힌 금액)'),
        pension: WON('국민연금 근로자 부담 — 퇴직월까지 합계'),
        health: WON('건강보험료 근로자 부담 — 퇴직월까지 합계(퇴직정산으로 더 뗀 것은 더하고 돌려받은 것은 뺀다)'),
        longTermCare: WON('장기요양보험료 근로자 부담 — 퇴직월까지 합계(퇴직정산분 반영)'),
        employment: WON('고용보험료 근로자 부담 — 퇴직월까지 합계'),
        paidIncomeTax: WON('이미 낸 소득세 — 퇴직월 전 달까지 합계'),
        paidLocalTax: WON('이미 낸 지방소득세 — 퇴직월 전 달까지 합계'),
        lastMonthSimpleTax: z
          .number()
          .optional()
          .describe('퇴직월 간이세액(원, 대조용) — 넣으면 회사가 그것을 먼저 떼고 정산한 경우의 영수증 값도 낸다. 정산액 계산에는 쓰지 않는다'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const notCovered = [...clean(LIMITS), ...clean(SCOPE_ITEMS).map((s) => `범위 밖: ${s}`), '범위 밖: 회사가 세금을 부담하는 세후 금액으로 계약했다'];
        const hometax = { href: HOMETAX_URL, note: `${HOMETAX_LINK.text}${HOMETAX_LINK.after}` };
        if (a.hasExcludedItem) {
          return text({ ok: true, stopped: true, headline: clean(SCOPE_STOP), notice: clean(NOTICE), hometax, notCovered, basis: BASIS, site: SITE });
        }
        const year = a.year ?? defaultYear(Number(todayKst().slice(0, 4)));
        if (year === null) return text({ ok: false, error: '퇴사한 해를 골라 주세요.' });
        const { hasExcludedItem: _skip, year: _y, ...money } = a;
        const o = calcMidyear({ ...money, year });
        const body = {
          ok: true,
          headline: clean(headline(o)),
          result: o.kind === 'ok' ? { kind: 'ok', ...o.detail } : o,
        };
        if (o.kind === 'ok') {
          body.why = clean(whyLines(o.detail));
          body.effect = clean(effectLines(o.detail));
          body.formula = clean(formulaLines(o.detail));
        }
        return text({ ...body, notice: clean(NOTICE), hometax, notCovered, basis: BASIS, site: SITE });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
