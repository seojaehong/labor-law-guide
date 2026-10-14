import { companySizeEvidence, companySizeDelta, type CompanySizeUnresolved } from './company-size-evidence';
import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';
import { getGenerativeModel } from './vertex/client';

const db = supabaseAdmin || supabase;

export type UserSituation = {
  company_size?: number;
  company_size_evidence?: ReturnType<typeof companySizeEvidence>['company_size_evidence'];
  company_size_unresolved?: CompanySizeUnresolved;
  tenure_months?: number;
  monthly_salary?: number;
  job_type?: string;
  issue_category?: string;
  employment_status?: string;
  timeline?: string;
  [key: string]: unknown;
};

const KEYS = [
  'company_size',
  'company_size_evidence',
  'company_size_unresolved',
  'tenure_months',
  'monthly_salary',
  'job_type',
  'issue_category',
  'employment_status',
  'timeline',
] as const;

const EXTRACTION_PROMPT = `당신은 노무 상담 사용자의 메시지에서 핵심 상황 정보만 정확히 추출하는 분류기입니다.

[추출 키 정의]
- company_size: 명시된 정확한 상시근로자수만 정수로 출력. "10명"→10. "5인 미만", "100명 이상", 범위는 정확한 수가 아니므로 company_size 생략.
- tenure_months: 근속개월 (정수). "3년"→36, "1년 6개월"→18, "신입"→0. 모르면 생략.
- monthly_salary: 월급 원화 (정수). "300만원"→3000000, "연봉 4천"→3333333(연/12). 모르면 생략.
- job_type: 정규직/계약직/단시간/일용직/파견/프리랜서/임원 중 하나. 모르면 생략.
- issue_category: 임금체불/부당해고/괴롭힘/연차/퇴직금/산재/노조/근로계약/연장수당/통상임금/육아휴직/4대보험 중 가장 가까운 1개. 모르면 생략.
- employment_status: 재직중/퇴직/예정 중 하나. 모르면 생략.
- timeline: 사건 발생 시점 또는 마감일을 짧은 문자열 (예: "2026-03 체불 발생", "다음주 사직 예정"). 모르면 생략.

[규칙]
- 메시지에 "명시적으로" 등장하는 정보만 추출. 추측 금지.
- 기존 프로필에 이미 있는 값과 모순되면 새 값 우선 (사용자가 정정 가능).
- 불확실하거나 추측해야 하면 그 키는 출력하지 않음.
- 출력은 순수 JSON 객체 한 개. 코드블록 표시 X. 추출된 키가 없으면 빈 객체 {}.

[기존 프로필]
{prev_profile}

[사용자 메시지]
{user_message}

JSON 출력:`;

export async function getSituation(sessionId: string): Promise<UserSituation> {
  const { data } = await db
    .from('user_situation')
    .select('profile')
    .eq('session_id', sessionId)
    .maybeSingle();
  return (data?.profile as UserSituation) || {};
}

export async function upsertSituation(
  sessionId: string,
  prevProfile: UserSituation,
  newDelta: UserSituation,
  turnIncrement: number = 1
): Promise<void> {
  // delta에서 빈 값/유효하지 않은 키 필터
  const cleanDelta: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = newDelta[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'company_size_unresolved') {
      const unresolved = newDelta.company_size_unresolved;
      if (!unresolved || typeof unresolved.original !== 'string' || typeof unresolved.reason !== 'string') continue;
      cleanDelta[k] = unresolved;
    } else if (k === 'company_size_evidence') {
      const evidence = newDelta.company_size_evidence;
      if (!evidence || typeof evidence.original !== 'string' || !['eq', 'lt', 'lte', 'gt', 'gte', 'range', 'approx'].includes(evidence.operator) || evidence.scope !== 'employer' || !['regular_workers', 'employees', 'business_threshold'].includes(evidence.kind) || !Number.isFinite(evidence.value)) continue;
      cleanDelta[k] = evidence;
    } else if (k === 'company_size' || k === 'tenure_months' || k === 'monthly_salary') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      cleanDelta[k] = n;
    } else {
      cleanDelta[k] = v;
    }
  }
  if (Object.keys(cleanDelta).length === 0 && turnIncrement === 0) return;

  const merged = mergeSituation(prevProfile, cleanDelta);
  const { data: existing } = await db
    .from('user_situation')
    .select('turns_observed')
    .eq('session_id', sessionId)
    .maybeSingle();
  const turns = (existing?.turns_observed || 0) + turnIncrement;

  await db
    .from('user_situation')
    .upsert(
      { session_id: sessionId, profile: merged, turns_observed: turns },
      { onConflict: 'session_id' }
    );
}

