import { describe, expect, it } from 'vitest';
import { summarizeUsage, type UsageRecord, type UsageUnitPolicy } from '@/lib/leave/leave-usage';
import { parseUsage } from '@/lib/leave/leave-usage-parse';

// P3 #6(261124 검수) — 시간 단위 연차를 기록마다 일로 바꿔 반올림하면 1시간 × 8회가 1.04일이 된다. 입력은 합성 값이다.
describe('#6 시간 단위 연차 — 시간을 모두 더한 뒤 한 번만 일로 바꾼다', () => {
  const policy = (hoursPerDay: number): UsageUnitPolicy => ({ hoursPerDay, allowHalf: true, allowQuarter: true, allowHourly: true });
  const hourly = (n: number, hours = 1): UsageRecord[] => Array.from({ length: n }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, kind: 'hourly', hours }));

  it('1일 8시간 · 1시간 × 8회 = 1일', () => {
    const s = summarizeUsage(hourly(8), policy(8));
    expect(s.totalDays).toBe(1);
    expect(s.byKind.hourly.days).toBe(1);
  });
  it('1일 8시간 · 1시간 × 7회 = 0.88일(7 ÷ 8 = 0.875, 마지막에 한 번 반올림)', () => {
    expect(summarizeUsage(hourly(7), policy(8)).totalDays).toBe(0.88);
  });
  it('1일 6시간 · 1시간 × 6회 = 1일', () => {
    expect(summarizeUsage(hourly(6), policy(6)).totalDays).toBe(1);
  });
  it('종일 1 + 반차 1 + 1시간 × 8회(1일 8시간) = 2.5일', () => {
    const recs: UsageRecord[] = [{ date: '2026-04-01', kind: 'full' }, { date: '2026-04-02', kind: 'half' }, ...hourly(8)];
    expect(summarizeUsage(recs, policy(8)).totalDays).toBe(2.5);
  });
  it('음수 시간은 행 오류로 막고 사용일에 넣지 않는다', () => {
    const s = summarizeUsage([...hourly(2), { date: '2026-03-09', kind: 'hourly', hours: -2 }], policy(8));
    expect(s.totalDays).toBe(0.25);
    expect(s.issues.map((i) => [i.index, i.code])).toEqual([[2, 'hours-not-positive']]);
  });
  it('0시간도 행 오류', () => {
    const s = summarizeUsage([{ date: '2026-03-09', kind: 'hourly', hours: 0 }], policy(8));
    expect(s.issues.map((i) => i.code)).toEqual(['hours-not-positive']);
  });

  it('화면 파서 — 「-2」의 부호를 지우지 않는다(엔진이 오류로 막는다)', () => {
    const { records, bad } = parseUsage('2026-03-09\t시간차\t-2');
    expect(bad).toEqual([]);
    expect(records[0]!.hours).toBe(-2);
  });
  it('화면 파서 — 「2시간」은 2로 받는다', () => {
    expect(parseUsage('2026-03-09\t시간차\t2시간').records[0]!.hours).toBe(2);
  });
  it('화면 파서 — 숫자로 읽을 수 없는 시간은 잘못된 줄로 돌린다', () => {
    const { records, bad } = parseUsage('2026-03-09\t시간차\t두시간');
    expect(records).toEqual([]);
    expect(bad).toEqual(['2026-03-09\t시간차\t두시간']);
  });
});
