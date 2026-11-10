import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bannedHits } from '@/lib/tool-kit/banned';
import { formHwpx, formLines, formPdf, type FormDoc } from '@/lib/work-rules-report/render';
import {
  MINUTES_FORM_LABELS, meetingDocs, meetingDocsErrors, minutesRecord, withAgendaIds, type MeetingDocsInput,
} from '@/lib/nosa-council/meeting-docs';

// 노사협의회 회의 서류 — 소집 통보·공고 / 회의자료 / 회의록(별지 제3호서식 + 상세) / 의결사항 공지.
// 설계 = practice-docs-spec-261110.md(서류) + minutes-graph-spec-261110.md(안건 ID·법조문 분류·결과·이월, 회의록 .json).
// 정족수·기한은 meeting.ts meetingCheck 한 벌을 쓴다. 발언 요지·안건 설명은 입력으로 받은 것만 싣는다. 사업장·사람은 합성 값.

const FONT = new Uint8Array(readFileSync('public/fonts/NanumGothic-Regular.ttf'));
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '받을 수 있는 금액', '포괄', '대신', '대행', '대리', '지도'];
const all = (d: FormDoc) => formLines(d).join('\n');

const BASE: MeetingDocsInput = {
  workplace: { name: '가상제조' },
  councilName: '가상제조 노사협의회',
  meeting: { kind: '정기', number: 4, date: '2026-12-03', time: '14:00', place: '본관 2층 회의실', noticeDate: '2026-11-25', previousRegularDate: '2026-09-03' },
  seats: { worker: 5, employer: 5 },
  attendance: { worker: 4, employer: 5 },
  agenda: [
    { title: '2027년 교육훈련 기본계획', type: '의결', article: '21-1', proposer: '사용자위원', inFavor: 6, decision: '2027년 교육훈련 기본계획을 원안대로 의결', implementation: { action: '교육 일정 공지', owner: '인사팀장', due: '2027-01-15' } },
    { title: '휴게실 증설', type: '의결', article: '21-2', proposer: '근로자위원', inFavor: 5 },
    { title: '야간 작업 순환 방식', type: '협의', article: '20-7', proposer: '근로자위원', discussion: [{ side: '근로자위원', position: '생산1팀 대표', summary: '야간 연속 근무를 주 2회 이내로 줄이자는 의견' }, { side: '사용자위원', position: '생산본부장', summary: '인력 충원 계획과 함께 다음 회의에서 검토' }] },
    { title: '3분기 경영실적', type: '보고', article: '22-1' },
  ],
  reports: { 경영계획: '3분기 매출 목표 대비 96% 달성', 인력계획: '4분기 생산직 6명 채용 예정' },
  previousResolutions: [
    { agendaId: 'A-20260903-01', title: '안전화 지급 기준', action: '전 직원 지급', due: '2026-10-31', status: '완료', evidence: '지급 대장(2026. 10. 20.)' },
    { agendaId: 'A-20260903-02', title: '식당 운영 시간', action: '30분 연장', status: '완료' },
    { agendaId: 'A-20260903-03', title: '통근버스 노선', action: '노선 조정 검토', due: '2026-11-30', status: '진행' },
  ],
  writtenDate: '2026-12-04',
};

describe('안건 ID — 처음 상정 때 발급, 이월돼도 같은 ID', () => {
  it('없으면 개최일·순번으로 발급, 있으면 그대로', () => {
    const a = withAgendaIds(BASE).agenda.map((x) => x.id);
    expect(a).toEqual(['A-20261203-01', 'A-20261203-02', 'A-20261203-03', 'A-20261203-04']);
    const kept = withAgendaIds({ ...BASE, agenda: [{ ...BASE.agenda[2], id: 'A-20260903-05', carriedOver: true }] }).agenda[0];
    expect(kept.id).toBe('A-20260903-05');
  });
  it('같은 회의에 같은 ID 두 번·파일 이름에 못 쓰는 글자면 오류', () => {
    expect(meetingDocsErrors({ ...BASE, agenda: [{ ...BASE.agenda[0], id: 'X-1' }, { ...BASE.agenda[1], id: 'X-1' }] }, 'minutes').join()).toMatch(/같은 안건 ID/);
    expect(meetingDocsErrors({ ...BASE, agenda: [{ ...BASE.agenda[0], id: 'a/b' }] }, 'minutes').join()).toMatch(/안건 ID/);
  });
});

