import { supabaseAdmin } from './supabase-server';
import { supabase } from './supabase';

const db = supabaseAdmin || supabase;

export type UserSituation = {
  company_size?: number;
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
  'tenure_months',
  'monthly_salary',
  'job_type',
  'issue_category',
  'employment_status',
  'timeline',
] as const;

const EXTRACTION_PROMPT = `당신은 노무 상담 사용자의 메시지에서 핵심 상황 정보만 정확히 추출하는 분류기입니다.

[추출 키 정의]
- company_size: 상시근로자수 (정수). "5인 미만"→4, "10명"→10, "100명 이상"→100. 모르면 생략.
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
    if (k === 'company_size' || k === 'tenure_months' || k === 'monthly_salary') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      cleanDelta[k] = n;
    } else {
      cleanDelta[k] = v;
    }
  }
  if (Object.keys(cleanDelta).length === 0 && turnIncrement === 0) return;

  const merged = { ...prevProfile, ...cleanDelta };
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

export function formatSituationForPrompt(profile: UserSituation): string {
  const parts: string[] = [];
  if (profile.company_size != null) {
    parts.push(`회사규모: 상시 ${profile.company_size}명${profile.company_size < 5 ? ' (5인 미만 사업장)' : ''}`);
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
    '\n\n═══ 확인된 사용자 상황 (이전 대화에서 수집됨, 답변에 반드시 반영) ═══\n' +
    parts.join(' / ') +
    '\n위 정보를 토대로 맞춤 답변하세요. 예: 5인 미만이면 부당해고 구제신청 제외, 월급으로 퇴직금 산정 등.\n'
  );
}

export async function extractDelta(
  userMessage: string,
  prevProfile: UserSituation,
  apiKey: string
): Promise<UserSituation> {
  if (!userMessage || userMessage.length < 4) return {};
  const prompt = EXTRACTION_PROMPT.replace(
    '{prev_profile}',
    JSON.stringify(prevProfile)
  ).replace('{user_message}', userMessage.slice(0, 1000));

  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 256,
        temperature: 0.0,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return {};
    const j = await resp.json();
    const text: string = j?.choices?.[0]?.message?.content || '{}';
    // 1) ```json ... ``` 블록 제거 2) 첫 번째 { ... } 매칭
    const stripped = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const parsed = JSON.parse(m[0]);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: UserSituation = {};
    for (const k of KEYS) {
      if (parsed[k] !== undefined) result[k] = parsed[k];
    }
    return result;
  } catch {
    return {};
  }
}
