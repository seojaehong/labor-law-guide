import { describe, expect, it } from 'vitest';
import { REMEDY_FLOW, FLOW_CHECKED } from '@/content/procedure-flows';

// 절차 흐름의 숫자는 법제처 현행 원문 대조(2026-10-21):
//   근로기준법 제28조제2항  구제신청 3개월
//   제31조제1항             재심 10일
//   제31조제2항             행정소송 15일
//   제31조제3항             기한을 넘기면 확정
//   제32조                  재심·소 제기로 구제명령 효력이 멈추지 않는다
describe('부당해고 구제신청 흐름', () => {
  const byId = Object.fromEntries(REMEDY_FLOW.steps.map(s => [s.id, s]));

  it('기한 셋이 원문과 같다', () => {
    expect(byId.file.deadline).toBe('3개월 이내');
    expect(byId.review.deadline).toBe('10일 이내');
    expect(byId.court.deadline).toBe('15일 이내');
  });

  it('기한이 있는 단계는 근거 조문과 「안 하면」을 함께 적는다', () => {
    for (const s of REMEDY_FLOW.steps.filter(s => s.deadline)) {
      expect(s.basis, `${s.title} 근거`).toMatch(/근로기준법 제\d+조/);
      expect(s.branch?.detail, `${s.title} 결과`).toBeTruthy();
    }
  });

  it('순서가 사건 → 신청 → 초심 → 재심 → 재심판정 → 소송이다', () => {
    expect(REMEDY_FLOW.steps.map(s => s.id)).toEqual(['fire', 'file', 'first', 'review', 'second', 'court']);
  });

  it('효력 정지와 확정을 둘 다 말한다 — 하나만 적으면 오해한다', () => {
    const notes = REMEDY_FLOW.notes.join(' ');
    expect(notes).toMatch(/효력은 멈추지 않/);
    expect(notes).toMatch(/확정/);
    expect(notes).toMatch(/제32조/);
  });

  it('확인일을 적어 둔다 — 조문이 바뀌면 같이 바꾼다', () => {
    expect(FLOW_CHECKED).toMatch(/^\d{4}\.\d{2}\.\d{2}\.$/);
  });

  it('확률·가능성 같은 말을 쓰지 않는다', () => {
    const all = JSON.stringify(REMEDY_FLOW);
    expect(all).not.toMatch(/확률|적중률|승소 가능성|%/);
  });
});
