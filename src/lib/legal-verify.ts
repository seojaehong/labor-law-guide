import { createClient } from '@supabase/supabase-js';

// 답변에서 "근로기준법 제56조", "노동조합 및 노동관계조정법 제2조" 등 추출
const LAW_CITATION_RX =
  /((?:남녀고용평등과\s*일[ㆍ·.]가정\s*양립\s*지원에\s*관한\s*법률|기간제\s*(?:및|·)\s*단시간근로자\s*보호\s*등에\s*관한\s*법률|파견근로자\s*보호\s*등에\s*관한\s*법률|근로자참여\s*(?:및|·)\s*협력증진에\s*관한\s*법률)|(?:근로기준|노동조합\s*(?:및|·)\s*노동관계조정|최저임금|고용보험|근로자퇴직급여\s*보장|남녀고용평등|산업안전보건|산업재해보상보험|기간제\s*(?:및|·)\s*단시간근로자\s*보호|파견근로자\s*보호|노동위원회|임금채권보장|근로자참여\s*(?:및|·)\s*협력증진)법)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;

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
    const normalizedLaw = rawLaw.replace(/일[·.]가정/g, '일ㆍ가정');
    const law = LAW_NORMALIZE[normalizedLaw] || normalizedLaw;
    const label = `제${article}조${sub ? `의${sub}` : ''}`;
    const key = `${law}-${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ law, article, sub, label });
  }
  return out;
}

export type CitationEvidence = {
  citation: LawCitation;
  status: 'reference_found' | 'review_required';
  reason: string;
  source: string | null;
  effectiveDate: string | null;
};
export type CitationVerifyResult = {
  citations: LawCitation[];
  hallucinated: LawCitation[];
  status: 'review_required';
  scope: 'cached_reference_only';
  applicableOn: string;
  evidence: CitationEvidence[];
  reason: string;
};
export type CachedArticle = {
  law_name: string; article_label: string; body: string | null;
  effective_date: string | null; article_effective_date: string | null;
  law_mst: string | null; source: string | null;
  is_deleted: boolean | null; exists_flag: boolean | null;
};
type Lookup = (laws: string[], signal: AbortSignal) => Promise<unknown>;
const isoDate = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

async function lookup(laws: string[], signal: AbortSignal): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('not_configured');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return db.from('law_articles')
    .select('law_name, article_label, body, effective_date, article_effective_date, law_mst, source, is_deleted, exists_flag')
    .in('law_name', laws).eq('is_heading', false).eq('is_byeolpyo', false)
    .abortSignal(signal);
}

/** Cache existence is supporting evidence, never semantic or legal approval. */
export async function verifyCitations(text: string, options: {
  applicableOn?: string; lookup?: Lookup; timeoutMs?: number;
} = {}): Promise<CitationVerifyResult> {
  const citations = extractLawCitations(text);
  const applicableOn = options.applicableOn ?? new Date().toISOString().slice(0, 10);
  const base = { citations, hallucinated: [], status: 'review_required' as const,
    scope: 'cached_reference_only' as const, applicableOn };
  const fail = (reason: string): CitationVerifyResult => ({ ...base, reason,
    evidence: citations.map(citation => ({ citation, status: 'review_required', reason, source: null, effectiveDate: null })) });
  if (!isoDate(applicableOn)) return fail('invalid_application_date');
  if (!citations.length) return fail('no_supported_citation');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      (options.lookup ?? lookup)([...new Set(citations.map(c => c.law))], controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('timeout'));
      }, options.timeoutMs ?? 3000); }),
    ]) as { data?: unknown; error?: unknown } | null;
    if (!result || result.error || !Array.isArray(result.data)) return fail('lookup_unavailable');
    if (!result.data.every(row => row && typeof row === 'object' &&
      typeof row.law_name === 'string' && typeof row.article_label === 'string')) return fail('invalid_response');
    const rows = result.data as CachedArticle[];
    const evidence: CitationEvidence[] = citations.map(citation => {
      const matches = rows.filter(r => r.law_name === citation.law && r.article_label === citation.label);
      const row = matches[0];
      const date = row?.article_effective_date ?? row?.effective_date;
      const source = row?.law_mst && /^\d+$/.test(row.law_mst) && row.source
        ? `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${row.law_mst}` : null;
      const reason = !matches.length ? 'reference_not_found' : matches.length !== 1 ? 'conflicting_revisions'
        : row.is_deleted !== false || row.exists_flag !== true ? 'deleted_or_unknown'
        : !source || typeof row.body !== 'string' || !row.body.trim() ? 'missing_source_or_text'
        : !isoDate(date) ? 'missing_effective_date' : date > applicableOn ? 'not_yet_effective'
        : 'meaning_and_applicability_unverified';
      return { citation, status: reason === 'meaning_and_applicability_unverified' ? 'reference_found' : 'review_required',
        reason, source, effectiveDate: isoDate(date) ? date : null };
    });
    return { ...base, evidence, reason: 'meaning_and_applicability_unverified' };
  } catch {
    return fail(controller.signal.aborted ? 'lookup_timeout' : 'lookup_unavailable');
  } finally { if (timer) clearTimeout(timer); }
}

/** Never release an unreviewed model judgment, even when the cited article exists. */
export function citationReviewMessage(result: CitationVerifyResult): string {
  const lines = result.evidence.map(e =>
    `- ${e.citation.law} ${e.citation.label}: ${e.status === 'reference_found' ? '캐시 조문 확인 · 의미/적용시점 검토 필요' : '근거 검토 필요'}; 시행일: ${e.effectiveDate ?? '확인 불가'}; 출처: ${e.source ?? '확인 불가'}`);
  return `**검토 필요** — 생성된 법률 판단의 근거·의미·적용시점 검증이 완료되지 않아 본문을 보류했습니다.\n적용 기준일: ${result.applicableOn} · 검증 범위: 저장된 조문 참조 확인(실시간 법령·법률 적합성 검증 아님).\n${lines.join('\n') || '확인 가능한 근거 조문이 없습니다.'}\n별도 AI 검증이나 API 연결도 정답을 보증하지 않습니다. 전문가가 원문과 적용일을 확인해 주세요.`;
}

/** Only a bounded reference-backed draft may be displayed, always behind its review label. */
export function legalReviewOutput(text: string, result: CitationVerifyResult, generationComplete: boolean): string {
  const review = citationReviewMessage(result);
  const overclaim = /확실|보장|100\s*%|검증\s*완료|문제\s*없|(?:적법|적합|합법|준수)(?:합니다|입니다)|반드시\s*승소/;
  const referenceBacked = result.evidence.length > 0 && result.evidence.every(e => e.status === 'reference_found');
  if (!generationComplete || !referenceBacked || overclaim.test(text)) return review;
  return review.replace('본문을 보류했습니다.', '아래 내용을 미검수 참고 초안으로 표시합니다.') +
    '\n\n---\n**미검수 참고 초안 · 법률 판단 검토 필요**\n' + text;
}
