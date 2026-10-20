import { describe, expect, it } from 'vitest';
import { companySizeEvidence } from '@/lib/company-size-evidence';
describe('company headcount scope', () => {
  it.each(['회사 직원2명이 폭행했습니다', '직원5명정도입니다', '직원은5명미만이 아니라10명입니다', '피해자가5명이상이고 회사직원은100명입니다', '징계 대상 5명 미만', '직원 5명 정도', '팀원 4명', '우리 회사 팀원 4명', '회사에서 징계 대상 직원 5명 미만', '피해 근로자 5명 이하', '5인 미만', '직원 10명'])('does not assign ambiguous or subgroup count: %s', text => {
    expect(companySizeEvidence(text)).toEqual({});
  });
  it('preserves approximation for explicitly scoped employer employees', () => {
    const result = companySizeEvidence('우리 회사 직원 5명 정도입니다');
    expect(result.company_size).toBeUndefined();
    expect(result.company_size_evidence).toMatchObject({ operator:'approx', value:5, original:'우리 회사 직원 5명 정도입니다', kind:'employees', scope:'employer' });
  });
  it('preserves explicit regular-worker headcount', () => {
    expect(companySizeEvidence('우리 사업장 상시근로자 10명입니다')).toMatchObject({company_size:10, company_size_evidence:{operator:'eq',kind:'regular_workers',scope:'employer'}});
  });
  it('does not equate total employee count with regular-worker count', () => {
    const result = companySizeEvidence('우리 회사 전체 직원 10명입니다');
    expect(result.company_size).toBeUndefined();
    expect(result.company_size_evidence?.kind).toBe('employees');
  });
  it.each(['회사 상시근로자 약 5명', '회사 상시근로자 5명 내외', '회사 상시근로자 대략 5명'])('preserves approximate count %s', text => {
    expect(companySizeEvidence(text)).toMatchObject({company_size_evidence:{operator:'approx',original:text}});
    expect(companySizeEvidence(text).company_size).toBeUndefined();
  });
  it.each(['회사 상시근로자 5~10명', '회사 상시근로자 5인 미만', '5인 미만 사업장'])('preserves employer bounds %s', text => {
    expect(companySizeEvidence(text).company_size).toBeUndefined();
    expect(companySizeEvidence(text).company_size_evidence?.original).toBe(text);
  });
});
