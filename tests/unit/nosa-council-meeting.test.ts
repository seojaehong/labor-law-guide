import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import {
  addMonths, addYears, ARTICLE_KEYS, articleOf, ARTICLES, COUNCIL_RESOLUTIONS, COUNCIL_TOPICS, meetingCheck, meetingErrors, REPORT_ITEMS, REPORT_KEYS, type MeetingCheckInput,
} from '@/lib/nosa-council/meeting';

// 노사협의회 회의 확인 — 설계 = 노사협의회신고 스킬 references/practice-docs-spec-261110.md 「check_council_meeting」.
// 회의 정족수·소집 기한은 assess.ts(quorumMeeting·deadline)를 그대로 쓴다. 3개월 간격은 manual-crosscheck B11(노사관계법제과-1591)을 따른다.

const NOSA_WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const TODAY = '2026-11-10';
const M: MeetingCheckInput = { kind: '정기', meetingDate: '2026-12-03', workerSeats: 5, employerSeats: 5 };

describe('날짜 더하기 — 달·해', () => {
  it('달 끝은 그 달 마지막 날로', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 3)).toBe('2026-11-30');
    expect(addMonths('2026-12-31', 6)).toBe('2027-06-30');
  });
  it('2월 29일 + 해 → 2월 28일', () => {
    expect(addYears('2028-02-29', 3)).toBe('2031-02-28');
    expect(addYears('2026-11-10', 3)).toBe('2029-11-10');
  });
});

describe('소집 통보 기한 = 개최일 − 8일(통보일 불산입, 개최일 전 7일)', () => {
  it('양쪽 경계', () => {
    const on = meetingCheck({ ...M, noticeDate: '2026-11-25' }, TODAY);
    expect(on.convene).toMatchObject({ due: '2026-11-25', onTime: true });
    const late = meetingCheck({ ...M, noticeDate: '2026-11-26' }, TODAY);
    expect(late.convene).toMatchObject({ due: '2026-11-25', onTime: false });
    expect(late.warnings.join()).toMatch(/2026-11-25/);
  });
  it('달·해 경계', () => {
    expect(meetingCheck({ ...M, meetingDate: '2027-01-05' }, TODAY).convene.due).toBe('2026-12-28');
    expect(meetingCheck({ ...M, meetingDate: '2027-03-01' }, TODAY).convene.due).toBe('2027-02-21');
  });
  it('통보일을 안 주면 오늘 기준으로 남은 날', () => {
    const r = meetingCheck(M, TODAY);
    expect(r.convene.onTime).toBeNull();
    expect(r.convene.daysLeft).toBe(15);
  });
});

describe('정기회의 3개월 — 3개월 기간마다 1회 이상(노사관계법제과-1591), 막지 않고 알린다', () => {
  it('직전 정기회의 + 3개월 안', () => {
    expect(meetingCheck({ ...M, previousRegularDate: '2026-09-03' }, TODAY).interval?.status).toBe('3개월 이내');
    expect(meetingCheck({ ...M, meetingDate: '2026-11-30', previousRegularDate: '2026-08-31' }, TODAY).interval?.status).toBe('3개월 이내');
  });
  it('3개월이 넘고 6개월 안이면 「확인 필요」 — 규정상 기간마다 열렸는지', () => {
    const r = meetingCheck({ ...M, meetingDate: '2026-12-01', previousRegularDate: '2026-08-31' }, TODAY);
    expect(r.interval?.status).toBe('확인 필요');
    expect(r.interval?.explanation).toMatch(/3개월 기간마다 1회 이상/);
    expect(r.interval?.basis).toMatch(/노사관계법제과-1591/);
  });
  it('6개월이 넘으면 빈 3개월 기간이 생긴다', () => {
    const r = meetingCheck({ ...M, previousRegularDate: '2026-05-01' }, TODAY);
    expect(r.interval?.status).toBe('빈 기간 있음');
    expect(r.interval?.explanation).toMatch(/사용자 책임이 없는 사유/);
  });
  it('임시회의·직전 회의일 없음 → 보지 않는다', () => {
    expect(meetingCheck({ ...M, kind: '임시', previousRegularDate: '2026-01-01' }, TODAY).interval).toBeNull();
    expect(meetingCheck(M, TODAY).interval).toBeNull();
  });
});

describe('개최 정족수 — 정원 기준 각 과반', () => {
  it('정원 10 현원 7 출석 4 → 불성립(현원 기준이면 성립하지만 정원 기준)', () => {
    const r = meetingCheck({ ...M, workerSeats: 10, employerSeats: 10, workerCurrent: 7, workerPresent: 4, employerPresent: 6 }, TODAY);
    expect(r.quorum?.held).toBe(false);
    expect(r.quorum?.text).toBe('근로자위원 10명 중 4명, 사용자위원 10명 중 6명 출석 — 근로자위원 과반수(6명)에 미달하여 회의가 성립하지 않음');
    expect(r.quorum?.currentNote).toMatch(/현원\(7명\)/);
  });
  it('각 과반 출석이면 개회 — 설계서 문장 그대로', () => {
    const r = meetingCheck({ ...M, workerPresent: 4, employerPresent: 5 }, TODAY);
    expect(r.quorum?.held).toBe(true);
    expect(r.quorum?.text).toBe('근로자위원 5명 중 4명, 사용자위원 5명 중 5명 출석 — 각 과반수 출석으로 개회');
  });
  it('출석을 안 주면 보지 않는다', () => {
    expect(meetingCheck(M, TODAY).quorum).toBeNull();
  });
});

