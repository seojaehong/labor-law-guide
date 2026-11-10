import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { minutesRecord, type MeetingDocsInput } from '@/lib/nosa-council/meeting-docs';
import { retentionEnd } from '@/lib/nosa-council/meeting';
import {
  appendRecord, councilDashboard, councilGraph, councilLedger, councilVault, implHistory, implLabel, previousResolutionsFor, wikilinks,
  type DocEvent, type ImplRecord, type MinutesLike,
} from '@/lib/nosa-council/records';

// 회의록 보관함 — 이행 이력(덧붙이기만) · 회의록 이력(판·해시) · 회의록 대장 · 그래프 · 대시보드.
// 설계 = minutes-graph-spec-261110.md. 선은 구조화 값(안건 ID·결과·법조문·제안 측·이행 기록)에서만 나온다. 사업장·사람은 합성 값.

const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const base = (over: Partial<MeetingDocsInput>): MeetingDocsInput => ({
  workplace: { name: '가상제조' },
  meeting: { kind: '정기', number: 1, date: '2026-03-05' },
  seats: { worker: 5, employer: 5 },
  attendance: { worker: 5, employer: 5 },
  agenda: [],
  writtenDate: '2026-03-06',
  ...over,
});
const M1 = minutesRecord(base({
  meeting: { kind: '정기', number: 1, date: '2026-03-05' },
  agenda: [
    { id: 'A-20260305-01', title: '안전화 지급 기준', type: '의결', article: '21-3', proposer: '근로자위원', inFavor: 9, decision: '전 직원 연 1회 지급', implementation: { action: '지급', owner: '총무팀장', due: '2026-04-30' } },
    { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', proposer: '근로자위원', discussion: [{ side: '근로자위원', summary: '지난번 [[A-20260305-01]] 처럼 #긴급 으로 다루자' }] },
    { id: 'A-20260305-03', title: '1분기 경영실적', type: '보고', article: '22-1' },
  ],
  reports: { 경영계획: '목표 대비 96%' },
}));
const M2 = minutesRecord(base({
  meeting: { kind: '정기', number: 2, date: '2026-06-04' },
  writtenDate: '2026-06-05',
  agenda: [
    { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', proposer: '근로자위원', carriedOver: true },
    { id: 'A-20260604-02', title: '야간작업 순환 방식', type: '협의', article: '20-7', proposer: '사용자위원' },
  ],
  previousResolutions: [{ agendaId: 'A-20260305-01', title: '안전화 지급 기준', status: '완료', evidence: '지급 대장(2026. 4. 20.)' }],
}));
const M3 = minutesRecord(base({
  meeting: { kind: '정기', number: 3, date: '2026-12-03' },
  writtenDate: '2026-12-04',
  agenda: [
    { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', carriedOver: true },
    { id: 'A-20261203-02', title: '교육훈련 기본계획', type: '의결', article: '21-1', proposer: '사용자위원', inFavor: 8, implementation: { action: '교육 일정 공지', due: '2027-01-15' } },
  ],
}));
const M4 = minutesRecord(base({
  meeting: { kind: '임시', number: 1, date: '2027-01-20' },
  writtenDate: '2027-01-21',
  agenda: [{ id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', carriedOver: true }],
}));
const ALL: MinutesLike[] = [M1, M2, M3];

describe('이행 이력 — 덧붙이기만', () => {
  it('정정은 새 기록이고 앞 기록은 남는다 · 현재 상태 = 마지막 기록', () => {
    let rs: ImplRecord[] = [];
    rs = appendRecord(rs, { date: '2027-01-05', agendaId: 'A-20261203-02', status: '진행', owner: '인사팀장', content: '일정안 작성' });
    const first = rs[0];
    rs = appendRecord(rs, { date: '2027-01-06', agendaId: 'A-20261203-02', status: '보류', content: '정정 — 진행이 아니라 보류', corrects: 1 });
    expect(rs).toHaveLength(2);
    expect(rs[0]).toEqual(first);
    expect(rs.map((r) => r.seq)).toEqual([1, 2]);
    const h = implHistory(ALL, rs)['A-20261203-02'];
    expect(h.map((e) => e.status)).toEqual(['진행', '보류']);
    expect(h.at(-1)!.corrects).toBe(1);
  });
  it('근거 없는 완료는 「완료(근거 없음)」', () => {
    expect(implLabel({ status: '완료' })).toBe('완료(근거 없음)');
    expect(implLabel({ status: '완료', evidence: '공지문 2027-01-10' })).toBe('완료');
    expect(implLabel({ status: '진행' })).toBe('진행');
  });
  it('회의록의 「전분기 이행 상황」도 이력이다(그 회의가 확인한 기록)', () => {
    const h = implHistory(ALL, [])['A-20260305-01'];
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ status: '완료', confirmedAt: '2026-정기-2차', date: '2026-06-04' });
  });
  it('다음 회의록의 전분기 이행 상황을 이력에서 채운다 — 직전 회의 전에 끝난 것은 빼고, 회의 뒤 기록은 보지 않는다', () => {
    const rs = appendRecord<ImplRecord>([], { date: '2027-01-10', agendaId: 'A-20261203-02', status: '진행', evidence: '' });
    const late = appendRecord<ImplRecord>(rs, { date: '2027-03-10', agendaId: 'A-20261203-02', status: '완료', evidence: '공지문' });
    const p = previousResolutionsFor(ALL, late, '2027-03-04');
    expect(p.map((x) => x.agendaId)).toEqual(['A-20261203-02']);
    expect(p[0]).toMatchObject({ status: '진행', due: '2027-01-15', action: '교육 일정 공지' });
    // A-20260305-01 은 2차(06-04)에서 완료(근거 있음)로 확인됐고 3차가 그 뒤라 3차 회의록에는 싣지 않는다
    expect(previousResolutionsFor(ALL, [], '2026-12-03').map((x) => x.agendaId)).toEqual([]);
    expect(previousResolutionsFor([M1], [], '2026-06-04')).toEqual([{ agendaId: 'A-20260305-01', title: '안전화 지급 기준', action: '지급', due: '2026-04-30', status: '미착수' }]);
  });
});

describe('그래프 — 선은 구조화 값에서만', () => {
  const g = councilGraph(ALL, [], []);
  const carry = (gr: ReturnType<typeof councilGraph>, id: string) => gr.edges.filter((e) => e.type === '이월' && e.agenda === id);
  it('같은 안건 ID 가 두 회의에 → 이월 선 하나, 세 회의 → 둘(날짜순 이웃끼리)', () => {
    expect(carry(councilGraph([M1, M2], [], []), 'A-20260305-02')).toHaveLength(1);
    expect(carry(g, 'A-20260305-02').map((e) => [e.from, e.to])).toEqual([['2026-정기-1차', '2026-정기-2차'], ['2026-정기-2차', '2026-정기-3차']]);
  });
  it('제목이 비슷해도 ID 가 다르면 선이 없다', () => {
    expect(carry(g, 'A-20260604-02')).toHaveLength(0);
    expect(g.edges.some((e) => (e.from === 'A-20260305-02' && e.to === 'A-20260604-02') || (e.from === 'A-20260604-02' && e.to === 'A-20260305-02'))).toBe(false);
  });
  it('다룸·분류·결과·제안 선', () => {
    const types = new Set(g.edges.map((e) => e.type));
    for (const t of ['개최', '다룸', '분류', '결과', '제안', '이월']) expect(types.has(t as never), t).toBe(true);
    expect(g.edges).toContainEqual(expect.objectContaining({ type: '결과', from: 'A-20260305-01', to: '의결', meeting: '2026-정기-1차' }));
    expect(g.edges).toContainEqual(expect.objectContaining({ type: '제안', from: '근로자위원', to: 'A-20260305-01' }));
  });
  it('가져온(확인 전) 회의록은 선을 만들지 않고, 확인하면 생긴다', () => {
    const imp: MinutesLike = { ...M2, import: { status: '가져옴 — 확인 전', source: { path: 'C:/옛/2차.hwp', sha256: 'ab'.repeat(32) } } };
    const before = councilGraph([M1, imp], [], []);
    expect(before.edges.filter((e) => e.meeting === '2026-정기-2차' || e.from === '2026-정기-2차' || e.to === '2026-정기-2차')).toHaveLength(0);
    expect(carry(before, 'A-20260305-02')).toHaveLength(0);
    const ok: DocEvent = { seq: 1, meetingKey: '2026-정기-2차', stage: '가져옴 확인', date: '2026-11-10' };
    expect(carry(councilGraph([M1, imp], [], [ok]), 'A-20260305-02')).toHaveLength(1);
  });
});

describe('대시보드', () => {
  const TODAY = '2027-02-01';
  const d = councilDashboard([M1, M2, M3, M4], [], [], TODAY);
  it('의결됐는데 이행 기록이 없으면 미이행, 기한이 지났으면 기한 경과 — 완료(근거 있음)는 빠진다', () => {
    expect(d.overdue.map((x) => x.agendaId)).toEqual(['A-20261203-02']);
    expect(d.overdue[0]).toMatchObject({ status: '미착수', due: '2027-01-15', late: true });
  });
  it('3회 이상 이월', () => {
    expect(d.carried).toEqual([{ agendaId: 'A-20260305-02', title: '야간 작업 순환', times: 3 }]);
  });
  it('1년간 다루지 않은 제20조제1항 호 · 정기회의 공백 · 보고 누락', () => {
    expect(d.untouched).toHaveLength(16);
    expect(d.untouched.map((a) => a.key)).not.toContain('20-7');
    expect(d.gaps.map((x) => x.status)).toEqual(['확인 필요']);
    expect(d.gaps[0]).toMatchObject({ from: '2026-06-04', to: '2026-12-03' });
    expect(d.missingReports.map((x) => x.meeting)).toEqual(['2026-정기-1차', '2026-정기-2차', '2026-정기-3차']);
    expect(d.missingReports[0].missing).toHaveLength(3);
  });
  it('가져온 회의록과 비슷한 제목은 「후보」로만', () => {
    const imp: MinutesLike = { ...M2, import: { status: '가져옴 — 확인 전', source: { path: 'C:/옛/2차.hwp', sha256: 'ab'.repeat(32) } } };
    const x = councilDashboard([M1, imp], [], [], TODAY);
    expect(x.unconfirmed).toEqual(['2026-정기-2차']);
    expect(x.candidates.length).toBeGreaterThan(0);
  });
});

describe('회의록 대장', () => {
  const sha = (c: string) => c.repeat(64);
  const ev: DocEvent[] = [
    { seq: 1, meetingKey: '2026-정기-1차', stage: '초안', date: '2026-03-06', version: 1, path: 'C:/회의록/1차_v1.pdf', sha256: sha('a') },
    { seq: 2, meetingKey: '2026-정기-1차', stage: '서명 완료', date: '2026-03-10', version: 2, path: 'C:/회의록/1차_서명.pdf', sha256: sha('b') },
    { seq: 3, meetingKey: '2026-정기-1차', stage: '공지', date: '2026-03-20' },
  ];
  it('차수·정기/임시·개최일·통보·정족수·안건 수·의결 수·서명일·공지일·보존 만료·현재 판·해시', () => {
    const l = councilLedger(ALL, ev, { 'C:/회의록/1차_서명.pdf': sha('b'), 'C:/회의록/1차_v1.pdf': sha('a') }, '2026-12-10');
    expect(l.rows[0]).toMatchObject({
      key: '2026-정기-1차', number: 1, kind: '정기', date: '2026-03-05', quorum: '성립', agendaCount: 3, resolvedCount: 1,
      signedDate: '2026-03-10', postedDate: '2026-03-20', posted: '기한 경과', keepUntil: '2029-03-06', version: 2, sha256: sha('b'),
    });
    expect(l.warnings.join('\n')).toMatch(/2026-정기-1차.*공지/);
    expect(l.warnings.join('\n')).toMatch(/2026-정기-2차.*서명/);
    expect(l.warnings.join('\n')).not.toMatch(/해시/);
  });
  it('서명본 해시가 바뀌었거나 파일이 없으면 알린다', () => {
    expect(councilLedger(ALL, ev, { 'C:/회의록/1차_서명.pdf': sha('c') }, '2026-12-10').warnings.join()).toMatch(/2026-정기-1차.*서명본.*바뀌었다/);
    expect(councilLedger(ALL, ev, { 'C:/회의록/1차_서명.pdf': null }, '2026-12-10').warnings.join()).toMatch(/서명본 파일이 없다/);
  });
  it('보존 만료 — 작성일 + 3년(초일 불산입), 임박·경과', () => {
    expect(councilLedger(ALL, ev, {}, '2029-01-15').warnings.join()).toMatch(/2026-정기-1차.*보존 만료 임박/);
    expect(councilLedger(ALL, ev, {}, '2029-03-07').warnings.join()).toMatch(/2026-정기-1차.*보존 기간이 지났다/);
    expect(retentionEnd('2025-02-28', 3)).toBe('2028-02-29');
    expect(retentionEnd('2024-02-29', 3)).toBe('2027-02-28');
    expect(retentionEnd('2024-02-28', 3)).toBe('2027-02-28');
    expect(retentionEnd('2026-12-04', 3)).toBe('2029-12-04');
  });
  it('정기회의 3개월 공백(마지막 정기회의 뒤 오늘까지 포함)', () => {
    const w = councilLedger(ALL, ev, {}, '2027-07-01').warnings.join('\n');
    expect(w).toMatch(/2026-06-04.*3개월/);
    expect(w).toMatch(/마지막 정기회의\(2026-12-03\)/);
  });
});

describe('옵시디언 보관함', () => {
  const v = councilVault(ALL, appendRecord<ImplRecord>([], { date: '2027-01-10', agendaId: 'A-20261203-02', status: '진행' }), [], {}, '2027-02-01');
  const names = new Set(v.files.map((f) => f.path.split('/').pop()!.replace(/\.md$/, '')));
  it('모든 위키링크가 있는 파일을 가리킨다(깨진 링크 0)', () => {
    const broken = v.files.flatMap((f) => wikilinks(f.text).filter((t) => !names.has(t)).map((t) => `${f.path} → ${t}`));
    expect(broken).toEqual([]);
    expect(v.files.map((f) => f.path)).toEqual(expect.arrayContaining(['_대시보드.md', '_회의록대장.md', '회의/2026-정기-1차.md', '안건/A-20260305-02.md', '이행/A-20261203-02 이행.md', '법조문/근참법 제20조제1항제7호.md', '결과/의결.md']));
  });
  it('자유 글의 [[…]]·#… 은 링크·태그가 되지 않는다', () => {
    const a = v.files.find((f) => f.path === '안건/A-20260305-02.md')!.text;
    expect(a).toContain('처럼');
    expect(wikilinks(a)).not.toContain('A-20260305-01');
    expect(a).not.toMatch(/(^|[^\\])#긴급/);
  });
  it('YAML 앞머리 — 종류·ID·날짜·상태', () => {
    const m = v.files.find((f) => f.path === '회의/2026-정기-3차.md')!.text;
    expect(m.startsWith('---\n')).toBe(true);
    expect(m).toMatch(/^type: "회의"$/m);
    expect(m).toMatch(/^id: "2026-정기-3차"$/m);
    expect(m).toMatch(/^date: "2026-12-03"$/m);
    const imp = v.files.find((f) => f.path === '이행/A-20261203-02 이행.md')!.text;
    expect(imp).toMatch(/^status: "진행"$/m);
  });
  it('금지어가 없다', () => {
    expect(bannedHits(v.files.map((f) => f.text).join('\n'), WORDS)).toEqual([]);
  });
});
