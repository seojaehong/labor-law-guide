import { describe, expect, it } from 'vitest';
import { buildPromotionSchedule } from '@/lib/leave/leave-promotion';
import { checkedPromotionSchedule } from '@/lib/leave/leave-promotion-validation';

// 근로기준법 제61조 — 「기간이 끝나기 N개월 전」은 권리가 소멸하는 날(종료일 다음 날)에서 N개월을 거슬러 센다.
// 기준 사례(12-31 종료 → 1차 7-01~7-10, 2차 기한 10-31)와 같은 원리로, 종료월·대상월의 말일 길이가 달라도 하루도 밀리지 않아야 한다.
// 기대식: 시작 = (종료일 + 1일) − N개월, 기한 = 그 시작의 전날.

describe('사용촉진 1년 이상(§61①) — 말일 종료', () => {
  const cases: [string, string, string, string][] = [
    // 종료일, 1차 시작, 1차 끝, 2차 기한
    ['2026-12-31', '2026-07-01', '2026-07-10', '2026-10-31'],
    ['2027-02-28', '2026-09-01', '2026-09-10', '2026-12-31'],
    ['2027-04-30', '2026-11-01', '2026-11-10', '2027-02-28'],
    ['2027-06-30', '2027-01-01', '2027-01-10', '2027-04-30'],
    ['2027-09-30', '2027-04-01', '2027-04-10', '2027-07-31'],
    ['2027-11-30', '2027-06-01', '2027-06-10', '2027-09-30'],
    ['2028-02-29', '2027-09-01', '2027-09-10', '2027-12-31'],
    // 월 중간 종료 — 말일 축소가 없으므로 종전 값과 같아야 한다
    ['2027-08-15', '2027-02-16', '2027-02-25', '2027-06-15'],
  ];
  for (const [end, from, to, secondTo] of cases) {
    it(`종료 ${end} → 1차 ${from}~${to}, 2차 기한 ${secondTo}`, () => {
      const r = buildPromotionSchedule({ usagePeriodEnd: end, kind: 'annual-15plus' });
      expect(r.windows[0].from).toBe(from);
      expect(r.windows[0].to).toBe(to);
      expect(r.windows[2].to).toBe(secondTo);
    });
  }
});

describe('사용촉진 1년 미만(§61②) — 말일 종료', () => {
  const cases: [string, string, string, string, string, string, string][] = [
    // 종료일, 9일분 1차 시작·끝, 9일분 2차 기한, 2일분 1차 시작·끝, 2일분 2차 기한
    ['2026-12-31', '2026-10-01', '2026-10-10', '2026-11-30', '2026-12-01', '2026-12-05', '2026-12-21'],
    ['2027-02-28', '2026-12-01', '2026-12-10', '2027-01-31', '2027-02-01', '2027-02-05', '2027-02-18'],
    ['2027-04-30', '2027-02-01', '2027-02-10', '2027-03-31', '2027-04-01', '2027-04-05', '2027-04-20'],
    ['2027-06-30', '2027-04-01', '2027-04-10', '2027-05-31', '2027-06-01', '2027-06-05', '2027-06-20'],
  ];
  for (const [end, f1, t1, s1, f2, t2, s2] of cases) {
    it(`종료 ${end} → 9일분 ${f1}~${t1}/${s1}, 2일분 ${f2}~${t2}/${s2}`, () => {
      const r = buildPromotionSchedule({ usagePeriodEnd: end, kind: 'monthly-under-1year' });
      expect([r.windows[0].from, r.windows[0].to, r.windows[1].to]).toEqual([f1, t1, s1]);
      expect([r.windows[2].from, r.windows[2].to, r.windows[3].to]).toEqual([f2, t2, s2]);
    });
  }
});

// 소멸일(종료일 다음 날)이 29~31일인데 대상 월에 그날이 없으면 다음 달 1일로 둔다(앞당기지 않는다). 해석 확인 필요 — 종전 값과 같다.
describe('말일이 아닌 28~30일 종료 — 종전 값 유지', () => {
  it('1년 이상 종료 2027-08-30 → 1차 2027-03-01, 2차 기한 2027-06-30', () => {
    const r = buildPromotionSchedule({ usagePeriodEnd: '2027-08-30', kind: 'annual-15plus' });
    expect([r.windows[0].from, r.windows[2].to]).toEqual(['2027-03-01', '2027-06-30']);
  });
  it('1년 미만 종료 2027-03-30 → 9일분 2026-12-31, 2차 2027-02-28, 2일분 2027-03-01', () => {
    const r = buildPromotionSchedule({ usagePeriodEnd: '2027-03-30', kind: 'monthly-under-1year' });
    expect([r.windows[0].from, r.windows[1].to, r.windows[2].from]).toEqual(['2026-12-31', '2027-02-28', '2027-03-01']);
  });
  it('1년 미만 종료 2027-05-30 → 9일분 2027-03-01, 2차 2027-04-30, 2일분 2027-05-01', () => {
    const r = buildPromotionSchedule({ usagePeriodEnd: '2027-05-30', kind: 'monthly-under-1year' });
    expect([r.windows[0].from, r.windows[1].to, r.windows[2].from]).toEqual(['2027-03-01', '2027-04-30', '2027-05-01']);
  });
});

describe('화면 검증 함수 — 이른 촉구는 일치가 아니다', () => {
  const at = (sent: string) =>
    checkedPromotionSchedule({ kind: 'annual-15plus', usagePeriodEnd: '2026-06-30', firstNoticeSentOn: sent }).windows[0].status;
  it('종료 2026-06-30: 2025-12-31 발송 = 차이', () => expect(at('2025-12-31')).toBe('diff'));
  it('종료 2026-06-30: 2026-01-01 · 01-10 발송 = 일치', () => {
    expect(at('2026-01-01')).toBe('match');
    expect(at('2026-01-10')).toBe('match');
  });
  it('종료 2026-06-30: 2026-01-11 발송 = 차이', () => expect(at('2026-01-11')).toBe('diff'));
  it('종료 2026-02-28: 2025-08-31 발송 = 차이, 09-01 = 일치', () => {
    const s = (sent: string) =>
      checkedPromotionSchedule({ kind: 'annual-15plus', usagePeriodEnd: '2026-02-28', firstNoticeSentOn: sent }).windows[0].status;
    expect(s('2025-08-31')).toBe('diff');
    expect(s('2025-09-01')).toBe('match');
  });
  it('1년 미만 종료 2027-04-30: 2027-01-31 발송 = 차이, 02-01 = 일치', () => {
    const s = (sent: string) =>
      checkedPromotionSchedule({ kind: 'monthly-under-1year', usagePeriodEnd: '2027-04-30', firstNoticeSentOn: sent }).windows[0].status;
    expect(s('2027-01-31')).toBe('diff');
    expect(s('2027-02-01')).toBe('match');
  });
});
