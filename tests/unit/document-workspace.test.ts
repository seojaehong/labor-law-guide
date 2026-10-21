import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { mkdtempSync, rmSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { initialWorkspace, transition, documentText, validateWorkspace } from '@/lib/document-workspace/workflow';
import { createWord } from '@/lib/document-workspace/word';
import { BudgetStore } from '@/lib/document-workspace/budget';
import { runModel, choosePublicEvidence } from '@/lib/document-workspace/model-mix';
import { POST } from '@/app/api/document-workspace/route';

const dirs: string[] = [];
function store(limit = 1000) { const dir = mkdtempSync(join(tmpdir(), 'workspace-test-')); dirs.push(dir); return { dir, budget: new BudgetStore(dir, limit) }; }
const price = { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1, reviewed: true };
const policy = { model: 'fixture-document', inputCap: 100, outputCap: 200, pricing: price, timeoutMs: 100 };
function draft() { let s = initialWorkspace(); for (const a of ['consult', 'confirm-facts', 'outline', 'confirm-outline', 'draft'] as const) { if(a==='confirm-outline')s.sections=s.sections.map(x=>({...x,text:'Synthetic approved outline'}));s = transition(s, a); } s.review={...s.review!,status:'generated',generatedFactRevision:0}; return transition(s,'accept-review'); }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });
describe('document workflow', () => {
  it('connects consultation, fact confirmation, approved outline and draft', () => {
    const s = draft(); expect(s.stage).toBe('draft'); expect(s.revision).toBe(6); expect(s.sections).toHaveLength(4);
    expect(documentText(s)).toContain('확인 필요'); expect(s.missing.length).toBeGreaterThan(0);
  });
  it('requires fact confirmation before outline', () => expect(() => transition(transition(initialWorkspace(), 'consult'), 'outline')).toThrow('facts-required'));
  it('requires outline approval before drafting', () => {
    const s = transition(transition(transition(initialWorkspace(), 'consult'), 'confirm-facts'), 'outline');
    expect(() => transition(s, 'draft')).toThrow('outline-required');
  });
  it('revises only the selected section with immutable prior version', () => {
    const s = draft(), next = transition(s, 'revise', 'grounds', '수정된 합성 주장');
    expect(next.sections[2].text).toBe('수정된 합성 주장'); expect(s.sections[2].text).not.toBe(next.sections[2].text);
    expect(next.sections.filter(x => x.id !== 'grounds')).toEqual(s.sections.filter(x => x.id !== 'grounds'));
  });
  it('rejects unknown sections and invalid provenance', () => {
    expect(() => transition(draft(), 'revise', 'other', 'text')).toThrow();
    expect(() => validateWorkspace({ ...draft(), evidence: ['invented-law'] })).toThrow('invalid-evidence');
  });
  it('exports a real Word OOXML zip preserving Korean and escaping text', async () => {
    const s = transition(transition(draft(), 'revise', 'grounds', '<가상> & 수정'),'accept-review');
    const zip = await JSZip.loadAsync(await createWord(s));
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('&lt;가상&gt; &amp; 수정'); expect(xml).toContain('신청 취지');
  });
});
describe('durable fail-closed budget', () => {
  it('reserves before send and blocks requests beyond monthly cap', () => {
    const { budget } = store(300); budget.reserve('request-1', 'fixture', 100, 200, price);
    expect(() => budget.reserve('request-2', 'fixture', 1, 1, price)).toThrow('monthly-budget-exceeded');
  });
  it('blocks duplicate after restart', () => {
    const { dir, budget } = store(); budget.reserve('request-1', 'fixture', 100, 200, price);
    expect(() => new BudgetStore(dir, 1000).reserve('request-1', 'fixture', 100, 200, price)).toThrow('duplicate-request');
  });
  it('settles confirmed usage and stores no source text', () => {
    const { dir, budget } = store(); budget.reserve('request-1', 'fixture', 100, 200, price);
    budget.finish('request-1', { inputTokens: 20, outputTokens: 30 }, price, 100, 200, 40, true);
    expect(budget.metrics()[0]).toMatchObject({ costMicroUsd: 50, state: 'success', calls: 1, latencyMs: 40 });
    expect(readFileSync(join(dir, 'ledger.json'), 'utf8')).not.toContain('prompt');
  });
  it.each([undefined, { inputTokens: 101, outputTokens: 1 }, { inputTokens: NaN, outputTokens: 1 }])('retains maximum when usage invalid: %s', usage => {
    const { budget } = store(); budget.reserve('request-1', 'fixture', 100, 200, price);
    budget.finish('request-1', usage, price, 100, 200, 40, false);
    expect(budget.metrics()[0]).toMatchObject({ costMicroUsd: 300, state: 'unknown' });
  });
  it('carries old uncertain reservations into a new month', () => {
    const { budget } = store(300); budget.reserve('request-1', 'fixture', 100, 200, price, new Date('2026-10-01'));
    expect(() => budget.reserve('request-2', 'fixture', 1, 1, price, new Date('2026-11-01'))).toThrow('monthly-budget-exceeded');
  });
  it('corrupt store and an existing lock fail closed', () => {
    const { dir, budget } = store(); writeFileSync(join(dir, 'ledger.json'), '{bad');
    expect(() => budget.reserve('request-1', 'fixture', 100, 200, price)).toThrow('budget-unavailable');
    writeFileSync(join(dir, 'lock'), '1'); expect(() => budget.metrics()).toThrow('budget-unavailable');
  });
  it('missing initialized ledger does not reset the budget', () => {
    const { dir, budget } = store(); budget.reserve('request-1', 'fixture', 100, 200, price);
    unlinkSync(join(dir, 'ledger.json')); expect(() => budget.reserve('request-2', 'fixture', 100, 200, price)).toThrow('budget-unavailable');
  });
});
describe('role separation and no duplicate billing fallback', () => {
  it('selects document role output allowance independently of ordinary chat 1200', async () => {
    const { budget } = store(10000); const generator = vi.fn(async (request: unknown) => { void request; return { text: 'synthetic', usage: { inputTokens: 10, outputTokens: 20 } }; });
    const result = await runModel({ enabled: true, requestId: 'request-1', role: 'document', prompt: 'synthetic', policies: { document: { ...policy, outputCap: 8192 } }, store: budget, generator });
    expect(result.model).toBe('fixture-document'); expect(generator.mock.calls).toHaveLength(1);
    expect(generator.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 8192 });
  });
  it.each([false, true])('disabled or unreviewed role never invokes generator: %s', enabled => {
    const { budget } = store(); const generator = vi.fn();
    return expect(runModel({ enabled, requestId: 'request-1', role: 'complex', prompt: 'synthetic', policies: {}, store: budget, generator })).rejects.toThrow().then(() => expect(generator).not.toHaveBeenCalled());
  });
  it('provider failure keeps reserve with one call and no fallback', async () => {
    const { budget } = store(); const generator = vi.fn(async () => { throw Error('private-provider-error'); });
    await expect(runModel({ enabled: true, requestId: 'request-1', role: 'document', prompt: 'synthetic', policies: { document: policy }, store: budget, generator })).rejects.toThrow('generation-abstained');
    expect(generator).toHaveBeenCalledTimes(1); expect(budget.metrics()[0].costMicroUsd).toBe(300);
  });
  it('timeout cannot release reserve even if SDK completes late', async () => {
    const { budget } = store(); const generator = vi.fn(async () => { await new Promise(r => setTimeout(r, 30)); return { text: 'late', usage: { inputTokens: 1, outputTokens: 1 } }; });
    await expect(runModel({ enabled: true, requestId: 'request-1', role: 'document', prompt: 'synthetic', policies: { document: { ...policy, timeoutMs: 5 } }, store: budget, generator })).rejects.toThrow('generation-abstained');
    await new Promise(r => setTimeout(r, 40)); expect(budget.metrics()[0]).toMatchObject({ state: 'unknown', costMicroUsd: 300 }); expect(generator).toHaveBeenCalledTimes(1);
  });
  it('Jev contract contains only fixed public headings and rejects unknown IDs', async () => {
    const selector = vi.fn(async () => ['invented']);
    expect(await choosePublicEvidence(selector)).toEqual(['lsa-23', 'lsa-27', 'lsa-28']);
    expect(JSON.stringify(selector.mock.calls)).not.toContain('합성 근로자');
  });
  it('Jev errors preserve ordinary order and call no generator', async () => expect(await choosePublicEvidence(async () => { throw Error('timeout'); })).toEqual(['lsa-23', 'lsa-27', 'lsa-28']));
});
describe('local-only API guards', () => {
  it('is off by default', async () => { vi.stubEnv('AI_WORKSPACE_DEMO', 'false'); expect((await POST(new Request('http://localhost/api/document-workspace', { method: 'POST' }))).status).toBe(404); });
  it('cannot activate in production', async () => { vi.stubEnv('AI_WORKSPACE_DEMO', 'true'); vi.stubEnv('NODE_ENV', 'production'); expect((await POST(new Request('http://localhost/api/document-workspace', { method: 'POST' }))).status).toBe(404); });
  it('rejects a foreign origin before parsing or generating', async () => { vi.stubEnv('AI_WORKSPACE_DEMO', 'true'); vi.stubEnv('AI_WORKSPACE_MOCK_TRANSPORT', 'true'); expect((await POST(new Request('http://localhost/api/document-workspace', { method: 'POST', headers: { origin: 'https://other.invalid' } }))).status).toBe(403); });
});
