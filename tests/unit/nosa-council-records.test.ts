import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { minutesRecord, type MeetingDocsInput } from '@/lib/nosa-council/meeting-docs';
import { retentionEnd } from '@/lib/nosa-council/meeting';
import { appendGrievance } from '@/lib/nosa-council/grievance';
import {
  appendRecord, caseCollisions, councilDashboard, councilGraph, isConfirmed, councilLedger, councilVault, implHistory, implLabel, importedMinutes, importErrors, importMatches,
  importTextWarnings, IMPORTED, minutesShapeErrors, previousResolutionsFor, wikilinks,
  type DocEvent, type ImplRecord, type ImportProposal, type MinutesLike,
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
  it('확인 전(가져옴) 회의록은 「직전 회의」 기준일이 되지 않는다', () => {
    // 2차(06-04)가 확인 전이면 직전 확인 회의는 1차(03-05) — 03-20 에 끝난 1차 의결은 1차 뒤에 끝났으므로 다음 회의록에 싣는다
    const imp: MinutesLike = { ...M2, previousResolutions: [], import: { status: IMPORTED, source: { path: 'C:/옛/2차.hwp', sha256: 'ab'.repeat(32) } } };
    const done = appendRecord<ImplRecord>([], { date: '2026-03-20', agendaId: 'A-20260305-01', status: '완료', evidence: '지급 대장' });
    expect(previousResolutionsFor([M1, imp], done, '2026-09-01').map((x) => x.agendaId)).toEqual(['A-20260305-01']);
    const ok: DocEvent = { seq: 1, meetingKey: '2026-정기-2차', stage: '가져옴 확인', date: '2026-08-01', sha256: 'ab'.repeat(32) };
    expect(previousResolutionsFor([M1, imp], done, '2026-09-01', [ok]).map((x) => x.agendaId)).toEqual([]);
  });
  it('「가져옴 확인」은 그때의 원본 해시에만 걸린다 — 같은 키로 다시 가져오면 다시 확인해야 한다', () => {
    const imp = (sha: string): MinutesLike => ({ ...M2, import: { status: IMPORTED, source: { path: 'C:/옛/2차.hwp', sha256: sha } } });
    const ev: DocEvent = { seq: 1, meetingKey: '2026-정기-2차', stage: '가져옴 확인', date: '2026-08-01', sha256: 'ab'.repeat(32) };
    expect(isConfirmed(imp('ab'.repeat(32)), [ev])).toBe(true);
    expect(isConfirmed(imp('cd'.repeat(32)), [ev])).toBe(false);
    expect(isConfirmed(imp('cd'.repeat(32)), [{ ...ev, sha256: undefined }])).toBe(true); // 해시 없는 옛 기록은 키로만
  });
});

describe('고충 노드 — 사건 번호·분류·단계만, 부의 선은 확인된 회의록의 안건에만', () => {
  let gs = appendGrievance([], { caseId: 'G-2026-001', stage: '청취', date: '2026-03-02', category: '작업환경·안전' });
  gs = appendGrievance(gs, { caseId: 'G-2026-001', stage: '회의 부의', date: '2026-03-04', agendaId: 'A-20260305-02' });
  gs = appendGrievance(gs, { caseId: 'G-2026-002', stage: '청취', date: '2026-11-01', category: '임금' });
  gs = appendGrievance(gs, { caseId: 'G-2026-002', stage: '회의 부의', date: '2026-11-03', agendaId: 'A-29990101-01' });
  it('그래프 — 고충 노드 둘, 부의 선은 회의록에 있는 안건으로만', () => {
    const g = councilGraph(ALL, [], [], gs);
    expect(g.nodes.filter((n) => n.type === '고충').map((n) => n.id)).toEqual(['G-2026-001', 'G-2026-002']);
    expect(g.edges.filter((e) => e.type === '부의')).toEqual([{ type: '부의', from: 'G-2026-001', to: 'A-20260305-02' }]);
  });
  it('대시보드·보관함 — 통보 기한 경과를 알리고, 대장 1년 보존을 적고, 깨진 링크가 없다', () => {
    const d = councilDashboard(ALL, [], [], '2026-11-20', gs);
    expect(d.grievancesLate.map((c) => c.caseId)).toEqual(['G-2026-001', 'G-2026-002']);
    const v = councilVault(ALL, [], [], {}, '2026-11-20', gs);
    const f = v.files.find((x) => x.path === '고충/G-2026-001.md')!.text;
    expect(f).toMatch(/^type: "고충"$/m);
    expect(f).toMatch(/^due: "2026-03-12"$/m);
    expect(wikilinks(f)).toContain('A-20260305-02');
    expect(wikilinks(v.files.find((x) => x.path === '고충/G-2026-002.md')!.text)).not.toContain('A-29990101-01');
    const dash = v.files.find((x) => x.path === '_대시보드.md')!.text;
    expect(dash).toContain('G-2026-002');
    expect(dash).toContain('1년간 보존');
    const names = new Set(v.files.map((x) => x.path.split('/').pop()!.replace(/\.md$/, '')));
    expect(v.files.flatMap((x) => wikilinks(x.text).filter((t) => !names.has(t)))).toEqual([]);
    expect(bannedHits(v.files.map((x) => x.text).join('\n'), WORDS)).toEqual([]);
  });
});

