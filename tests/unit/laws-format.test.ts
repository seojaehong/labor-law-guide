import { describe, expect, it } from 'vitest';
import { citation, compareTable, daysUntil, ddayLabel, fmtDate, todayKST, toICS, weekday, type LawEvent } from '@/lib/laws/format';

describe('날짜', () => {
  it('KST 자정 경계 — UTC 15:00 은 다음 날', () => {
    expect(todayKST(new Date('2026-10-04T14:59:00Z'))).toBe('20261004');
    expect(todayKST(new Date('2026-10-04T15:00:00Z'))).toBe('20261005');
  });
  it('D-day', () => {
    expect(daysUntil('20261008', '20261004')).toBe(4);
    expect(ddayLabel('20261008', '20261004')).toBe('D-4');
    expect(ddayLabel('20261004', '20261004')).toBe('오늘 시행');
    expect(ddayLabel('20261002', '20261004')).toBe('시행 2일째');
  });
  it('표기', () => {
    expect(fmtDate('20261008')).toBe('2026. 10. 8.');
    expect(weekday('20261008')).toBe('목');
  });
});

describe('출처', () => {
  it('법률 번호·공포일·시행일·원문 링크를 단다', () => {
    const c = citation('근로기준법', { date: '20260407', no: '21533', kind: '일부개정', mst: '285279' }, '20261008');
    expect(c).toContain('「근로기준법」 법률 제21533호(2026. 4. 7. 공포), 2026. 10. 8. 시행');
    expect(c).toContain('https://www.law.go.kr/lsInfoP.do?lsiSeq=285279&efYd=20261008');
  });
});

describe('신구대조 복사', () => {
  it('신설·삭제 칸과 출처를 넣고 html 을 이스케이프한다', () => {
    const t = compareTable(
      [
        { article: '제44조의4', before: null, after: '① <예치>' },
        { article: '제103조', before: '비밀', after: null },
      ],
      '출처',
    );
    expect(t.text).toContain('"<신설>"');
    expect(t.text).toContain('"<삭제>"');
    expect(t.text.endsWith('출처')).toBe(true);
    expect(t.html).toContain('① &lt;예치&gt;');
  });
});

describe('캘린더', () => {
  it('종일 일정과 하루 전 알림', () => {
    const ev = {
      id: '001872-20261008', lawId: '001872', law: '근로기준법', short: '근로기준법', scope: null, date: '20261008',
      promulgations: [{ date: '20260407', no: '21533', kind: '일부개정', mst: '285279' }], kinds: ['일부개정'],
      cause: null, headline: '벌칙 상향', summary: '요약, 쉼표', counts: { 신설: 0, 개정: 3, 삭제: 0 },
      changes: [], rules: [],
    } satisfies LawEvent;
    const ics = toICS([ev]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261008');
    expect(ics).toContain('DTEND;VALUE=DATE:20261009');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('요약\\, 쉼표');
  });
});
