// 3.3% 계약 점검 — 사이트 엔진(src/lib/calc/contractor-check)과 화면 문구(src/app/tools/contractor-check/copy)를 그대로 불러 쓴다.
// 질문 8개의 답과 월 보수만 받는다. 파일·네트워크·주민등록번호를 다루지 않는다 — 원격판에 그대로 실을 수 있다.
// 사이트 문구 가운데 금지어(banned.ts 두 벌 + 대신·대행·대리·포괄)를 품은 문장은 응답에 싣지 않는다
// (Q4 질문·보기 글자, 판결 첫 문단 원문, 「세무대리·신고서 작성 대행이 아닙니다」 안내).
import { z } from 'zod';
import { checkItems, compareTakeHome, SOURCES } from '@/lib/calc/contractor-check';
import {
  AFTER_LEAD, AFTER_RECOGNITION, CHECK_HEADLINE, CHECK_NOTES, HOMETAX_LINK, HOMETAX_URL, INPUT_GUIDE, MONEY_NOTES, OUT_OF_SCOPE,
  answerLabel, formulaLines, itemSentence, itemTag, moneyHeadline, moneyRows,
} from '@/app/tools/contractor-check/copy';
import { bannedHits, RESULT_BANNED, SERVICE_BANNED } from '@/lib/tool-kit/banned';
import { todayKst } from '@/lib/tool-kit';
import { text } from '../../lib/common.mjs';

export const name = 'check_contractor';

const SITE = 'https://yellowenvelope.kr/tools/contractor-check';
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const WORDS = [...SERVICE_BANNED, ...RESULT_BANNED, '대신', '대행', '대리', '포괄'];
const clean = (s) => (typeof s === 'string' && s && bannedHits(s, WORDS).length === 0 ? s : undefined);
const cleanAll = (arr) => arr.filter((s) => clean(s) !== undefined);

/** 사이트 글자가 금지어를 품어 빠지는 항목의 요소 이름 — 판결 요소를 중립 낱말로 다시 적은 것(요약, 인용 아님) */
const ELEMENT_FALLBACK = { Q4: '제3자를 고용해 일을 맡길 수 있는지' };

const ANSWER = z.enum(['yes', 'no', 'unknown']);
const q = (d) => ANSWER.optional().describe(d);

const BASIS = [
  '대법원 2006. 12. 7. 선고 2004다29736 판결',
  '근로기준법 제2조제1항제1호',
  '고용노동부 행정해석 근로개선정책과-1333(2012. 2. 16.)·근로기준정책과-2947(2019. 5. 21.)·근기68207-2172(2000. 7. 21.)',
  '소득세법 제127조제1항제3호·제129조제1항제3호, 시행령 제184조제1항',
  '지방세법 제103조의13제1항',
  '소득세법 제86조제1호, 시행령 제149조의3',
  '국고금 관리법 제47조제1항, 지방회계법 제55조',
  '소득세법 시행령 [별표2] 근로소득 간이세액표 <개정 2026. 2. 27.>',
];

