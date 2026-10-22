// 취업규칙 정밀 점검 API — 본문을 받아 조문별 묶음 판단(Sonnet, 2회 합집합)을 돌려 대조표 행을 돌려준다.
// - 플래그(WORK_RULES_PRECISE_ENABLED=1)와 키(ANTHROPIC_API_KEY)가 둘 다 있어야 열린다. 아니면 501.
// - 본문 전체가 이 서버를 거쳐 Anthropic(외부 AI 제공사)으로 간다. 본문은 로그에 남기지 않는다.
// - 본문 저장은 사용자가 동의(store=true)했을 때만 — 동의가 없으면 행의 조문 원문(현행·개정안)을 비우고 점검 결과만 남긴다.
// - 결과는 노무사 검수 전 초안이다. 화면 문구가 그 점을 알린다(RulesCheck.tsx).
import { createClient } from '@supabase/supabase-js';
import { isTurnstileEnabled, verifyTurnstile } from '@/lib/turnstile';
import { extractIp, hashIp } from '@/lib/client-ip';
import type { RuleSpec } from '@/lib/laws/rules-check';
import { anthropicAsk, usd, type Usage } from '@/lib/laws/precise/judge';
import { splitArticles } from '@/lib/laws/precise/articles';
import { MAX_ARTICLES, precisePipeline, rowsForStore } from '@/lib/laws/precise/pipeline';
import { todayKST } from '@/lib/laws/format';
import { loadEvidence } from '@/lib/laws/precise/evidence';
import rulesJson from '../../../../../public/data/laws/rules.json';

export const runtime = 'nodejs';
// 2회 × 13묶음 안팎을 8개씩 동시에 — 실측 45~75초(2026-10-22). 300초는 Vercel Pro 이상에서 허용된다(newsletter 라우트도 300)
export const maxDuration = 300;
const DEADLINE_MS = 240_000; // 불변식: DEADLINE_MS + 마무리(저장·응답) < maxDuration

const MAX_CHARS = 300_000; // 취업규칙 한 벌은 5만~10만 자다
const IP_DAILY_LIMIT = parseInt(process.env.WORK_RULES_PRECISE_IP_DAILY_LIMIT || '3', 10);
// 비용 폭주 방어선. 1건 ≈ $0.5~1 → 50건이면 하루 최대 $50 선에서 멈춘다
const GLOBAL_DAILY_LIMIT = parseInt(process.env.WORK_RULES_PRECISE_GLOBAL_DAILY_LIMIT || '50', 10);

type Obj = Record<string, unknown>;
const json = (status: number, body: Obj) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

