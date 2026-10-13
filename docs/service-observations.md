# Service completion observations v1

The collector reuses public.api_logs with event_type=service_completion_v1. It observes consultation (/api/chat), contract extraction (/api/tools/contract-check/extract), and case search (/api/search). It does not use chat_logs as an answer-success counter.

SERVICE_OBSERVATIONS_ENABLED must equal 1. The default is disabled. Only the existing server service-role key is used; the URL must target mewqgevgdgghhatqtuos.supabase.co. No schema, RLS, grant, key, retention, deletion, or production environment changes are included. Live read-only inspection found api_logs RLS enabled, no public policies, service-role INSERT available, no triggers, and only a primary-key constraint.

The payload contains a fresh UUID, fixed route/method/event type, enum service/operation/stage/outcome/error code, bounded integer duration/result count, schema version, and validated deployment commit or null. Unknown result count, token usage, and estimated cost remain null. This phase does not collect provider usage; it never treats failure cost as zero.

No question, answer, document, filename, employer, wage, case text/title, URL query, session identifier, IP, free metadata, or error message is copied. Existing raw chat_logs and console behavior are separate and unchanged. Contract originals and extraction results remain response-only; rate-limit counters and browser-only calculator data retain their boundaries.

Success means server-side operation completion: chat body passes the existing >=50-character completion criterion and its stream closes, extraction returns a sanitized contract, or the requested case-search buckets finish (zero results may be success). Stream errors after body emission, explicit retrieval failures with a usable answer, and partially failed search buckets are partial_failure. Empty generation, blocked validation, all failed search buckets, and upstream/parse failures are failure. Cancellations retain whether a partial body was emitted. This does not assert legal correctness or client rendering/delivery.

Model body frames are counted only in request memory. Normal footers/progress/fallbacks do not become body evidence. Request abort and underlying stream cancellation resolve the same once-only terminal recorder; late completion cannot replace cancellation. This does not cancel an already-running upstream model call.

Next.js after is registered while the route context is active and waits for terminal metadata, then performs a bounded two-second DB insert. It does not add DB latency to the response. A fixed generic warning signals unavailable persistence without printing request/error values. Hard runtime termination, platform maxDuration exhaustion, persistence failure, and legacy helpers that silently suppress failures can leave observation gaps; logged events are not an exact denominator of all incoming traffic.

Official lifecycle reference: https://nextjs.org/docs/app/api-reference/functions/after . after runs within the route/platform duration budget; runtime validation is still required before activation.

Deployment gate: independent review, unit/type/lint/build/browser verification, exact-head PR checks. Keep the feature disabled until production approval. A no-AI smoke can exercise contract validation rejection and inspect only the new event shape; paid-success paths must use provider mocks in tests, not new production AI calls.

Read-only aggregate example (no migration):

```sql
SELECT metadata->>'service' AS service,
       metadata->>'stage' AS stage,
       status AS outcome, reason AS error_code,
       count(*) AS terminal_events,
       count(*) FILTER (WHERE status='success') AS completed_events,
       count(*) FILTER (WHERE status='partial_failure') AS partial_events,
       count(*) FILTER (WHERE status='failure') AS failed_events,
       avg(latency_ms) AS mean_duration_ms,
       sum(result_count) AS known_result_total,
       count(*) FILTER (WHERE result_count IS NULL) AS unknown_result_events
FROM public.api_logs
WHERE event_type='service_completion_v1'
  AND metadata->>'service' IN ('consultation','contract_extract','case_search')
GROUP BY 1,2,3,4;
```

Do not sum/coalesce unknown usage or cost to zero. Do not count old chat_logs rows or HTTP200 SSE starts as completed answers. No extra read endpoint or public reporting policy is introduced.
