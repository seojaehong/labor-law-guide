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
  text = text.replace(/[「」『』“”‘’"']/g, ' ');
  const seen = new Set<string>();
  const out: LawCitation[] = [];
  const covered: Array<[number, number]> = [];
  const add = (c: LawCitation) => {
    const key = `${c.law}-${c.label}`;
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  };
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
    add({ law, article, sub, label });
    covered.push([m.index!, m.index! + m[0].length]);
    // An explicit law name also governs a directly connected article list.
    let tail = text.slice(m.index! + m[0].length);
    const next = /^\s*(,|·|ㆍ|및|와|과|또는|부터|내지|~|∼|–|-|(?=제))\s*제?\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;
    let following: RegExpMatchArray | null;
    while ((following = tail.match(next))) {
      const n = Number(following[2]), branch = following[3] ? Number(following[3]) : undefined;
      const nextLabel = `제${n}조${branch ? `의${branch}` : ''}`;
      // Range endpoints alone do not establish the intervening provisions.
      if (/^(?:부터|내지|~|∼|–|-)$/.test(following[1])) {
        add({ law, article, label: `${label}~${nextLabel}` });
      } else add({ law, article: n, sub: branch, label: nextLabel });
      tail = tail.slice(following[0].length);
    }
  }
  // Coverage check catches named laws and subordinate legislation outside the supported aliases.
  // It targets explicit statutory article syntax, not plain numbers or company article headings.
  const explicit = /(?:법률|법|시행령|시행규칙)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
  for (const m of text.matchAll(explicit)) {
    if (covered.some(([start, end]) => m.index! >= start && m.index! + m[0].length <= end)) continue;
    const prefix = text.slice(Math.max(0, m.index! - 50), m.index! + m[0].indexOf('제')).trim();
    const law = prefix.match(/[가-힣A-Za-zㆍ·]+(?:\s+(?:시행령|시행규칙))?$/)?.[0] ?? '미지원 법령';
    const article = Number(m[1]), sub = m[2] ? Number(m[2]) : undefined;
    add({ law, article, sub, label: `제${article}조${sub ? `의${sub}` : ''}` });
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
  applicableOn?: string; lookup?: Lookup; timeoutMs?: number; signal?: AbortSignal;
} = {}): Promise<CitationVerifyResult> {
  const citations = extractLawCitations(text);
  const applicableOn = options.applicableOn ?? new Date().toISOString().slice(0, 10);
  const base = { citations, hallucinated: [], status: 'review_required' as const,
    scope: 'cached_reference_only' as const, applicableOn };
  const fail = (reason: string): CitationVerifyResult => ({ ...base, reason,
    evidence: citations.map(citation => ({ citation, status: 'review_required', reason, source: null, effectiveDate: null })) });
  if (!isoDate(applicableOn)) return fail('invalid_application_date');
  if (!citations.length) return fail('no_supported_citation');
  if (options.signal?.aborted) return fail('lookup_cancelled');
  const controller = new AbortController();
  let rejectCancelled: ((reason: Error) => void) | undefined;
  const onCancel = () => { controller.abort(); rejectCancelled?.(new Error('cancelled')); };
  options.signal?.addEventListener('abort', onCancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      new Promise<never>((_, reject) => { rejectCancelled = reject; }),
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
    return fail(options.signal?.aborted ? 'lookup_cancelled' : controller.signal.aborted ? 'lookup_timeout' : 'lookup_unavailable');
  } finally { if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', onCancel); }
}

/** Never release an unreviewed model judgment, even when the cited article exists. */
export function citationReviewMessage(result: CitationVerifyResult): string {
  const lines = result.evidence.map(e =>
    `- ${e.citation.law} ${e.citation.label}: ${e.status === 'reference_found' ? '캐시 조문 확인 · 의미/적용시점 검토 필요' : '근거 검토 필요'}; 시행일: ${e.effectiveDate ?? '확인 불가'}; 출처: ${e.source ?? '확인 불가'}`);
  return `**검토 필요** — 생성된 법률 판단의 근거·의미·적용시점 검증이 완료되지 않아 본문을 보류했습니다.\n검사 기준일(기본값: 조회일): ${result.applicableOn} · 사건 발생일·경과규정·사업장 적용 여부: 미확인 · 검증 범위: 저장된 조문 참조 확인(실시간 법령·법률 적합성 검증 아님).\n${lines.join('\n') || '확인 가능한 근거 조문이 없습니다.'}\n별도 AI 검증이나 API 연결도 정답을 보증하지 않습니다. 전문가가 원문과 적용일을 확인해 주세요.`;
}

/** Only a bounded reference-backed draft may be displayed, always behind its review label. */
export function legalReviewOutput(text: string, result: CitationVerifyResult, generationComplete: boolean): string {
  const review = citationReviewMessage(result);
  const overclaim = /확실|보장(?:합니다|됩니다|한다|할\s*수\s*있)|(?:정답|정확성|결과|승소).{0,12}보장|(?:정확도|정확성|확률|확신)\s*(?:은|는|이|가)?\s*100\s*%|100\s*%\s*(?:정확|확실|적합|적법|보장)|검증\s*완료|문제\s*없|(?:적법|적합|합법|준수)(?:합니다|입니다)|반드시\s*승소/;
  const referenceBacked = result.evidence.length > 0 && result.evidence.every(e => e.status === 'reference_found');
  if (!generationComplete || !referenceBacked || overclaim.test(text)) return review;
  return review.replace('본문을 보류했습니다.', '아래 내용을 미검수 참고 초안으로 표시합니다.') +
    '\n\n---\n**미검수 참고 초안 · 법률 판단 검토 필요**\n' + text;
}
