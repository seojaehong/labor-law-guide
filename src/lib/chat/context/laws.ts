/**
 * 법령 조문 컨텍스트 — 1차 자료를 챗봇에 넣는다 (2026-10-05 신설).
 *
 * 왜 필요한가. 챗봇이 모으던 것은 FAQ · 노동위 판정례 · 행정해석 · 법원 판례 · 뉴스다.
 * **전부 간접 자료이고 법령 조문이 없었다.** 금액·기간·벌칙 수위를 물으면 FAQ 의
 * 어휘검색이 받았고, 조문이 없으니 말투가 주제를 이겼다 — `lex-query.ts` 주석의
 * 「근로기준법 제33조 이행강제금은 얼마인가요?」가 1위로 「단시간 근로자의 연차수당은
 * 얼마인가요?」를 올린 사례가 그것이다.
 *
 * `lookup_law_article` 툴은 **법령명 + 조번호를 알 때만** 쓴다. 「이행강제금이 뭐예요」처럼
 * 조번호 없는 질의는 받을 수 없었다. 이 모듈이 그 자리를 채운다.
 *
 * 왜 Jev 를 쓰나. 어휘검색만으로는 2위부터 엉뚱해진다. 실측 —
 * 「직장 내 괴롭힘 신고 회사 조치」로 검색하면 1위는 제76조의3(직장 내 괴롭힘 발생 시 조치)로
 * 맞지만, 2·3위가 **「취업규칙의 작성ㆍ신고」**다(본문에 「신고」와 「회사」가 있어서).
 * 선원법까지 올라온다. 후보를 넓게 뽑고 **Jev 가 다시 고른다** —
 * `jev.ts` 가 적어 둔 그대로다(임베딩 1위가 49건 중 16건만 맞았고 재선택하니 44건).
 *
 * 어휘검색 1위 정확도 실측 (2026-10-05, 10질의) — **6/10.** 맞은 것은 이행강제금·연차·
 * 퇴직금·최저임금·수습해고, 어긋난 것은 주휴수당(「요건」이 노조법 직장폐쇄를 끌어올렸다)·
 * 배우자출산휴가·임금체불벌칙·근로시간단축·안전보건조치다. **0건은 없었다**(후보 8~20).
 * Jev 가 이 자리를 올린다 — 효과는 배포 후 `_laws=` 마커와 로그로 확인한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { jevRerank } from './jev';
import { toLexQuery } from './lex-query';
import { type Retrieval } from './result';

type LawRow = {
  law_name: string;
  article_label: string;
  article_title: string | null;
  body: string | null;
  law_kind: string | null;
  effective_date: string | null;
  score: number;
  matched: number;
};

// 후보를 넓게 뽑고 고르기는 Jev 에 맡긴다. 재선택은 풀 밖의 것을 꺼내올 수 없다.
// faq.ts 가 K=100 에서 267ms 를 쟀고 K=134 에서 1,239ms 로 터졌다. 조문은 본문이
// 길어 프롬프트가 커지므로 더 보수적으로 둔다.
const RETRIEVE_K = 20;
const FINAL_N = 3;
const BODY_LIMIT = 700;

/** 질의에서 법령명을 집어낸다. 있으면 그 법령을 올린다(RPC 의 law_hint). */
const LAW_HINTS: Array<[RegExp, string]> = [
  [/근로기준법\s*시행규칙/, '근로기준법 시행규칙'],
  [/근로기준법\s*시행령/, '근로기준법 시행령'],
  [/근로기준법/, '근로기준법'],
  [/산업안전보건법\s*시행규칙/, '산업안전보건법 시행규칙'],
  [/산업안전보건법\s*시행령/, '산업안전보건법 시행령'],
  [/산업안전보건법|산안법/, '산업안전보건법'],
  [/남녀고용평등/, '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률'],
  [/퇴직급여|퇴직연금/, '근로자퇴직급여 보장법'],
  [/최저임금법/, '최저임금법'],
  [/고용보험법/, '고용보험법'],
  [/산업재해보상보험법|산재법/, '산업재해보상보험법'],
  [/노동조합\s*(및|·)?\s*노동관계조정법|노조법/, '노동조합 및 노동관계조정법'],
  [/기간제/, '기간제 및 단시간근로자 보호 등에 관한 법률'],
  [/파견/, '파견근로자 보호 등에 관한 법률'],
  [/임금채권보장법/, '임금채권보장법'],
  [/중대재해/, '중대재해 처벌 등에 관한 법률'],
  [/노동위원회법/, '노동위원회법'],
];

