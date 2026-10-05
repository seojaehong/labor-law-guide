import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';

const db = supabaseAdmin || supabase;

// 답변에서 "근로기준법 제56조", "노동조합 및 노동관계조정법 제2조" 등 추출
const LAW_CITATION_RX =
  /((?:근로기준|노동조합\s*(?:및|·)\s*노동관계조정|최저임금|고용보험|근로자퇴직급여\s*보장|남녀고용평등|산업안전보건|산업재해보상보험|기간제\s*(?:및|·)\s*단시간근로자\s*보호|파견근로자\s*보호|노동위원회|임금채권보장|근로자참여\s*(?:및|·)\s*협력증진)법)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;

const LAW_NORMALIZE: Record<string, string> = {
  근로기준법: '근로기준법',
  '노동조합 및 노동관계조정법': '노동조합 및 노동관계조정법',
  최저임금법: '최저임금법',
  고용보험법: '고용보험법',
  '근로자퇴직급여 보장법': '근로자퇴직급여 보장법',
  남녀고용평등법: '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률',
  산업안전보건법: '산업안전보건법',
  산업재해보상보험법: '산업재해보상보험법',
  '기간제 및 단시간근로자 보호 등에 관한 법률': '기간제 및 단시간근로자 보호 등에 관한 법률',
  '파견근로자 보호 등에 관한 법률': '파견근로자 보호 등에 관한 법률',
  노동위원회법: '노동위원회법',
  임금채권보장법: '임금채권보장법',
  '근로자참여 및 협력증진에 관한 법률': '근로자참여 및 협력증진에 관한 법률',
};

export type LawCitation = { law: string; article: number; sub?: number; label: string };

export function extractLawCitations(text: string): LawCitation[] {
  const seen = new Set<string>();
  const out: LawCitation[] = [];
  for (const m of text.matchAll(LAW_CITATION_RX)) {
    const rawLaw = m[1].replace(/\s+/g, ' ').trim();
    const article = parseInt(m[2], 10);
    if (!Number.isFinite(article)) continue;
    // 2026-10-05: 가지번호를 함께 읽는다. 「제76조의2」를 「제76조」로 읽으면
    // 직장 내 괴롭힘(제76조의2·제76조의3) 같은 핵심 조항이 뭉개진다.
    const sub = m[3] ? parseInt(m[3], 10) : undefined;
    const law = LAW_NORMALIZE[rawLaw] || rawLaw;
    const label = `제${article}조${sub ? `의${sub}` : ''}`;
    const key = `${law}-${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ law, article, sub, label });
  }
  return out;
}

export type CitationVerifyResult = {
  citations: LawCitation[];
  hallucinated: LawCitation[];
};

export async function verifyCitations(text: string): Promise<CitationVerifyResult> {
  const citations = extractLawCitations(text);
  if (citations.length === 0) return { citations: [], hallucinated: [] };

  // law_articles 캐시 lookup — 알려진 법령만 검증
  const knownLaws = new Set(Object.values(LAW_NORMALIZE));
  const verifyTargets = citations.filter((c) => knownLaws.has(c.law));
  if (verifyTargets.length === 0) return { citations, hallucinated: [] };

  // 한 번의 OR 쿼리
  const lawNames = [...new Set(verifyTargets.map((c) => c.law))];
  // 2026-10-05: article_number 대신 article_label 로 대조한다.
  // 적재 후 (법령, 조번호) 가 유일하지 않다 — 제105조와 제105조의2 가 둘 다 105 이고
  // 별표 1 과 제1조도 1 이다. 라벨은 그 셋을 구분한다.
  // 장·절 표제와 별표는 인용 대상이 아니므로 제외한다.
  const { data, error } = await db
    .from('law_articles')
    .select('law_name, article_label')
    .in('law_name', lawNames)
    .eq('is_heading', false)
    .eq('is_byeolpyo', false);
  if (error || !data) return { citations, hallucinated: [] };

  const existsSet = new Set<string>();
  const lawCounts = new Map<string, number>();
  for (const row of data as Array<{ law_name: string; article_label: string }>) {
    existsSet.add(`${row.law_name}-${row.article_label}`);
    lawCounts.set(row.law_name, (lawCounts.get(row.law_name) ?? 0) + 1);
  }

  // 검증 데이터가 5건 미만인 법령은 skip — false positive 방지.
  // 2026-04-30: law_articles 가 근기법(84)·노조법(15) 외에는 거의 비어 있어
  //   정확한 답변(고용보험법 제40조 등)이 hallucinated 로 잘못 분류됐다.
  //   「장기적으론 법제처 API에서 13개 주요 법령 backfill 필요」로 남겨 두었던 것을
  // 2026-10-05 에 **했다.** 법제처 조문 93종 7,887행(본문 982만자)을 적재해
  //   위 13종이 전부 26~184 조문으로 채워졌다 — 이제 13종 모두 검증이 켜진다.
  //   임계값은 남겨 둔다. 수집이 멈추거나 새 법령이 추가될 때 다시 방어막이 된다.
  const VERIFIABLE_THRESHOLD = 5;
  const verifiableLaws = new Set(
    Array.from(lawCounts.entries())
      .filter(([, n]) => n >= VERIFIABLE_THRESHOLD)
      .map(([k]) => k)
  );

  const hallucinated: LawCitation[] = [];
  for (const c of verifyTargets) {
    if (!verifiableLaws.has(c.law)) continue; // 검증 데이터 부족 — skip
    if (!existsSet.has(`${c.law}-${c.label}`)) {
      hallucinated.push(c);
    }
  }
  return { citations, hallucinated };
}
