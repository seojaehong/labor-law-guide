import { describe, expect, it } from 'vitest';
import { readPrefill, nhisLossHref } from '@/lib/nhis-forms/prefill';

// /exit-employer → /tools/nhis-report-form 연결(퇴사 한 번에, 조각 0).
// 주소창에는 날짜·종류만 싣는다 — 이름·주민번호는 절대 싣지 않는다.
describe('신고서 도구 주소 값 읽기', () => {
  it('상실 + 마지막 근무일을 읽는다', () => {
    expect(readPrefill('?kind=loss&last=2026-10-31')).toEqual({ kind: 'loss', last: '2026-10-31' });
  });
  it('날짜가 틀리면 날짜는 버리고 종류만 남긴다', () => {
    expect(readPrefill('?kind=loss&last=2026-02-30')).toEqual({ kind: 'loss' });
    expect(readPrefill('?kind=loss&last=abc')).toEqual({ kind: 'loss' });
  });
  it('모르는 종류는 무시한다', () => {
    expect(readPrefill('?kind=xyz&last=2026-10-31')).toEqual({});
  });
  it('값이 없으면 빈 객체', () => {
    expect(readPrefill('')).toEqual({});
  });
  it('개인정보 칸은 주소에서 읽지 않는다', () => {
    expect(readPrefill('?kind=loss&last=2026-10-31&name=홍길동&rrn=9001011234567')).toEqual({ kind: 'loss', last: '2026-10-31' });
  });
});

describe('퇴사 체크리스트에서 신고서로 가는 주소', () => {
  it('마지막 근무일이 있으면 싣는다', () => {
    expect(nhisLossHref('2026-10-31')).toBe('/tools/nhis-report-form?kind=loss&last=2026-10-31');
  });
  it('마지막 근무일이 없거나 틀리면 종류만', () => {
    expect(nhisLossHref('')).toBe('/tools/nhis-report-form?kind=loss');
    expect(nhisLossHref('2026-13-01')).toBe('/tools/nhis-report-form?kind=loss');
  });
  it('주고받은 값이 그대로 돌아온다', () => {
    const href = nhisLossHref('2026-12-31');
    expect(readPrefill(href.slice(href.indexOf('?')))).toEqual({ kind: 'loss', last: '2026-12-31' });
  });
});