function lawHint(text: string): string | null {
  for (const [rx, name] of LAW_HINTS) if (rx.test(text)) return name;
  return null;
}

/**
 * ★ 실무 용어 → 법령 용어. 어휘검색의 근본 한계를 메운다.
 *
 * 2026-10-05 실측 — 질의 5건 중 3건이 **후보 20개 밖**이었다. Jev 로도 못 꺼낸다
 * (재선택은 풀 밖의 것을 꺼내오지 못한다). 원인은 **법이 그 단어를 쓰지 않는 것**이다.
 *
 *   「주휴수당 요건」      → 근기법 제55조. 법 조문에 「주휴수당」이 없다. 「유급휴일」이다
 *   「임금체불 벌칙」      → 제107조. 제목이 「벌칙」이고 본문은 제36조·제43조를 인용만 한다
 *   「사업주 안전보건 조치」 → 산안법 제38조. 제목이 「안전조치」다
 *
 * 그래서 질의에 법령 용어를 **보태서** 넘긴다.
 *
 * ★★ **이것은 부분 보정이다. 근본 해결이 아니다.** 확장 전/후를 재니 3건 중 **1건만** 들어왔다.
 *
 *   「주휴수당 요건」      후보 밖 → ✅ 후보 안 (다만 1위는 여전히 엉뚱 — 가사근로자법 제16조)
 *   「임금체불 벌칙」      후보 밖 → 🔴 여전히 밖. 제107조 제목이 「벌칙」이고 본문은
 *                          제36조·제43조를 **번호로만** 인용한다. 「임금」도 「체불」도 없다
 *   「사업주 안전보건 조치」 후보 밖 → 🔴 여전히 밖. 점수가 더 높은 조문들이 20칸을 먹는다
 *
 * **제대로 고치려면 조문 임베딩이 필요하다**(의미검색). 용어 사전으로는 끝이 없다.
 * 비용은 작다 — 982만자 ≈ 700만 토큰, `text-embedding-3-small` 로 약 $0.15.
 * 다음 작업으로 둔다. 그때 이 함수는 보조로 남긴다.
 */
const TERM_EXPAND: Array<[RegExp, string]> = [
  [/주휴수당|주휴일/, '유급휴일 휴일'],
  [/임금체불|체불/, '금품 청산 임금 지급 벌칙'],
  [/안전보건\s*조치|안전조치/, '안전조치 보건조치'],
  [/가산수당|할증/, '연장 야간 휴일 근로'],
  [/퇴직금/, '퇴직급여 퇴직금'],
  [/권고사직/, '해고 예고'],
  [/부당해고/, '해고 제한 구제신청'],
  [/4대보험/, '보험료 징수'],
  [/최저시급/, '최저임금'],
  [/근로계약서/, '근로조건 명시'],
  [/육아휴직/, '육아휴직'],
  [/출산휴가/, '출산전후휴가'],
  [/괴롭힘/, '직장 내 괴롭힘'],
  [/정리해고/, '경영상 이유에 의한 해고'],
  [/연장근로\s*한도|52시간/, '연장 근로의 제한 근로시간'],
];