describe('소집 통보서·공고', () => {
  it('통보가 늦으면 만들지 않는다(개최일 − 8일)', () => {
    expect(meetingDocsErrors({ ...BASE, meeting: { ...BASE.meeting, noticeDate: '2026-11-26' } }, 'notice').join()).toMatch(/2026-11-25/);
    expect(meetingDocsErrors(BASE, 'notice')).toEqual([]);
  });
  it('안건마다 [보고]·[협의]·[의결], 법 제21조 안건은 「의결 필요」', () => {
    const r = meetingDocs(BASE, 'notice');
    expect(r.made.map((d) => d.id)).toEqual(['소집통보서', '소집공고']);
    const t = all(r.made[0].doc);
    for (const x of ['[의결]', '[협의]', '[보고]', '2027년 교육훈련 기본계획', '의결 필요', '본관 2층 회의실', '2026년 12월 3일']) expect(t).toContain(x);
    expect(t).toMatch(/개최일 전날까지 7일/);
  });
  it('받는 위원을 주면 위원마다 한 장', () => {
    const r = meetingDocs({ ...BASE, recipients: [{ side: '근로자위원', position: '생산1팀 대표' }, { side: '사용자위원', position: '인사팀장' }] }, 'notice');
    const doc = r.made[0].doc;
    expect(doc.blocks.filter((b) => b.kind === 'pageBreak')).toHaveLength(1);
    expect(all(doc)).toContain('근로자위원 생산1팀 대표');
  });
});

describe('회의자료', () => {
  it('정기회의면 보고사항 4개 칸, 안건별 배경·현황·제안(노·사)·쟁점·요청 결정, 전분기 이행 점검표', () => {
    const t = all(meetingDocs(BASE, 'materials').made[0].doc);
    for (const x of ['경영계획 전반 및 실적에 관한 사항', '분기별 생산계획과 실적에 관한 사항', '인력계획에 관한 사항', '기업의 경제적·재정적 상황', '3분기 매출 목표 대비 96% 달성']) expect(t).toContain(x);
    for (const x of ['배경', '현황', '제안(근로자위원)', '제안(사용자위원)', '쟁점', '요청 결정']) expect(t).toContain(x);
    expect(t).toContain('A-20260903-03');
    expect(t).toContain('완료(근거 없음)');
  });
  it('보고사항이 빠지면 알린다', () => {
    expect(meetingDocs(BASE, 'materials').warnings.join()).toMatch(/분기별 생산계획과 실적/);
  });
});

describe('회의록 — 별지 제3호서식 + 상세 회의록', () => {
  const r = meetingDocs(BASE, 'minutes');
  const form = all(r.made[0].doc);
  const detail = all(r.made[1].doc);
  it('두 벌', () => expect(r.made.map((d) => d.id)).toEqual(['회의록', '상세회의록']));
  it('별지 제3호서식 칸 7개 전부, 글자 그대로', () => {
    expect(MINUTES_FORM_LABELS).toEqual(['회의일시', '회의장소', '협의사항', '보고사항', '의결사항', '의결된 사항 및 그 이행에 관한 사항', '그 밖의 참고사항 및 전분기 의결된 사항의 이행 상황']);
    for (const l of MINUTES_FORM_LABELS) expect(form).toContain(l);
    expect(form).toContain('제 4 차 (정기) 노사협의회 회의록');
    expect(form).toContain('참석위원 서명');
  });
  it('정족수·의결 문장을 박는다(2/3 올림)', () => {
    for (const t of [form, detail]) {
      expect(t).toContain('근로자위원 5명 중 4명, 사용자위원 5명 중 5명 출석 — 각 과반수 출석으로 개회');
      expect(t).toContain('출석위원 9명 중 6명 찬성 — 3분의 2 이상으로 의결');
      expect(t).toContain('출석위원 9명 중 5명 찬성 — 3분의 2(6명)에 미달하여 의결되지 않음');
    }
  });
  it('회의 공개·비밀 유지 문구 한 줄, 보존기한(작성일 + 3년)', () => {
    expect(form).toMatch(/공개한다.*비밀/);
    expect(form).toContain('2029년 12월 4일');
  });
  it('전분기 이행 상황 — 근거 없는 완료는 「완료(근거 없음)」', () => {
    expect(form).toContain('A-20260903-01');
    expect(form).toMatch(/A-20260903-02.*완료\(근거 없음\)/);
    expect(form).not.toMatch(/A-20260903-01.*근거 없음/);
  });
  it('서명 칸은 비우고, 이름은 넣을 때만', () => {
    const sign = r.made[0].doc.blocks.flatMap((b) => (b.kind === 'table' ? b.rows : [])).filter((row) => row.length === 4 && /^\d+$/.test(row[0].text));
    expect(sign.length).toBeGreaterThanOrEqual(5);
    expect(sign.every((row) => row[2].text === '' && row[3].text === '')).toBe(true);
    const named = all(meetingDocs({ ...BASE, attendance: { worker: 4, employer: 5, members: [{ side: '근로자위원', position: '위원장', name: '가나다' }] } }, 'minutes').made[0].doc);
    expect(named).toContain('가나다');
  });
  it('발언 요지는 입력으로 받은 것만', () => {
    expect(detail).toContain('야간 연속 근무를 주 2회 이내로 줄이자는 의견');
    expect(detail).toContain('사용자위원(생산본부장)');
    const noTalk = all(meetingDocs({ ...BASE, agenda: [BASE.agenda[0]] }, 'minutes').made[1].doc);
    expect(noTalk).toContain('발언 요지 입력 없음');
  });
  it('개최 정족수 미달이어도 만들되 의결되지 않음으로 적고 알린다', () => {
    const bad = meetingDocs({ ...BASE, seats: { worker: 10, employer: 10 }, current: { worker: 7 }, attendance: { worker: 4, employer: 6 } }, 'minutes');
    const t = all(bad.made[0].doc);
    expect(t).toContain('회의가 성립하지 않음');
    expect(t).not.toContain('3분의 2 이상으로 의결');
    expect(bad.warnings.join()).toMatch(/성립하지 않음/);
  });
  it('회의록은 출석 수·차수·의결 안건의 찬성 수가 있어야 만든다', () => {
    expect(meetingDocsErrors({ ...BASE, attendance: undefined }, 'minutes').join()).toMatch(/출석/);
    expect(meetingDocsErrors({ ...BASE, meeting: { ...BASE.meeting, number: undefined } }, 'minutes').join()).toMatch(/차수/);
    expect(meetingDocsErrors({ ...BASE, agenda: [{ title: '가', type: '의결' }] }, 'minutes').join()).toMatch(/찬성 수/);
    expect(meetingDocsErrors({ ...BASE, attendance: undefined }, 'materials')).toEqual([]);
  });
});

