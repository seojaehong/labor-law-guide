// tax 묶음 — 퇴직소득세 정본 엔진(src/lib/calc/retirement-tax)과 계산기 문구(src/app/tools/retirement-tax/copy)를 그대로 불러 쓴다.
// 금액과 날짜만 받는다. 파일·네트워크를 건드리지 않는다 — 원격판에 그대로 실을 수 있다(taxRemoteSafe).
import { z } from 'zod';
import { calcRetirementTax } from '@/lib/calc/retirement-tax';
import { headline, CONSEQUENCES, NOT_COVERED, HIRE_NOTE, HOMETAX } from '@/app/tools/retirement-tax/copy';
import { text } from '../lib/common.mjs';
// 중도퇴사자 연말정산(/tools/midyear-settlement)·일용근로자 원천세(/tools/daily-worker-tax) — 도구마다 한 파일(groups/more)
import * as midyear from './more/calc_midyear_settlement.mjs';
import * as dailyWorkerTax from './more/calc_daily_worker_tax.mjs';

const MORE = [midyear, dailyWorkerTax];
export const taxTools = ['calc_retirement_tax', ...MORE.map((m) => m.name)];
/** 원격(HTTP)판에 실어도 되는 도구 — 전부 */
export const taxRemoteSafe = [...taxTools];

const SITE = 'https://yellowenvelope.kr';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerTax(server) {
  for (const m of MORE) m.register(server);
  server.registerTool(
    'calc_retirement_tax',
    {
      title: '퇴직소득세 계산',
      description:
        '퇴직급여·입사일·퇴사일(마지막 근무일)로 퇴직소득세와 지방소득세를 계산한다(사이트 /tools/retirement-tax 와 같은 엔진, 국세청 퇴직소득 세액계산 프로그램과 같은 칸 순서). ' +
        '퇴직소득금액 − 근속연수공제 → × 12 ÷ 근속연수 = 환산급여 − 환산급여공제 = 과세표준 → 기본세율 → × 근속연수 ÷ 12 = 산출세액, 10원 미만 버림. 지방소득세는 그 10%(10원 미만 버림). ' +
        '2023. 1. 1. 이후 퇴사만 계산하고, 중간정산 합산·다른 회사 퇴직금 합산·연금계좌 과세이연(이연퇴직소득세)은 다루지 않는다.',
      inputSchema: {
        pay: z.number().int().describe('퇴직급여 합계(원, 비과세 소득은 빼고)'),
        hireDate: z.string().describe('입사일 YYYY-MM-DD(퇴직금 중간정산을 받았으면 받은 날의 다음 날)'),
        lastWorkDate: z.string().describe('퇴사일 = 마지막 근무일 YYYY-MM-DD'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const r = calcRetirementTax(a);
        return text({
          ok: true,
          headline: headline(r),
          result: r,
          consequences: CONSEQUENCES,
          hireNote: HIRE_NOTE,
          notCovered: NOT_COVERED,
          hometax: { href: HOMETAX.href, name: HOMETAX.name, note: `홈택스 ${HOMETAX.name}${HOMETAX.note}` },
          basis: ['소득세법 제48조(퇴직소득공제)·제55조제2항(퇴직소득 산출세액)', '소득세법 제146조(퇴직소득 원천징수)', '지방세법 제103조의13제1항(지방소득세)', '국고금관리법 제47조제1항(10원 미만 버림)'],
          site: `${SITE}/tools/retirement-tax`,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
