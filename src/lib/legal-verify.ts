import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';

const db = supabaseAdmin || supabase;

// 답변에서 "근로기준법 제56조", "노동조합 및 노동관계조정법 제2조" 등 추출
const LAW_CITATION_RX =
  /((?:근로기준|노동조합\s*(?:및|·)\s*노동관계조정|최저임금|고용보험|근로자퇴직급여\s*보장|남녀고용평등|산업안전보건|산업재해보상보험|기간제\s*(?:및|·)\s*단시간근로자\s*보호|파견근로자\s*보호|노동위원회|임금채권보장|근로자참여\s*(?:및|·)\s*협력증진)법)\s*제\s*(\d+)\s*조/g;

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

export type LawCitation = { law: string; article: number };

export function extractLawCitations(text: string): LawCitation[] {
  const seen = new Set<string>();
  const out: LawCitation[] = [];
  for (const m of text.matchAll(LAW_CITATION_RX)) {
    const rawLaw = m[1].replace(/\s+/g, ' ').trim();
    const article = parseInt(m[2], 10);
    if (!Number.isFinite(article)) continue;
    const law = LAW_NORMALIZE[rawLaw] || rawLaw;
    const key = `${law}-${article}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ law, article });
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
  const { data, error } = await db
    .from('law_articles')
    .select('law_name, article_number')
    .in('law_name', lawNames);
  if (error || !data) return { citations, hallucinated: [] };

  const existsSet = new Set<string>();
  for (const row of data as Array<{ law_name: string; article_number: number }>) {
    existsSet.add(`${row.law_name}-${row.article_number}`);
  }

  const hallucinated: LawCitation[] = [];
  for (const c of verifyTargets) {
    if (!existsSet.has(`${c.law}-${c.article}`)) {
      hallucinated.push(c);
    }
  }
  return { citations, hallucinated };
}
