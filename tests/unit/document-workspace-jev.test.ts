import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ prepare: vi.fn(() => 'public-payload'), rank: vi.fn(async (_topic: string, rows: unknown[]) => rows) }));
vi.mock('@/lib/chat/context/public-law-rerank', () => ({ preparePublicLawRequest: mocks.prepare, rerankPublicLaws: mocks.rank }));
import { selectPublicLawEvidence } from '@/lib/document-workspace/jev-selector';
import { BudgetStore } from '@/lib/document-workspace/budget';
const dirs: string[] = [];
function setup(limit = 40000) {
  (process as unknown as Record<symbol,unknown>)[Symbol.for('document-workspace.offline-transport')]={kind:'network-blocked-mock',modelFactory:()=>({}),fetch:globalThis.fetch};
  const dir = mkdtempSync(join(tmpdir(), 'jev-budget-test-')); dirs.push(dir);
  return { enabled: true, requestId: 'request-jev-1', publicTopic: 'dismissal' as const,
    laws: [{ law_name: '근로기준법', article_label: '제27조', article_title: '공개 제목', body: '공개 본문 fixture' }],
    store: new BudgetStore(dir, limit), pricing: { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 1, reviewed: true } };
}
afterEach(() => { delete (process as unknown as Record<symbol,unknown>)[Symbol.for('document-workspace.offline-transport')]; for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.prepare.mockReturnValue('public-payload'); });
it('disabled path never prepares or invokes Jev', async () => {
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'false'); const input = setup(); expect(await selectPublicLawEvidence(input)).toBe(input.laws);
  expect(mocks.rank).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it('budget denial prevents Jev calls', async () => {
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'true'); const input = setup(1);
  await expect(selectPublicLawEvidence(input)).rejects.toThrow('monthly-budget-exceeded'); expect(mocks.rank).not.toHaveBeenCalled();
});
it('uses fixed public topic once and retains reservation when usage unavailable', async () => {
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'true'); const input = setup(); await selectPublicLawEvidence(input);
  expect(mocks.rank).toHaveBeenCalledTimes(1);expect(mocks.rank.mock.calls[0].slice(0,2)).toEqual(['근로기준법 부당해고 서면 통지 구제신청',input.laws]);
  expect(input.store.metrics()[0]).toMatchObject({ model: 'jev-1.13.0', state: 'unknown', costMicroUsd: 32000 });
  await expect(selectPublicLawEvidence(input)).rejects.toThrow('duplicate-request'); expect(mocks.rank).toHaveBeenCalledTimes(1);
});
it('public provenance failure prevents reservation and call', async () => {
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'true'); mocks.prepare.mockReturnValueOnce(null as unknown as string);
  const input = setup(); expect(await selectPublicLawEvidence(input)).toBe(input.laws); expect(input.store.metrics()).toEqual([]); expect(mocks.rank).not.toHaveBeenCalled();
});
