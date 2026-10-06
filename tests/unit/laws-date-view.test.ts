import { describe, expect, it } from 'vitest';
import { validLawDate, validLawMonth, moveLawMonth, lawDateResults } from '@/lib/laws/date-view';
import { todayKST } from '@/lib/laws/format';
describe('law date navigation', () => {
  it('validates leap days and malformed query parameters', () => {
    expect(validLawDate('20240229')).toBe(true);
    for (const d of ['20230229','20260431','20261301','x','20260100']) expect(validLawDate(d)).toBe(false);
    for (const m of ['202600','202613','abc','20261']) expect(validLawMonth(m)).toBe(false);
  });
  it('moves across year boundaries without month-end overflow', () => {
    expect(moveLawMonth('202612', 1)).toBe('202701');
    expect(moveLawMonth('202601', -1)).toBe('202512');
    expect(moveLawMonth('202401', 1)).toBe('202402');
  });
  it('uses KST at the UTC date boundary', () => {
    expect(todayKST(new Date('2026-10-06T14:59:59Z'))).toBe('20261006');
    expect(todayKST(new Date('2026-10-06T15:00:00Z'))).toBe('20261007');
  });
});

it('keeps month and day results on effective dates, in chronological order', () => {
  const events = [
    { id: 'later', date: '20261031', promulgations: [{date: '20260901'}] },
    { id: 'earlier', date: '20261001', promulgations: [{date: '20260901'}] },
    { id: 'next', date: '20261101', promulgations: [{date: '20261001'}] },
  ];
  expect(lawDateResults(events, '202610', null, true).map(e => e.id)).toEqual(['earlier','later']);
  expect(lawDateResults(events, '202610', '20261001', true).map(e => e.id)).toEqual(['earlier']);
  expect(lawDateResults(events, '202611', null, true).map(e => e.id)).toEqual(['next']);
  expect(lawDateResults(events, '202612', null, true)).toEqual([]);
  expect(events[0].id).toBe('later');
});
