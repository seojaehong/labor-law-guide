// 261119 #218 — 이전 import 한 행정해석에는 날짜를 모를 때 넣은 자리값(2000-01-01·1970-01-01)이 남아 있다.
// 1월 1일은 공휴일이라 회신·선고가 나지 않는다. 화면·챗 메타·모델 컨텍스트 어디에도 날짜로 내보내지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decisionDate } from '@/lib/decision-date';
import { buildInterpretationsContext } from '@/lib/chat/context/interpretations';

beforeEach(() => { vi.stubEnv('JEV_ON', 'false'); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const rpc = (rows: unknown[]) => ({ rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) }) as unknown as SupabaseClient;

it.each(['2000-01-01', '1970-01-01', '20000101', '19700101', '2000-01-01T00:00:00Z'])('placeholder date %s is not a decision date', v =>
  expect(decisionDate(v)).toBeNull());

it.each(['2000-01-02', '1999-12-31', '2000-02-29', '1970-01-02'])('neighbouring real dates are kept %s', v =>
  expect(decisionDate(v)).toBe(v));

it('행정해석 컨텍스트는 자리값 날짜를 모델에도 출처 메타에도 넣지 않는다', async () => {
  const r = await buildInterpretationsContext(rpc([
    { id: '근기68207-943', title: '경비용역 근로관계', case_number: '근기68207-943', decision_date: '2000-01-01', answer_summary: '요지' },
    { id: '고관68460-696', title: '고용보험', case_number: '고관68460-696', decision_date: '2002-07-18', answer_summary: '요지' },
  ]), [0]);
  expect(r.ctx).not.toContain('2000-01-01');
  expect(r.ctx).toContain('2002-07-18');
  expect(r.items?.[0].meta ?? '').not.toContain('2000-01-01');
  expect(r.items?.[1].meta ?? '').toContain('2002-07-18');
});
