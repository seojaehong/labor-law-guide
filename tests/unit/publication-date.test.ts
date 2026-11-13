import { describe, expect, it } from 'vitest';
import { formatPublicationDate } from '@/lib/publication-date';

describe('Korean publication date', () => {
  it('converts the UTC evening into the next Korean day', () => {
    expect(formatPublicationDate('2026-11-11T23:00:00+00:00')).toBe('2026.11.12');
    expect(formatPublicationDate('2026-11-11T15:00:00Z', 'long')).toBe('2026년 11월 12일');
    expect(formatPublicationDate('2026-11-11T14:59:59Z')).toBe('2026.11.11');
  });
  it('preserves a Korean offset and handles year boundaries', () => {
    expect(formatPublicationDate('2026-11-12T08:00:00+09:00')).toBe('2026.11.12');
    expect(formatPublicationDate('2026-12-31T23:00:00Z')).toBe('2027.01.01');
  });
  it('does not reinterpret unzoned legacy dates using machine time', () => {
    expect(formatPublicationDate('2026-11-12')).toBe('2026.11.12');
    expect(formatPublicationDate('2026-11-12T23:00:00')).toBe('2026.11.12');
    expect(formatPublicationDate('')).toBe('');
    expect(formatPublicationDate('not-a-date')).toBe('not-a-date');
  });
});