describe('회의록 구조화 원본(.json) — 그래프의 원천', () => {
  const rec = minutesRecord(BASE);
  it('회의 키 YYYY-정기-N차, 안건 ID·구분·법조문·제안 측·이월·결과(4값)', () => {
    expect(rec.schema).toBe('nosa-council-minutes/1');
    expect(rec.meeting.key).toBe('2026-정기-4차');
    expect(rec.agenda.map((a) => [a.id, a.type, a.article, a.proposer, a.carriedOver, a.result])).toEqual([
      ['A-20261203-01', '의결', '21-1', '사용자위원', false, '의결'],
      ['A-20261203-02', '의결', '21-2', '근로자위원', false, '의결되지 않음'],
      ['A-20261203-03', '협의', '20-7', '근로자위원', false, '계속 협의'],
      ['A-20261203-04', '보고', '22-1', null, false, '보고 완료'],
    ]);
    expect(rec.keepUntil).toBe('2029-12-04');
    expect(rec.previousResolutions[1]).toMatchObject({ agendaId: 'A-20260903-02', status: '완료', evidenceMissing: true });
  });
});

describe('의결사항 공지', () => {
  it('의결된 것은 공지, 의결되지 않은 것은 「계속 협의」, 공지 기한(규정 값)', () => {
    const r = meetingDocs({ ...BASE, noticeDays: 7 }, 'resolution');
    const t = all(r.made[0].doc);
    expect(r.made[0].id).toBe('의결사항_공지');
    expect(t).toContain('2027년 교육훈련 기본계획을 원안대로 의결');
    expect(t).toMatch(/휴게실 증설[\s\S]*계속 협의/);
    expect(t).toContain('2026년 12월 10일');
  });
});

describe('그리기·금지어', () => {
  const variants: MeetingDocsInput[] = [
    BASE,
    { ...BASE, meeting: { ...BASE.meeting, kind: '임시', previousRegularDate: undefined }, reports: undefined, previousResolutions: undefined },
    { ...BASE, seats: { worker: 10, employer: 10 }, current: { worker: 7 }, attendance: { worker: 4, employer: 6 } },
  ];
  const docs = variants.flatMap((v) => (['notice', 'materials', 'minutes', 'resolution'] as const).flatMap((k) => meetingDocs(v, k).made.map((d) => d.doc)));
  it('금지어 없음 · 주민등록번호 칸 없음', () => {
    const hits = docs.flatMap((d) => formLines(d).flatMap((l) => bannedHits(l, WORDS).map((w) => `${d.title}: ${w} | ${l.slice(0, 60)}`)));
    expect(hits).toEqual([]);
    expect(docs.map(all).join('\n')).not.toContain('주민등록번호');
  });
  it('PDF·한글로 그려진다', async () => {
    const pdf = await formPdf(docs, FONT);
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF');
    const hwpx = await formHwpx(docs);
    expect(Buffer.from(hwpx.subarray(0, 2)).toString('latin1')).toBe('PK');
  }, 60_000);
});