function expandTerms(lex: string, raw: string): string {
  const add: string[] = [];
  for (const [rx, words] of TERM_EXPAND) {
    if (rx.test(raw)) add.push(words);
  }
  if (add.length === 0) return lex;
  // 중복 토큰을 지운다. RPC 가 토큰별로 점수를 합산하므로 같은 말을 두 번 주면 쏠린다
  const seen = new Set(lex.split(/\s+/).filter(Boolean));
  const extra = add
    .join(' ')
    .split(/\s+/)
    .filter((w) => w && !seen.has(w));
  return [lex, ...new Set(extra)].join(' ');
}

export async function buildLawsContext(
  db: SupabaseClient,
  userText: string
): Promise<Retrieval> {
  try {
    // 조사·어미·불용어를 떼고 내용어만 넘긴다. RPC 가 토큰별로 점수를 합산하므로
    // 문장을 그대로 주면 조사가 토큰이 되어 아무 조문에나 걸린다.
    const lex = expandTerms(toLexQuery(userText) || userText, userText);
    const hint = lawHint(userText);

    const { data, error } = await db.rpc('search_law_articles', {
      query_text: lex.slice(0, 200),
      max_results: RETRIEVE_K,
      law_hint: hint,
    });
    if (error) {
      console.error('[laws.ts] rpc error:', JSON.stringify(error));
      return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
    }
    let rows = (data ?? []) as LawRow[];
    if (rows.length === 0) {
      console.warn(`[laws.ts] rpc 0 rows (lex="${lex.slice(0, 40)}")`);
      return { ctx: '', rows: 0, via: 'rpc', status: '0rows' };
    }

    // Jev 재선택 — 제목을 question 으로, 본문을 answer 로 넘긴다.
    // JEV_ON=false 면 건너뛴다. 실패하면 jevRerank 가 원래 순서를 돌려준다.
    if (process.env.JEV_ON !== 'false' && rows.length > FINAL_N) {
      const jevable = rows.map((r) => ({
        question: `${r.law_name} ${r.article_label}${r.article_title ? ` (${r.article_title})` : ''}`,
        answer: (r.body || '').slice(0, 300),
        __row: r,
      }));
      const picked = await jevRerank(lex, jevable, FINAL_N);
      rows = picked.map((p) => p.__row);
    } else {
      rows = rows.slice(0, FINAL_N);
    }

    let ctx = `\n\n═══ 관련 법령 조문 (${rows.length}건, 법제처 원문) ═══\n`;
    for (const r of rows) {
      const body = (r.body || '').replace(/\s+/g, ' ').trim().slice(0, BODY_LIMIT);
      const cut = (r.body || '').length > BODY_LIMIT;
      ctx += `\n[${r.law_name} ${r.article_label}${r.article_title ? ` (${r.article_title})` : ''}]`;
      ctx += ` 시행 ${r.effective_date || '미확인'}\n  ${body}${cut ? ' …(이하 생략)' : ''}\n`;
    }
    ctx +=
      '\n[법령 인용 규칙] 위 조문은 법제처 원문이다. **금액·기간·일수·벌칙 수위를 말할 때는 ' +
      '위 본문에 적힌 값을 그대로 쓰고, 기억으로 숫자를 만들지 않는다.** 조문을 인용할 때는 ' +
      '법령명과 조문번호를 함께 적는다(예: 근로기준법 제76조의2). 위 목록에 없는 조문은 인용하지 않는다.\n' +
      '[주의] 시행일이 적혀 있다. 질문이 과거 시점이면 그때 시행 중이던 조문과 다를 수 있으므로 ' +
      '단정하지 말고 시행일을 함께 밝힌다. 「…이하 생략」이 붙은 조문은 뒷부분이 잘렸으므로 ' +
      '그 범위에서만 답한다.';
    return { ctx, rows: rows.length, via: 'rpc', status: 'ok' };
  } catch (err) {
    console.error('[laws.ts] 예외:', (err as Error)?.message?.slice(0, 150));
    return { ctx: '', rows: 0, via: 'rpc', status: 'error' };
  }
}
