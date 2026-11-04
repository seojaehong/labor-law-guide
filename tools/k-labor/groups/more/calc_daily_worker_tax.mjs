// 일용근로소득 원천징수 — 사이트 엔진(src/lib/calc/daily-worker-tax)과 계산기 문구(src/app/tools/daily-worker-tax/copy)를 그대로 불러 쓴다.
// 일급·일수만 받는다. 파일·네트워크·주민등록번호를 다루지 않는다 — 원격판에 그대로 실을 수 있다.
import { z } from 'zod';
import { calcDailyWorkerTax, expandLines } from '@/lib/calc/daily-worker-tax';
import {
  headline, paymentLine, formulaLines, CONSEQUENCES, NOT_COVERED, NOTICE, INPUT_GUIDE, BASIS, NTS, HOMETAX, ELIGIBILITY_STOP,
} from '@/app/tools/daily-worker-tax/copy';
import { SERVICE_BANNED, RESULT_BANNED, bannedHits } from '@/lib/tool-kit/banned';
import { text } from '../../lib/common.mjs';

export const name = 'calc_daily_worker_tax';

const SITE = 'https://yellowenvelope.kr/tools/daily-worker-tax';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// 사이트 문구 가운데 금지어(banned.ts 두 벌 + 대신·대행·대리·포괄)가 든 문장은 응답에 싣지 않는다
// (NOTICE 둘째 줄 「세무대리·신고서 작성 대행이 아닙니다」가 여기 걸린다).
const WORDS = [...SERVICE_BANNED, ...RESULT_BANNED, '대신', '대행', '대리', '포괄'];
const clean = (lines) => lines.filter((l) => bannedHits(l, WORDS).length === 0);

const LINE = z.object({
  dailyWage: z.number().describe('과세 일급(원, 비과세를 뺀 금액)'),
  days: z.number().describe('이 일급으로 일한 일수(1~366일)'),
});

export function register(server) {
  server.registerTool(
    name,
    {
      title: '일용근로소득 원천징수 계산',
      description:
        '일용근로자에게 일급을 지급할 때 떼는 예상 소득세와 지방소득세를 계산한다(사이트 /tools/daily-worker-tax 와 같은 엔진). ' +
        '날마다 1일 세액 = (일급 − 1일 근로소득공제 15만원, 일급이 그보다 적으면 0) × 6% − 그 산출세액의 55%(근로소득세액공제) = (일급 − 15만원) × 2.7%. 일급이 다른 날은 날마다 계산해 더하고 평균을 내지 않는다. ' +
        '한 번에 지급한 날들의 세액 합계가 1,000원 미만이면 떼지 않고(지급 건마다 판단), 아니면 10원 미만을 버린다. 지방소득세는 뗀 소득세의 10%에서 10원 미만 버림. ' +
        '날마다 1원 미만을 먼저 버리는 방식의 값(dailyFloor)도 함께 내고, 두 값이 다르면 둘 다 말한다. ' +
        '일용근로자인지 가리는 것, 비과세 구분, 4대보험, 비거주자, 같은 날 여러 곳 소득 합산, 2018년 이전 소득, 지급명세서·신고서 작성은 다루지 않는다.',
      inputSchema: {
        dailyWorker: z.boolean().describe('일용근로자인가(소득세법 시행령 제20조 제1항 — 건설 1년 미만 고용 등·하역·근로계약상 3개월 미만 고용). false 면 계산하지 않는다'),
        payments: z
          .array(z.object({ lines: z.array(LINE).describe('이 지급에 든 날들 — 일급이 다른 날은 줄을 나눈다') }))
          .describe('지급 건 목록 — 한 번에 지급한 날들을 한 건으로 묶는다. 매일 지급했으면 하루치를 한 건으로'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        if (!a.dailyWorker) {
          return text({ ok: true, headline: ELIGIBILITY_STOP, stop: true, site: SITE });
        }
        const r = calcDailyWorkerTax({ payments: a.payments.map((p) => ({ days: expandLines(p.lines) })) });
        return text({
          ok: true,
          headline: clean(headline(r)),
          paymentLines: clean(r.payments.map(paymentLine)),
          formula: clean(formulaLines(r)),
          result: r,
          consequences: clean(CONSEQUENCES),
          notCovered: clean(NOT_COVERED),
          notice: clean(NOTICE),
          inputGuide: clean(INPUT_GUIDE),
          nts: { href: NTS.href, note: `${NTS.text}${NTS.after}` },
          hometax: { href: HOMETAX.href, note: `${HOMETAX.text}${HOMETAX.after}` },
          basis: clean(BASIS),
          site: SITE,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