/** 유료 호출은 카운터를 확인할 수 있을 때만 허용한다. */
async function underLimit(scope: 'ip' | 'global', key: string, max: number): Promise<boolean | null> {
  if (!Number.isSafeInteger(max) || max <= 0) return null;
  try {
    const client = db();
    if (!client) {
      console.error('[work-rules-precise] rate limit unavailable: supabase env missing');
      return null;
    }
    const { data, error } = await client.rpc('incr_rate_limit', { p_scope: scope, p_key: key, p_max: max });
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | undefined;
    if (error || !row || typeof row.allowed !== 'boolean') {
      console.error('[work-rules-precise] rate limit unavailable', scope, error?.message ?? 'shape');
      return null;
    }
    return row.allowed;
  } catch (err) {
    console.error('[work-rules-precise] rate limit exception', scope, err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

const validDate = (v: string) => { const d = new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T00:00:00Z`); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10).replaceAll('-', ''); };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.WORK_RULES_PRECISE_ENABLED !== '1' || !apiKey) {
    return json(501, { error: 'not_configured', message: '정밀 점검을 준비 중입니다.' });
  }
  let input: Obj;
  try {
    input = (await req.json()) as Obj;
  } catch {
    return json(400, { error: 'bad_request', message: '취업규칙 본문을 보내 주세요.' });
  }
  const rules = str(input.rules);
  const old = str(input.old) || null;
  const since = str(input.since).replace(/-/g, '');
  const headcount = str(input.headcount).slice(0, 10);
  if (!rules.trim() || (!/^\d{8}$/.test(since) || validDate(since) !== since)) {
    return json(400, { error: 'bad_request', message: '본문과 점검 시작일이 필요합니다.' });
  }
  if (rules.length > MAX_CHARS || (old?.length ?? 0) > MAX_CHARS) {
    return json(413, { error: 'too_large', message: '본문이 너무 깁니다. 취업규칙 본칙만 넣어 주세요.' });
  }

  // 횟수를 쓰기 전에 값싼 검사부터 — 목차만 붙여넣은 경우에 하루 횟수를 깎지 않는다
  const arts = splitArticles(rules);
  if (!arts.some((a) => a.body.trim())) {
    return json(422, { error: 'empty_rules', message: '조문(제N조)을 찾지 못했습니다. 목차만 들어갔는지 확인해 주세요.' });
  }
  if (old && !splitArticles(old).some((a) => a.body.trim())) return json(422, { error: 'empty_old', message: '종전 본문의 조문을 확인해 주세요.' });
  if (arts.length + (old ? splitArticles(old).length : 0) > MAX_ARTICLES) {
    return json(413, { error: 'too_many_articles', message: `조문이 ${MAX_ARTICLES}개를 넘습니다. 취업규칙 한 벌씩 넣어 주세요.` });
  }

  const ip = extractIp(req);
  if (isTurnstileEnabled()) {
    const ts = await verifyTurnstile(str(input.turnstileToken) || null, ip);
    if (!ts.skipped && !ts.success) {
      return json(403, { error: 'bot_check_failed', message: '자동 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }
  // 개인 횟수를 먼저 본다 — 이미 막힌 한 사람이 전체 한도를 깎지 못하게
  const unavailable = () => json(503, { error: 'usage_guard_unavailable', message: '이용 한도를 확인할 수 없어 유료 AI 점검을 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.' });
  const ipAllowed = await underLimit('ip', `wrp:${hashIp(ip)}`, IP_DAILY_LIMIT);
  if (ipAllowed === null) return unavailable();
  if (!ipAllowed) {
    return json(429, { error: 'rate_limited', message: `정밀 점검은 하루 ${IP_DAILY_LIMIT}회까지 이용할 수 있습니다.` });
  }
  const globalAllowed = await underLimit('global', 'wrp_all', GLOBAL_DAILY_LIMIT);
  if (globalAllowed === null) return unavailable();
  if (!globalAllowed) {
    return json(429, { error: 'rate_limited', message: '오늘 정밀 점검 한도가 찼습니다. 내일 다시 이용해 주세요.' });
  }

  const t0 = Date.now();
  const runId = crypto.randomUUID();
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const accounting = { attempts: 0, responsesWithUsage: 0 };
  let result;
  try {
    // 요청 전체 상한 — 플랫폼 타임아웃(maxDuration)보다 먼저 끊어 JSON 으로 답한다. 끊긴 묶음은 「추가 확인」으로 남는다
    result = await precisePipeline({ rules, old, since, headcount }, (rulesJson as { rules: RuleSpec[] }).rules,
      { evidence: await loadEvidence((rulesJson as { rules: RuleSpec[] }).rules), asOf: todayKST(), ask: anthropicAsk({ apiKey, usage, accounting }), runs: 2, workers: 8, signal: AbortSignal.timeout(DEADLINE_MS) });
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'empty_rules' || code === 'empty_old') {
      return json(422, { error: code, message: '조문(제N조)을 찾지 못했습니다. 목차만 들어갔는지 확인해 주세요.' });
    }
    process.stdout.write(JSON.stringify({ event: 'work_rules_precise_estimated_usage', runId, usage, accounting, estimatedUsd: usd(usage), billingVerified: false, usageComplete: accounting.attempts === accounting.responsesWithUsage }) + '\n');
    console.error('[work-rules-precise] pipeline failed', err instanceof Error ? err.name : 'unknown');
    return json(502, { error: 'judge_failed', message: '점검 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.' });
  }
  process.stdout.write(JSON.stringify({ event: 'work_rules_precise_estimated_usage', runId, usage, accounting, estimatedUsd: usd(usage), billingVerified: false, usageComplete: accounting.attempts === accounting.responsesWithUsage }) + '\n');
  if (usage.output_tokens === 0 || result.review.unanswered === result.articles) { // 한 묶음도 답을 못 받았다 — 전부 「판단 실패」인 표를 성공으로 내지 않는다
    console.error('[work-rules-precise] all calls failed');
    return json(502, { error: 'judge_failed', message: 'AI 점검 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const cost = Math.round(usd(usage) * 1e4) / 1e4;
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  const store = input.store === true;
  try {
  const client = db();
  if (client) { // 수집 — 실패해도 결과는 돌려준다
    const { error } = await client.from('work_rules_precise_runs').insert({
      id: runId, articles: result.articles, flagged: result.flagged, usd: cost, seconds, headcount: headcount || null,
      rows: rowsForStore(result.rows, store), stored_text: store, rules_text: store ? rules : null, old_text: store ? old : null,
    });
    if (error) console.error('[work-rules-precise] run insert failed', error.code ?? 'unknown');
  }
  } catch { console.error('[work-rules-precise] run insert exception'); }
  console.log('[work-rules-precise] done', result.articles, result.flagged, cost, seconds);
  return json(200, { runId, rows: result.rows, articles: result.articles, flagged: result.flagged, seconds, review: result.review, cost: { estimatedUsd: cost, billingVerified: false, usageComplete: accounting.attempts === accounting.responsesWithUsage } });
}