describe('보관함 파일 이름 — 대소문자만 다른 이름은 윈도우에서 한 파일이 된다', () => {
  it('충돌을 찾는다', () => {
    expect(caseCollisions(['안건/A-1.md', '안건/a-1.md', '회의/x.md'])).toEqual([['안건/A-1.md', '안건/a-1.md']]);
    expect(caseCollisions(['안건/A-1.md', '안건/A-2.md'])).toEqual([]);
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

describe('가져온 회의록 — 모델이 구조를 제안하고 도구가 확인한다', () => {
  const src = { path: 'C:/옛 회의록/2027-1차.hwpx', sha256: 'c'.repeat(64) };
  const P = (over: Partial<ImportProposal> = {}): ImportProposal => ({
    workplace: { name: '가상제조' },
    meeting: { kind: '정기', number: 1, date: '2027-03-04' },
    seats: { worker: 5, employer: 5 },
    agenda: [
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', result: '계속 협의', carriedOver: true },
      { id: 'A-20270304-02', title: '야간작업 순환 방식 개선', type: '의결', article: '20-7', proposer: '근로자위원', result: '의결', decision: '4주 단위 순환', implementation: { action: '순환표 게시', due: '2027-04-30' } },
    ],
    writtenDate: '2027-03-05',
    ...over,
  });
  const imported = importedMinutes(P(), src).record;
  const ok = (key: string): DocEvent => ({ seq: 1, meetingKey: key, stage: '가져옴 확인', date: '2027-03-20' });

  it('구조 확인 — 구분과 결과가 맞지 않거나 법조문·ID·차수가 틀리면 막는다', () => {
    expect(importErrors(P())).toEqual([]);
    expect(importErrors(P({ agenda: [{ id: 'X-1', title: '실적', type: '보고', result: '의결' }] })).join()).toMatch(/보고/);
    expect(importErrors(P({ agenda: [{ id: 'X-1', title: '휴게실', type: '협의', result: '보고 완료' }] })).join()).toMatch(/보고 완료/);
    expect(importErrors(P({ agenda: [{ id: 'X-1', title: '휴게실', type: '협의', result: '통과' as never }] })).join()).toMatch(/결과/);
    expect(importErrors(P({ agenda: [{ id: 'X-1', title: '휴게실', type: '협의', article: '20-99', result: '계속 협의' }] })).join()).toMatch(/법조문/);
    expect(importErrors(P({ agenda: [{ id: 'X-1', title: 'a', type: '협의', result: '계속 협의' }, { id: 'X-1', title: 'b', type: '협의', result: '계속 협의' }] })).join()).toMatch(/같은 안건 ID/);
    expect(importErrors(P({ meeting: { kind: '정기', date: '2027-03-04' } })).join()).toMatch(/차수/);
  });

  it('가져온 값은 「가져옴 — 확인 전」이고 원본은 경로·해시만 남긴다 · 결과는 원문대로(찬성 수가 없어도)', () => {
    expect(imported.import).toEqual({ status: IMPORTED, source: src });
    expect(minutesShapeErrors(imported)).toEqual([]);
    expect(imported.meeting.key).toBe('2027-정기-1차');
    expect(imported.agenda.map((a) => a.result)).toEqual(['계속 협의', '의결']);
  });

  it('찬성 수가 있어 계산한 결과가 원문 결과와 다르면 알린다(원문대로 둔다)', () => {
    const r = importedMinutes(P({ attendance: { worker: 5, employer: 5 }, agenda: [{ id: 'X-1', title: '휴게실', type: '의결', result: '의결', inFavor: 4 }] }), src);
    expect(r.record.agenda[0].result).toBe('의결');
    expect(r.warnings.join()).toMatch(/X-1.*의결되지 않음/);
  });

  it('확인 전에는 선이 없다 — 가져온 회의록끼리 같은 ID 여도 · 확인하면 이월 선이 생긴다', () => {
    const second = importedMinutes(P({ meeting: { kind: '정기', number: 2, date: '2027-06-03' }, writtenDate: '2027-06-04' }), src).record;
    const g = councilGraph([...ALL, imported, second], [], []);
    const touches = (e: (typeof g.edges)[number]) => [e.from, e.to, e.meeting].some((x) => x === '2027-정기-1차' || x === '2027-정기-2차' || x === 'A-20270304-02');
    expect(g.edges.filter(touches)).toEqual([]);
    expect(g.nodes.map((n) => n.id)).not.toContain('A-20270304-02');
    expect(g.edges.filter((e) => e.type === '이월' && e.agenda === 'A-20260305-02')).toHaveLength(2);
    const after = councilGraph([...ALL, imported, second], [], [ok('2027-정기-1차')]);
    expect(after.edges).toContainEqual({ type: '이월', from: '2026-정기-3차', to: '2027-정기-1차', agenda: 'A-20260305-02' });
    expect(after.edges.filter((e) => [e.from, e.to, e.meeting].includes('2027-정기-2차'))).toEqual([]);
  });

  it('제목이 비슷하면 「후보」로만 보이고 선은 만들지 않는다 · 같은 ID 는 확인하면 이어진다고 알린다', () => {
    const x = importMatches(imported, ALL, []);
    expect(x.sameId).toEqual([{ id: 'A-20260305-02', meetings: ['2026-정기-1차', '2026-정기-2차', '2026-정기-3차'] }]);
    expect(x.candidates).toContainEqual(expect.objectContaining({ imported: expect.objectContaining({ id: 'A-20270304-02' }), existing: expect.objectContaining({ id: 'A-20260604-02' }) }));
    const after = councilGraph([...ALL, imported], [], [ok('2027-정기-1차')]);
    expect(after.edges.some((e) => [e.from, e.to].includes('A-20270304-02') && [e.from, e.to].includes('A-20260604-02'))).toBe(false);
  });

  it('원문 대조 — 원문에서 찾지 못한 개최일·안건 제목을 알린다', () => {
    const text = '제1차 정기 노사협의회 회의록\n개최 일시: 2027. 3. 4. 14:00\n1. 야간 작업 순환\n2. 야간작업 순환방식 개선';
    expect(importTextWarnings(imported, text)).toEqual([]);
    expect(importTextWarnings(imported, '2027년 3월 4일 야간 작업 순환 · 야간작업 순환 방식 개선')).toEqual([]);
    const w = importTextWarnings(imported, '개최 일시: 2027. 3. 5.\n1. 야간 작업 순환').join('\n');
    expect(w).toMatch(/개최일/);
    expect(w).toMatch(/A-20270304-02/);
  });

  it('대장 — 가져온 회의록은 원본 경로·해시를 현재 판으로 보이고, 원본이 바뀌면 알린다', () => {
    const l = councilLedger([...ALL, imported], [], { [src.path]: src.sha256 }, '2027-03-10');
    expect(l.rows.at(-1)).toMatchObject({ key: '2027-정기-1차', status: IMPORTED, path: src.path, sha256: src.sha256 });
    expect(l.warnings.join()).not.toMatch(/가져온 원본/);
    expect(councilLedger([...ALL, imported], [], { [src.path]: 'd'.repeat(64) }, '2027-03-10').warnings.join()).toMatch(/2027-정기-1차 가져온 원본.*바뀌었다/);
  });

  it('대장 — 확인 전 회의록의 값으로는 서명·공지·보존·정기회의 간격을 점검하지 않는다(확인하면 점검한다)', () => {
    // 3차(2026-12-03) 뒤 1차(2027-03-04)는 「확인 필요」 간격 — 확인 전이면 대장도 대시보드처럼 보지 않는다
    const before = councilLedger([...ALL, imported], [], {}, '2027-03-10').warnings;
    const mine = before.filter((w) => w.includes('2027-정기-1차'));
    expect(mine).toEqual([expect.stringMatching(new RegExp(`2027-정기-1차.*${IMPORTED}.*가져옴 확인`))]);
    expect(before.join()).not.toMatch(/2027-정기-1차: 직전 정기회의/);
    const after = councilLedger([...ALL, imported], [ok('2027-정기-1차')], {}, '2027-03-10').warnings.join('\n');
    expect(after).toMatch(/2027-정기-1차 회의록에 서명 완료 기록이 없다/);
    expect(after).toMatch(/2027-정기-1차: 직전 정기회의\(2026-12-03\)/);
  });

  it('금지어가 없다', () => {
    const r = importedMinutes(P({ attendance: { worker: 5, employer: 5 }, agenda: [{ id: 'X-1', title: '휴게실', type: '의결', result: '의결', inFavor: 4 }] }), src);
    expect(bannedHits(JSON.stringify(r) + importTextWarnings(imported, '').join() + importErrors(P({ meeting: { kind: '정기', date: '2027-03-04' } })).join(), WORDS)).toEqual([]);
  });
});
