import { describe, expect, test } from 'vitest';
import { calculateEntitlement } from '@/lib/leave/annual-leave';
import { buildHireDateLedger } from '@/lib/leave/leave-ledger';
import { applyAttendanceRatio } from '@/lib/leave/leave-advanced';
import { buildPromotionSchedule } from '@/lib/leave/leave-promotion';

describe('official legal examples within original supported inputs', () => {
  test('last employment date is inclusive; accrual requires next-day employment', () => {
    expect(buildHireDateLedger('2026-01-01', '2026-12-31', { includeFirstYearMonthly:true }).total).toBe(11);
    expect(buildHireDateLedger('2026-01-01', '2027-01-01', { includeFirstYearMonthly:true }).total).toBe(26);
    expect(calculateEntitlement({hireDate:'2026-01-01',asOf:'2027-01-01'}).days).toBe(15);
    expect(calculateEntitlement({hireDate:'2023-10-05',asOf:'2026-10-05'}).days).toBe(16);
  });
  test('below 80% remains unresolved rather than zero entitlement', () => {
    const input={hireDate:'2023-01-01',asOf:'2026-01-01'};
    expect(applyAttendanceRatio({...input,attendanceRatio:0.8}).days).toBe(16);
    expect(applyAttendanceRatio({...input,attendanceRatio:0.7999}).days).toBeNull();
  });
  test.each([['2026-07-10','2026-10-31','match'],['2026-07-11','2026-10-31','diff'],['2026-07-10','2026-11-01','diff']])('annual windows %s / %s', (first,second,status) => {
    const r=buildPromotionSchedule({usagePeriodEnd:'2026-12-31',kind:'annual-15plus',firstNoticeSentOn:first,firstNoticeReceivedOn:'2026-07-10',workerRepliedOn:'2026-07-20',secondNoticeSentOn:second});
    expect(r.overall).toBe(status);
    expect(r.windows[1].to).toBe('2026-07-20');
  });
  test('first-year batches stay separate and cannot declare completion', () => {
    const r=buildPromotionSchedule({usagePeriodEnd:'2026-12-31',kind:'monthly-under-1year',firstNoticeSentOn:'2026-12-03'});
    expect(r.windows.map(w=>[w.from,w.to])).toEqual([['2026-10-01','2026-10-10'],[null,'2026-11-30'],['2026-12-01','2026-12-05'],[null,'2026-12-21']]);
    expect(r.windows[2].status).toBe('match');
    expect(r.overall).toBe('diff');
    expect(r.disclaimer).toContain('적법성은 확인하지 않았습니다');
  });
});
