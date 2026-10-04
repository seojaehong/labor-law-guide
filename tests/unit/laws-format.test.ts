import { describe, expect, it } from 'vitest';
import {
  addDays, citation, compareTable, daysUntil, ddayLabel, fmtDate, icsCalendar, lawCalItems, prepCalItems, todayKST, toICS, weekday,
  type LawEvent,
} from '@/lib/laws/format';

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
      id: '001872-20261008', lawId: '001872', law: '근로기준법', short: '근로기준법', group: '001872', level: '법률', lawKind: '법률', scope: null, date: '20261008',
      promulgations: [{ date: '20260407', no: '21533', kind: '일부개정', mst: '285279' }], kinds: ['일부개정'],
      cause: null, headline: '벌칙 상향', summary: '요약, 쉼표', counts: { 신설: 0, 개정: 3, 삭제: 0 },
      changes: [], rules: [],
    } satisfies LawEvent;
    const ics = toICS([ev]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261008');
    expect(ics).toContain('DTEND;VALUE=DATE:20261009');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('SUMMARY:[시행] 근로기준법: 벌칙 상향');
    expect(ics).toContain('국가법령정보센터');
  });
});

const EV = {
  id: '000130-20261127', lawId: '000130', law: '남녀고용평등법', short: '남녀고용평등법', group: '000130', level: '법률', lawKind: '법률',
  scope: null, date: '20261127',
  promulgations: [{ date: '20260526', no: '21700', kind: '일부개정', mst: '286255' }], kinds: ['일부개정'],
  cause: null, headline: '난임치료휴가 유급 4일', summary: '', counts: { 신설: 0, 개정: 1, 삭제: 0 },
  changes: [{ key: 'k', article: '제18조의3', title: '난임치료휴가', kind: '개정', rule: null }], rules: [],
} satisfies LawEvent;

describe('개정 캘린더', () => {
  it('공포일을 넣으면 시행 일정과 공포 일정이 따로 생기고, 공포 일정은 알림이 없다', () => {
    const items = lawCalItems([EV], { promulgation: true, origin: 'https://x.kr' });
    expect(items.map((i) => i.date)).toEqual(['20261127', '20260526']);
    expect(items[0]).toMatchObject({ alarmDays: 1, url: 'https://x.kr/laws#000130-20261127' });
    expect(items[1].summary).toContain('[공포]');
    expect(items[1].alarmDays).toBeUndefined();
  });

  it('같은 공포가 두 시행일에 걸쳐도 공포 일정은 한 번', () => {
    const items = lawCalItems([EV, { ...EV, id: '000130-20270101', date: '20270101' }], { promulgation: true });
    expect(items.filter((i) => i.summary.startsWith('[공포]'))).toHaveLength(1);
  });

  it('구독 캘린더 이름과 새로고침 주기', () => {
    const ics = icsCalendar(lawCalItems([EV]), '노동법 개정 일정');
    expect(ics).toContain('X-WR-CALNAME:노동법 개정 일정');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
  });
});

describe('취업규칙 대응 일정', () => {
  const base = { key: 'a', topic: '난임치료휴가', law: '남녀고용평등법', article: '제18조의3', required: true };

  it('시행 예정이면 시행일에서 30·14·7일 거꾸로 세운다', () => {
    const items = prepCalItems([{ ...base, effective: '20261127' }], '20261004');
    expect(items.map((i) => i.date)).toEqual(['20261028', '20261113', '20261120', '20261127']);
    expect(items[1].summary).toContain('의견 청취');
    expect(items[1].description).toContain('제94조');
  });

  it('준비 기간이 이미 지났으면 오늘로 당긴다', () => {
    const items = prepCalItems([{ ...base, effective: '20261020' }], '20261004');
    expect(items[0].date).toBe('20261004');
  });

  it('이미 시행 중이면 오늘부터 앞으로 잡는다', () => {
    const items = prepCalItems([{ ...base, effective: '20260918' }], '20261004');
    expect(items.map((i) => i.date)).toEqual(['20261004', addDays('20261004', 7), addDays('20261004', 14)]);
    expect(items[0].summary).toContain('이미 시행 중');
  });
});
