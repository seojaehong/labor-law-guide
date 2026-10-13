/**
 * 어휘검색용 질의를 만든다 — 조사·어미·불용어를 떼고 내용어만 남긴다 (2026-10-04).
 *
 * 왜 필요한가. `search_faq_hybrid` 의 점수식에서 가장 큰 항이
 * `similarity(f.question, query_text) * 5` — **질문 문자열 전체의 trigram 유사도**다.
 * 실제 용어 일치항(`ts_rank * 10`)은 보통 0.6~3.0 에 머문다.
 * 즉 **말투가 주제를 이기도록 식이 짜여 있다.**
 *
 * 실측(2026-10-04):
 *   hybrid('근로기준법 제33조 이행강제금은 얼마인가요?', 60) → 정답 행이 60건 안에 없다.
 *     1위가 「단시간 근로자의 연차수당은 얼마인가요?」였다 — 「얼마인가요」가 이긴 것이다.
 *   hybrid('근로기준법 제33조 이행강제금', 8) → 정답 행이 2위.
 *   「제33조」는 AND-tsquery 매칭 0건, OR 매칭 14,761건(테이블의 57%)이라
 *   사실상 전부가 문장꼴로 줄세워진다.
 *
 * 임베딩에는 **원문 문장을 그대로** 쓴다 — 밀집검색은 문장이 길어야 좋다.
 * 이 함수의 결과는 `query_text` 에만 넘긴다.
 *
 * ⚠ 어순을 바꾸지 않는다. DF 순으로 재배열했을 때 점수가 내려갔다(실측).
 */

// 25,844건 질문 코퍼스에서 DF 12% 를 넘은 것은 이 다섯뿐이었다. 하드코딩으로 충분하다.
const STOP = new Set(['되나요', '어떻게', '하나요', '있나요', '경우']);

// 앞에서부터 처음 맞는 것 하나만 뗀다. 길게 겹치는 것을 앞에 둔다.
const SUFFIX = [
  '인가요', '하나요', '되나요', '있나요', '나요', '까요', '해야', '해요',
  '에서', '에게', '으로', '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '과', '와', '로',
];

export function toLexQuery(raw: string): string {
  const tokens = (raw || '')
    .split(/[\s,.!?~·／/()\[\]{}"'“”‘’:;]+/)
    .filter((t) => t.length >= 2);

  const out: string[] = [];
  for (const t of tokens) {
    let w = t;
    for (const s of SUFFIX) {
      if (w.length > s.length && w.endsWith(s)) {
        const cut = w.slice(0, -s.length);
        if (cut.length >= 2) w = cut;   // 떼서 2자 미만이 되면 떼지 않는다
        break;                          // 하나만 뗀다
      }
    }
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(w);
    if (out.length >= 5) break;         // 앞 5토큰까지
  }
  // 내용어가 하나도 안 남으면 원문을 그대로 쓴다 — 빈 질의로 검색하지 않는다.
  return out.length ? out.join(' ') : raw;
}