/** Share this policy between immediate prompt assembly and deferred persistence. */
export function mergeSituation(prevProfile: UserSituation, delta: UserSituation): UserSituation {
  const merged = { ...prevProfile, ...delta };
  if (delta.company_size_unresolved) {
    delete merged.company_size;
    delete merged.company_size_evidence;
  } else if (delta.company_size_evidence) {
    delete merged.company_size_unresolved;
    if (delta.company_size_evidence.operator !== 'eq' || delta.company_size_evidence.kind !== 'regular_workers') delete merged.company_size;
  }
  return merged;
}

export function formatSituationForPrompt(profile: UserSituation): string {
  const parts: string[] = [];
  if (profile.company_size_unresolved) {
    parts.push(`회사 인원 정보 확인 필요: 사용자 정정 원문 ‘${profile.company_size_unresolved.original}’ (${profile.company_size_unresolved.reason}; 이전 인원 값은 적용하지 않음)`);
  } else if (profile.company_size_evidence) {
    const evidence = profile.company_size_evidence;
    if (evidence.scope === 'employer' && evidence.kind) {
      parts.push(`회사규모: 사용자 원문 ‘${evidence.original}’ (${evidence.kind === 'regular_workers' ? '상시근로자수' : '상시근로자수인지 미확인'}; 범위·부등호·근사 표현 보존, 정확한 인원으로 추정하지 않음)`);
    }
  } else if (profile.company_size != null) {
    parts.push(`기존 저장 인원: ${profile.company_size}명 (원문·집계 범위 미확인, 상시근로자수로 단정하지 않음)`);
  }
  if (profile.tenure_months != null) {
    const years = Math.floor(profile.tenure_months / 12);
    const months = profile.tenure_months % 12;
    const tenureStr = years > 0 ? `${years}년${months > 0 ? ` ${months}개월` : ''}` : `${months}개월`;
    parts.push(`근속: ${tenureStr}`);
  }
  if (profile.monthly_salary != null) {
    parts.push(`월급: ${profile.monthly_salary.toLocaleString('ko-KR')}원`);
  }
  if (profile.job_type) parts.push(`고용형태: ${profile.job_type}`);
  if (profile.employment_status) parts.push(`재직상태: ${profile.employment_status}`);
  if (profile.issue_category) parts.push(`주요 이슈: ${profile.issue_category}`);
  if (profile.timeline) parts.push(`시점: ${profile.timeline}`);

  if (parts.length === 0) return '';
  return (
    '\n\n═══ 사용자 상황 기록 (이전 대화에서 수집됨, 근거·집계 범위 확인 후 반영) ═══\n' +
    parts.join(' / ') +
    '\n명시된 원문과 집계 범위만 반영하세요. 직원수·근사치·기존 저장 인원을 법률상 상시근로자수로 단정하지 마세요. 적용 조건이 부족하면 확인 질문을 하세요.\n'
  );
}

export async function extractDelta(
  userMessage: string,
  prevProfile: UserSituation
): Promise<UserSituation> {
  const headcountEvidence = companySizeDelta(userMessage);
  if (!userMessage || userMessage.length < 4) return headcountEvidence;
  const prompt = EXTRACTION_PROMPT.replace(
    '{prev_profile}',
    JSON.stringify(prevProfile)
  ).replace('{user_message}', userMessage.slice(0, 1000));

  try {
    const model = getGenerativeModel();
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 256,
      },
    });
    const text: string =
      response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    // 1) ```json ... ``` 블록 제거 2) 첫 번째 { ... } 매칭
    const stripped = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return headcountEvidence;
    const parsed = JSON.parse(m[0]);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return headcountEvidence;
    const result: UserSituation = {};
    for (const k of KEYS) {
      if (parsed[k] !== undefined) result[k] = parsed[k];
    }
    // A model-proposed point estimate is never evidence of an exact headcount.
    delete result.company_size;
    delete result.company_size_evidence;
    delete result.company_size_unresolved;
    return { ...result, ...headcountEvidence };
  } catch {
    return headcountEvidence;
  }
}
