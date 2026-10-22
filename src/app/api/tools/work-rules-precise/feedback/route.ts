// 정밀 점검 결과에 대한 조문별 반응(맞음·틀림·애매) — 정답지를 쌓는 통로다. 본문은 받지 않는다.
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const VERDICTS = new Set(['right', 'wrong', 'unsure']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request): Promise<Response> {
  if (process.env.WORK_RULES_PRECISE_ENABLED !== '1') return json(501, { error: 'not_configured' });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const runId = typeof b.runId === 'string' ? b.runId : '';
  const article = typeof b.article === 'string' ? b.article.slice(0, 40) : '';
  const verdict = typeof b.verdict === 'string' ? b.verdict : '';
  const note = typeof b.note === 'string' ? b.note.slice(0, 500) : null;
  if (!UUID.test(runId) || !article || !VERDICTS.has(verdict)) return json(400, { error: 'bad_request' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(503, { error: 'unavailable' });
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  // 같은 조문에 다시 누르면 마지막 반응으로 바꾼다
  const { error } = await db.from('work_rules_precise_feedback')
    .upsert({ run_id: runId, article, verdict, note }, { onConflict: 'run_id,article' });
  if (error) {
    console.error('[work-rules-precise/feedback] insert failed', error.code ?? 'unknown');
    return json(502, { error: 'store_failed' });
  }
  return json(200, { ok: true });
}
