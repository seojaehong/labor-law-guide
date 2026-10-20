import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generate:vi.fn(), upsert:vi.fn(), maybeSingle:vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({supabaseAdmin:{from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.maybeSingle})}),upsert:mocks.upsert})}}));
vi.mock('@/lib/supabase', () => ({supabase:null}));
vi.mock('@/lib/vertex/client', () => ({getGenerativeModel:()=>({generateContent:mocks.generate})}));
import { extractDelta, upsertSituation, formatSituationForPrompt, mergeSituation } from '@/lib/user-situation';
beforeEach(() => {mocks.generate.mockReset();mocks.upsert.mockReset();mocks.maybeSingle.mockResolvedValue({data:{turns_observed:1}});});
it.each(['not JSON','[]','null','{}','{"company_size":4}','{"company_size_evidence":{"original":"invented"}}'])('retains deterministic bounds after model output %s', async text => {
  mocks.generate.mockResolvedValue({response:{candidates:[{content:{parts:[{text}]}}]}});
  const delta = await extractDelta('우리 회사 상시근로자 5인 미만입니다', {});
  expect(delta.company_size).toBeUndefined();
  expect(delta.company_size_evidence).toMatchObject({operator:'lt',value:5,scope:'employer',kind:'regular_workers'});
});
it('preserves deterministic evidence when model fails', async() => {
  mocks.generate.mockRejectedValue(new Error('offline failure'));
  expect((await extractDelta('회사 상시근로자 약 5명', {})).company_size_evidence?.operator).toBe('approx');
});
it('removes stale exact count when persisting approximation using mock DB only', async() => {
  mocks.generate.mockResolvedValue({response:{candidates:[{content:{parts:[{text:'{}'}]}}]}});
  const delta=await extractDelta('회사 상시근로자 약 5명',{});
  await upsertSituation('offline-fixture',{company_size:4},delta,0);
  const written=mocks.upsert.mock.calls[0][0].profile;
  expect(written.company_size).toBeUndefined();
  expect(written.company_size_evidence.operator).toBe('approx');
});
it('labels legacy stored count as unverified rather than statutory regular-worker count',()=> {
  expect(formatSituationForPrompt({company_size:4})).toContain('원문·집계 범위 미확인');
  expect(formatSituationForPrompt({company_size:4})).not.toContain('5인 미만 사업장');
});

it('clears old workforce bound after ambiguous correction in immediate prompt and mocked persistence', async () => {
  mocks.generate.mockResolvedValue({response:{candidates:[{content:{parts:[{text:'{}'}]}}]}});
  const prev = await extractDelta('회사 상시근로자 5인 미만',{});
  const text = '직원은5명미만이 아니라10명입니다';
  const delta = await extractDelta(text,prev);
  expect(delta.company_size).toBeUndefined();
  expect(delta.company_size_evidence).toBeUndefined();
  expect(delta.company_size_unresolved?.original).toBe(text);
  const merged = mergeSituation({...prev, company_size:4},delta);
  expect(merged.company_size).toBeUndefined();
  expect(merged.company_size_evidence).toBeUndefined();
  const prompt = formatSituationForPrompt(merged);
  expect(prompt).toContain('회사 인원 정보 확인 필요');
  expect(prompt).toContain('이전 인원 값은 적용하지 않음');
  expect(prompt).not.toContain('상시근로자수;');
  await upsertSituation('offline-fixture', {...prev,company_size:4},delta,0);
  expect(mocks.upsert.mock.calls[0][0].profile).toEqual(merged);
});
it('does not invalidate known employer workforce due to a subgroup correction', async () => {
  mocks.generate.mockRejectedValue(new Error('offline failure'));
  const prev = {company_size:10,company_size_evidence:{original:'회사 상시근로자 10명',operator:'eq' as const,value:10,kind:'regular_workers' as const,scope:'employer' as const}};
  const delta = await extractDelta('징계 대상 직원은 5명이 아니라 3명입니다',prev);
  expect(delta.company_size_unresolved).toBeUndefined();
  expect(mergeSituation(prev,delta)).toEqual(prev);
});
it('a later explicitly confirmed workforce resolves the unknown correction', async () => {
  mocks.generate.mockRejectedValue(new Error('offline failure'));
  const prev = {company_size_unresolved:{original:'직원은5명이 아니라10명',reason:'확인 필요'}};
  const delta = await extractDelta('회사 상시근로자 10명입니다',prev);
  expect(mergeSituation(prev,delta)).toMatchObject({company_size:10});
  expect(mergeSituation(prev,delta).company_size_unresolved).toBeUndefined();
});