export function register(server) {
  server.registerTool(
    name,
    {
      title: '3.3% 계약 근로자성 점검',
      description:
        '프리랜서(사업소득 3.3%)로 계약한 사람의 실제 일한 모습을 대법원 2006. 12. 7. 선고 2004다29736 판결의 근로자성 요소와 항목마다 대조하고, 같은 월 보수를 3.3%로 뗄 때와 근로소득으로 뗄 때의 예상 실수령을 나란히 낸다(사이트 /tools/contractor-check 와 같은 엔진). ' +
        '대조: 질문 Q1~Q8 마다 「근로자로 볼 요소가 있습니다 / 적습니다」를 내고, 고정급(Q6)·근로소득세·4대보험(Q7)은 판결 단서 문장을, 보수 성격(Q5)·취업규칙(Q8)은 두 근거를 나란히 쓴다. 점수·개수를 만들지 않고 근로자인지 결론을 내지 않는다. ' +
        '금액: 3.3% 쪽 소득세 = 월 보수 × 3% → 10원 미만 버림, 지방소득세 = 그 10% → 10원 미만 버림(1천원 미만도 뗀다). 근로소득 쪽은 실수령액 계산기와 같은 식(4대보험 근로자 몫 + 간이세액표, 가족 수만 받고 자녀 0·비율 100%). ' +
        '다루지 않는 것: 일용근로자, 월 60시간 미만 단시간 근로자의 보험 적용, 3.3% 쪽 1년 최종 세액, 지역가입자 보험료, 근로자로 인정될 때의 퇴직금·연차수당 금액, 노동조합법상 근로자인지.',
      inputSchema: {
        answers: z
          .object({
            Q1: q('회사가 업무 내용을 정하고 일하는 동안 지휘·감독을 하는가 — yes = 근로자 쪽'),
            Q2: q('회사가 근무시간·근무장소를 정하고 그에 매여 일하는가 — yes = 근로자 쪽'),
            Q3: q('일에 쓰는 비품·원자재·작업도구를 본인이 갖추는가 — yes = 독립 쪽(본인이 갖춤), no = 회사 것을 씀'),
            Q4: q('제3자를 고용해 자기 일을 맡길 수 있는가 — yes = 독립 쪽, no = 본인이 직접 해야 함'),
            Q5: q('보수가 일한 시간·일수 자체의 대가로 정해지는가 — yes = 근로자 쪽, no = 성과·매출·이윤에 따라 달라짐'),
            Q6: q('기본급이나 고정급이 정해져 있는가 — yes = 근로자 쪽'),
            Q7: q('보수에서 근로소득세를 떼거나 4대보험 직장가입자인가 — yes = 근로자 쪽, no = 3.3%를 떼고 직장가입 없음'),
            Q8: q('회사 취업규칙·복무규정을 적용받는가 — yes = 근로자 쪽'),
          })
          .optional()
          .describe('실제로 일한 모습대로 답한 값(계약서 문구가 아니라). 모르면 unknown 또는 비움'),
        pay: z.number().optional().describe('월 보수(원, 3.3%를 떼기 전 한 달 금액 전부, 10억원까지). 비우면 금액 비교를 하지 않는다'),
        meal: z.number().optional().describe('그중 식대(원) — 근로소득 쪽에서만 월 20만원까지 비과세. 3.3% 쪽은 식대까지 전액에 매긴다'),
        family: z.number().optional().describe('공제대상가족 수(본인 포함, 기본 1) — 근로소득 쪽 간이세액표 칸'),
        date: z.string().optional().describe('요율 기준일 YYYY-MM-DD(기본 오늘)'),
      },
      annotations: READ_ONLY,
    },
    async (a) => {
      try {
        const items = checkItems(a.answers ?? {});
        const date = a.date ?? todayKst();
        const meal = a.meal ?? 0;
        const r = a.pay === undefined ? null : compareTakeHome({ pay: a.pay, meal, family: a.family ?? 1 }, date);
        return text({
          ok: true,
          date,
          headline: cleanAll([...CHECK_HEADLINE, ...(r ? moneyHeadline(r) : [])]),
          items: items.map((i) => ({
            id: i.id,
            element: clean(i.question.element) ?? ELEMENT_FALLBACK[i.id],
            question: clean(i.question.text),
            answer: clean(answerLabel(i)) ?? i.answer,
            sentence: clean(itemSentence(i)),
            tag: clean(itemTag(i)),
          })),
          checkNotes: cleanAll(CHECK_NOTES),
          source: {
            cite: SOURCES.standard.cite,
            applied: { where: SOURCES.applied.where, quote: clean(SOURCES.applied.quote) },
          },
          ...(r
            ? {
                money: {
                  rows: moneyRows(r).filter((x) => [x.label, x.business, x.wage, x.basis].every((s) => clean(s) !== undefined)),
                  formula: cleanAll(formulaLines(r, meal)),
                  notes: cleanAll(MONEY_NOTES),
                },
              }
            : {}),
          result: {
            items: items.map((i) => ({ id: i.id, answer: i.answer, reading: i.reading })),
            ...(r ? { money: r } : {}),
          },
          afterRecognition: { lead: clean(AFTER_LEAD), items: cleanAll(AFTER_RECOGNITION) },
          inputGuide: cleanAll(INPUT_GUIDE),
          notCovered: cleanAll(OUT_OF_SCOPE),
          hometax: { href: HOMETAX_URL, note: clean(`${HOMETAX_LINK.text}${HOMETAX_LINK.after}`) },
          basis: BASIS,
          site: SITE,
        });
      } catch (e) {
        return text({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
