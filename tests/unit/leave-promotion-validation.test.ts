import { describe, expect, it } from 'vitest';
import { checkedPromotionSchedule } from '@/lib/leave/leave-promotion-validation';
import type { LeaveKind } from '@/lib/leave/leave-promotion';

describe('promotion input chronology', () => {
  for (const [kind, sent] of [['annual-15plus', '2026-07-01'], ['monthly-under-1year', '2026-10-01'], ['monthly-under-1year', '2026-12-01']] as [LeaveKind, string][]) {
    const base = { kind, usagePeriodEnd: '2026-12-31', firstNoticeSentOn: sent, firstNoticeReceivedOn: sent };
    it(`${kind} ${sent}: rejects reply before receipt`, () => {
      const result = checkedPromotionSchedule({ ...base, workerRepliedOn: '2026-06-01' });
      expect(result.overall).toBe('diff');
      expect(result.windows.find(window => window.label.includes('회신') || window.label.includes('통보 기한'))?.status).toBe('diff');
    });
    it(`${kind} ${sent}: rejects second notice before first step`, () => {
      const result = checkedPromotionSchedule({ ...base, secondNoticeSentOn: '2026-01-01' });
      expect(result.windows.filter(window => window.label.startsWith('2차') && window.actual).every(window => window.status === 'diff')).toBe(true);
      expect(result.overall).not.toBe('match');
    });
    it(`${kind} ${sent}: same-day second notice requires review`, () => {
      const result = checkedPromotionSchedule({ ...base, workerRepliedOn: sent, secondNoticeSentOn: sent });
      expect(result.windows.filter(window => window.label.startsWith('2차') && window.actual).every(window => window.status !== 'match')).toBe(true);
    });
    it(`${kind} ${sent}: plausible order remains date comparison, not legal certification`, () => {
      const second = sent === '2026-12-01' ? '2026-12-12' : sent === '2026-10-01' ? '2026-10-12' : '2026-07-12';
      const result = checkedPromotionSchedule({ ...base, secondNoticeSentOn: second });
      expect(result.windows.some(window => window.actual === sent && window.label.startsWith('1차') && window.status === 'match')).toBe(true);
      expect(result.windows.filter(window => window.label.startsWith('2차') && window.actual).every(window => window.status === 'unknown')).toBe(true);
      expect(result.disclaimer).toContain('적법성');
    });
  }
  it('does not accept receipt before sending', () => {
    expect(checkedPromotionSchedule({ kind: 'annual-15plus', usagePeriodEnd: '2026-12-31', firstNoticeSentOn: '2026-07-02', firstNoticeReceivedOn: '2026-07-01' }).overall).toBe('diff');
  });
  it('returns review rather than normalizing nonexistent dates', () => {
    expect(checkedPromotionSchedule({ kind: 'annual-15plus', usagePeriodEnd: '2026-02-31' }).overall).toBe('unknown');
  });
});