describe('안건별 의결 — 출석위원 3분의 2 이상(올림)', () => {
  const held = { ...M, workerPresent: 4, employerPresent: 5 };
  it('출석 9 찬성 6 → 의결 / 찬성 5 → 의결되지 않음', () => {
    const r = meetingCheck({ ...held, agenda: [{ type: '의결', inFavor: 6 }, { type: '의결', inFavor: 5 }] }, TODAY);
    expect(r.agenda[0]).toMatchObject({ no: 1, result: '의결' });
    expect(r.agenda[0].vote?.text).toBe('출석위원 9명 중 6명 찬성 — 3분의 2 이상으로 의결');
    expect(r.agenda[1]).toMatchObject({ no: 2, result: '의결되지 않음' });
    expect(r.agenda[1].vote?.text).toBe('출석위원 9명 중 5명 찬성 — 3분의 2(6명)에 미달하여 의결되지 않음');
  });
  it('출석 7 → 필요 5(14/3 올림)', () => {
    const r = meetingCheck({ ...M, workerPresent: 3, employerPresent: 4, agenda: [{ type: '의결', inFavor: 5 }, { type: '의결', inFavor: 4 }] }, TODAY);
    expect(r.agenda.map((a) => a.result)).toEqual(['의결', '의결되지 않음']);
  });
  it('회의가 성립하지 않으면 찬성이 많아도 의결되지 않음', () => {
    const r = meetingCheck({ ...M, workerPresent: 2, employerPresent: 5, agenda: [{ type: '의결', inFavor: 7 }] }, TODAY);
    expect(r.agenda[0].result).toBe('의결되지 않음');
    expect(r.agenda[0].vote?.text).toMatch(/회의가 성립하지 않아 의결되지 않음/);
  });
  it('보고·협의는 표결 없이, 협의도 찬성 수를 주면 의결로 본다(법 제20조제2항)', () => {
    const r = meetingCheck({ ...held, agenda: [{ type: '보고' }, { type: '협의' }, { type: '협의', inFavor: 9 }, { type: '의결' }] }, TODAY);
    expect(r.agenda.map((a) => a.result)).toEqual(['보고', '협의', '의결', '찬성 수 미입력']);
  });
  it('법 제21조 의결사항이 의결되지 않으면 임의중재(법 제25조) 안내', () => {
    const r = meetingCheck({ ...held, agenda: [{ type: '의결', resolutionItem: true, inFavor: 5 }] }, TODAY);
    expect(r.agenda[0].arbitration).toMatch(/법 제25조제1항/);
    expect(r.warnings.join()).toMatch(/임의 중재|중재/);
  });
  it('법 제21조 의결사항을 [의결] 이 아닌 안건으로 올리면 알린다', () => {
    expect(meetingCheck({ ...held, agenda: [{ type: '협의', resolutionItem: true }] }, TODAY).warnings.join()).toMatch(/의결을 거쳐야/);
  });
});

describe('정기회의 보고사항(법 제22조제1항) 4개', () => {
  it('상수 — 법문 그대로', () => {
    expect(REPORT_ITEMS).toEqual(['경영계획 전반 및 실적에 관한 사항', '분기별 생산계획과 실적에 관한 사항', '인력계획에 관한 사항', '기업의 경제적·재정적 상황']);
    expect(REPORT_KEYS).toHaveLength(4);
  });
  it('정기회의인데 빠진 것을 알린다', () => {
    const r = meetingCheck({ ...M, reportsCovered: ['경영계획', '인력계획'] }, TODAY);
    expect(r.reports.missing).toEqual(['분기별 생산계획과 실적에 관한 사항', '기업의 경제적·재정적 상황']);
    expect(r.warnings.join()).toMatch(/분기별 생산계획과 실적/);
    expect(meetingCheck({ ...M, reportsCovered: [...REPORT_KEYS] }, TODAY).reports.missing).toEqual([]);
  });
  it('임시회의는 보지 않는다', () => {
    expect(meetingCheck({ ...M, kind: '임시' }, TODAY).reports).toMatchObject({ required: false, missing: [] });
  });
});

