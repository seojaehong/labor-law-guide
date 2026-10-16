import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BudgetStore } from '@/lib/document-workspace/budget';
import { type Role } from '@/lib/document-workspace/model-mix';
import { validateWorkspace, type Action } from '@/lib/document-workspace/workflow';
import { executeWorkspaceAction } from '@/lib/document-workspace/engine';
import { requireOfflineTransport } from '@/lib/document-workspace/mock-transport';
import { createAnthropicGenerator } from '@/lib/document-workspace/anthropic-generator';
import { selectPublicLawEvidence } from '@/lib/document-workspace/jev-selector';
import publicRows from '@/lib/document-workspace/public-fixture.json';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  // This route is a local synthetic harness. No live provider or credential reads.
  if (process.env.NODE_ENV === 'production' || process.env.AI_WORKSPACE_DEMO !== 'true' || process.env.AI_WORKSPACE_MOCK_TRANSPORT !== 'true') return Response.json({ code: 'disabled' }, { status: 404 });
  const origin = request.headers.get('origin');
  const expectedHost = request.headers.get('host') || new URL(request.url).host;
  let parsedOrigin: URL;
  try { parsedOrigin = new URL(origin || ''); } catch { return Response.json({ code: 'origin' }, { status: 403 }); }
  if (parsedOrigin.protocol !== 'http:' || parsedOrigin.host !== expectedHost || !['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)) return Response.json({ code: 'origin' }, { status: 403 });
  try {
    const transport = requireOfflineTransport();
    if (!transport.anthropicFactory) throw Error('mock-transport-not-installed');
    if (!request.body) throw Error('invalid-request');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65536) { void reader.cancel().catch(() => {}); return Response.json({ code: 'body-cap' }, { status: 413 }); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const body = JSON.parse(raw);
    const state = validateWorkspace(body.state);
    const actions: Action[] = ['consult', 'confirm-facts', 'outline', 'confirm-outline', 'draft', 'revise','correct-headcount','correct-leave','accept-review'];
    if (!actions.includes(body.action)) throw Error('invalid-action');
    // Local fixture identity only; production needs authenticated ownership + shared DB.
    const session = body.sessionId ?? 'synthetic-local-session';
    if (typeof session !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(session)) throw Error('invalid-request');
    const operationId = createHash('sha256').update(JSON.stringify([
      session, state.caseId, state.revision, body.action, body.sectionId ?? null,
    ])).digest('hex');
    const roles: Partial<Record<Action, Role>> = { consult: 'ordinary', outline: 'complex', draft: 'document' };
    const role = roles[body.action as Action];
    const store = new BudgetStore(join(process.cwd(), '.quality-workspace-ledger'), 1000000);
    const outputCap = role === 'document' ? 8192 : role === 'complex' ? 4096 : 2048;
    const policies = role ? { [role]: { model: role === 'ordinary' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5', inputCap: 16384, outputCap,
        timeoutMs: 3000, pricing: { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1, reviewed: true } } } : {};
    const next = await executeWorkspaceAction({ state, action: body.action, sectionId: body.sectionId, replacement: body.replacement,
      requestId: operationId, store, policies, generator: createAnthropicGenerator(transport.anthropicFactory),
      evidenceSelector: async () => {
        const rows = await selectPublicLawEvidence({ enabled: true, requestId: operationId + '-jev', publicTopic: 'dismissal',
          laws: publicRows, store, pricing: { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1, reviewed: true } });
        return rows.map(r => 'lsa-' + r.article_label.replace(/\D/g, ''));
      } });
    const metrics = await store.metrics();
    return Response.json({ state: next, mode: 'synthetic-fixture', evidenceMode: 'jev-contract-fixture',
      metrics: { calls: metrics.length, costMicroUsd: metrics.reduce((n, e) => n + e.costMicroUsd, 0),
        pending: metrics.filter(e => ['pending', 'unknown'].includes(e.state)).length, models: [...new Set(metrics.map(e => e.model))] } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid-request';
    const known = ['duplicate-request', 'monthly-budget-exceeded', 'budget-unavailable', 'generation-abstained','mock-transport-not-installed','review-response-required','input-cap','stale-conclusion'];
    return Response.json({ code: known.includes(code) ? code : 'invalid-request' }, { status: known.includes(code) ? 409 : 400 });
  }
}
