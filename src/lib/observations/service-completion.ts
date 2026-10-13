import 'server-only';
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const services = {
  consultation: { route: '/api/chat', operation: 'answer', method: 'POST' },
  contract_extract: { route: '/api/tools/contract-check/extract', operation: 'extract', method: 'POST' },
  case_search: { route: '/api/search', operation: 'search', method: 'GET' },
} as const;
export type Service = keyof typeof services;
export type Stage = 'validation' | 'retrieval' | 'generation' | 'extraction' | 'stream' | 'completed';
export type Outcome = 'success' | 'partial_failure' | 'failure';
export type ErrorCode = 'none' | 'invalid_request' | 'not_configured' | 'blocked' | 'rate_limited' | 'upstream_failed' | 'parse_failed' | 'search_failed' | 'stream_failed' | 'empty_answer' | 'cancelled' | 'internal_error';
export type Completion = { stage: Stage; outcome: Outcome; error_code: ErrorCode; duration_ms: number; result_count: number | null };
const stages = ['validation','retrieval','generation','extraction','stream','completed'];
const outcomes = ['success','partial_failure','failure'];
const errors = ['none','invalid_request','not_configured','blocked','rate_limited','upstream_failed','parse_failed','search_failed','stream_failed','empty_answer','cancelled','internal_error'];
const bounded = (n: unknown, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Explicit projection, never spread a request/result/error into the persistence payload.
export function completionRow(service: Service, runId: string, value: Completion) {
  if (!Object.hasOwn(services, service) || !uuid.test(runId) || !value ||
      Object.keys(value).sort().join(',') !== 'duration_ms,error_code,outcome,result_count,stage' ||
      !stages.includes(value.stage) || !outcomes.includes(value.outcome) || !errors.includes(value.error_code) ||
      !bounded(value.duration_ms, 86_400_000) || !(value.result_count === null || bounded(value.result_count, 100_000))) return null;
  const config = services[service];
  const version = process.env.VERCEL_GIT_COMMIT_SHA;
  return { id: runId, route: config.route, event_type: 'service_completion_v1', method: config.method,
    status: value.outcome, reason: value.error_code, latency_ms: value.duration_ms, result_count: value.result_count,
    metadata: { schema_version: 1, service, operation: config.operation, stage: value.stage,
      service_version: version && /^[0-9a-f]{40}$/.test(version) ? version : null,
      token_usage: null, estimated_cost: null } };
}
export async function persistCompletion(service: Service, runId: string, value: Completion) {
  if (process.env.SERVICE_OBSERVATIONS_ENABLED !== '1') return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'mewqgevgdgghhatqtuos.supabase.co') return false;
    const row = completionRow(service, runId, value);
    if (!row) return false;
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(2000) }) } });
    const { error } = await db.from('api_logs').insert(row);
    return !error;
  } catch { return false; }
}
export function startServiceObservation(service: Service) {
  const start = Date.now(), runId = crypto.randomUUID();
  let finished = false;
  let resolveCompletion: ((value: Completion) => void) | undefined;
  // Register while the route's request context is active, before stream/cancel callbacks.
  if (process.env.SERVICE_OBSERVATIONS_ENABLED === '1') {
    const terminal = new Promise<Completion>(resolve => { resolveCompletion = resolve; });
    try { after(async () => {
      const completion = await terminal;
      if (!await persistCompletion(service, runId, completion)) console.warn('[service-observations] completion write unavailable');
    }); } catch { console.warn('[service-observations] request lifecycle unavailable'); }
  }
  return { finish(value: Omit<Completion, 'duration_ms'>) {
    if (finished) return;
    finished = true;
    resolveCompletion?.({ ...value, duration_ms: Math.min(86_400_000, Math.max(0, Date.now() - start)) });
  } };
}