describe('의결사항 공지 기한 — 협의회규정 기준(견본 제29조 10일)', () => {
  const held = { ...M, workerPresent: 4, employerPresent: 5 };
  it('의결된 안건이 있으면 의결일 + 10일, 규정 값을 주면 그 값', () => {
    expect(meetingCheck({ ...held, agenda: [{ type: '의결', inFavor: 9 }] }, TODAY).resolutionNotice).toMatchObject({ due: '2026-12-13', days: 10 });
    expect(meetingCheck({ ...held, noticeDays: 7, agenda: [{ type: '의결', inFavor: 9 }] }, TODAY).resolutionNotice?.due).toBe('2026-12-10');
    expect(meetingCheck({ ...held, agenda: [{ type: '의결', inFavor: 9 }] }, TODAY).resolutionNotice?.basis).toMatch(/협의회규정/);
  });
  it('의결된 안건이 없으면 없음', () => {
    expect(meetingCheck({ ...held, agenda: [{ type: '의결', inFavor: 1 }] }, TODAY).resolutionNotice).toBeNull();
  });
});

describe('맞지 않는 입력', () => {
  it('출석 > 정원, 찬성 > 출석, 날짜, 통보일이 개최일 뒤, 출석 없이 찬성', () => {
    expect(meetingErrors({ ...M, workerPresent: 6, employerPresent: 5 }).join()).toMatch(/정원/);
    expect(meetingErrors({ ...M, workerPresent: 4, employerPresent: 5, agenda: [{ type: '의결', inFavor: 10 }] }).join()).toMatch(/출석/);
    expect(meetingErrors({ ...M, meetingDate: '2026-02-30' }).join()).toMatch(/meetingDate/);
    expect(meetingErrors({ ...M, noticeDate: '2026-12-04' }).join()).toMatch(/통보일/);
    expect(meetingErrors({ ...M, agenda: [{ type: '의결', inFavor: 3 }] }).join()).toMatch(/출석/);
    expect(meetingErrors({ ...M, workerPresent: 4 }).join()).toMatch(/함께/);
    expect(meetingErrors({ ...M, workerPresent: 4, employerPresent: 5 })).toEqual([]);
  });
});

describe('법조문 분류(안건 구분 선택지) — 근참법 §20①1~17 · §21 1~5 · §22①1~4', () => {
  const held = { ...M, workerPresent: 4, employerPresent: 5 };
  it('26개, 글자는 협의회규정 견본 제26~28조와 한 벌', () => {
    expect(ARTICLES).toHaveLength(26);
    expect(ARTICLE_KEYS.slice(0, 2)).toEqual(['20-1', '20-2']);
    expect(articleOf('20-16')).toMatchObject({ law: '제20조제1항제16호', text: '직장 내 성희롱 및 고객 등에 의한 성희롱 예방에 관한 사항' });
    expect(articleOf('20-12')?.text).toBe('직무 발명 등과 관련하여 해당 근로자에 대한 보상에 관한 사항');
    expect(articleOf('21-3')).toMatchObject({ law: '제21조제3호', text: '사내근로복지기금의 설치' });
    expect(articleOf('22-4')).toMatchObject({ law: '제22조제1항제4호', text: '기업의 경제적·재정적 상황' });
    expect(COUNCIL_TOPICS).toHaveLength(17);
    expect(COUNCIL_RESOLUTIONS).toHaveLength(5);
  });
  it('§21 로 분류한 안건은 의결사항 — 의결되지 않으면 임의중재 안내', () => {
    const r = meetingCheck({ ...held, agenda: [{ type: '의결', article: '21-2', inFavor: 5 }] }, TODAY);
    expect(r.agenda[0]).toMatchObject({ resolutionItem: true, article: '21-2', result: '의결되지 않음' });
    expect(r.agenda[0].arbitration).toMatch(/법 제25조제1항제1호/);
  });
  it('§22 로 분류한 보고 안건은 보고사항을 다룬 것으로 센다', () => {
    const r = meetingCheck({ ...M, agenda: [{ type: '보고', article: '22-1' }, { type: '보고', article: '22-3' }], reportsCovered: ['재정상황'] }, TODAY);
    expect(r.reports.missing).toEqual(['분기별 생산계획과 실적에 관한 사항']);
  });
});

describe('금지어', () => {
  it('결과 글자 전부', () => {
    const inputs: MeetingCheckInput[] = [
      { ...M, noticeDate: '2026-11-30', previousRegularDate: '2026-04-01', workerSeats: 10, employerSeats: 10, workerCurrent: 7, workerPresent: 4, employerPresent: 6, agenda: [{ type: '의결', resolutionItem: true, inFavor: 9 }, { type: '협의', resolutionItem: true }], reportsCovered: [] },
      { ...M, previousRegularDate: '2026-08-31', meetingDate: '2026-12-01', workerPresent: 4, employerPresent: 5, agenda: [{ type: '의결', inFavor: 9 }, { type: '보고' }] },
    ];
    for (const i of inputs) expect(bannedHits(JSON.stringify(meetingCheck(i, TODAY)), NOSA_WORDS)).toEqual([]);
  });
});
