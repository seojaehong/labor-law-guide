// 회의록 그래프 화면의 「가상 예시」 — 기록 폴더와 같은 모양의 파일 묶음(가상 사업장·직위만, 실명 없음).
// parseCouncilFiles 를 그대로 거치게 해서 예시와 실제 폴더가 같은 길로 그려진다.
import { minutesRecord, type MeetingDocsInput } from './meeting-docs';
import { DOC_LOG, IMPL_LOG } from './records';
import { GRIEVANCE_LOG } from './grievance';

const m = (number: number, date: string, agenda: MeetingDocsInput['agenda'], extra: Partial<MeetingDocsInput> = {}) =>
  minutesRecord({
    workplace: { name: '가상제조' }, councilName: '가상제조 노사협의회',
    meeting: { kind: '정기', number, date }, seats: { worker: 5, employer: 5 }, attendance: { worker: 5, employer: 4 },
    agenda, writtenDate: date, ...extra,
  });

export function sampleCouncilFiles(): { name: string; text: string }[] {
  const minutes = [
    m(1, '2026-03-05', [
      { title: '안전화 지급 기준', type: '의결', article: '21-3', proposer: '근로자위원', inFavor: 8, decision: '전 직원 연 1회 지급', implementation: { action: '지급', owner: '총무팀장', due: '2026-04-30' } },
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', proposer: '근로자위원' },
      { title: '1분기 경영실적', type: '보고', article: '22-1' },
    ]),
    m(2, '2026-06-04', [
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', proposer: '근로자위원', carriedOver: true },
      { title: '휴게실 냉난방 개선', type: '의결', article: '20-2', proposer: '근로자위원', inFavor: 7, decision: '여름 전 설치', implementation: { action: '설치', owner: '시설팀장', due: '2026-07-31' } },
      { title: '2분기 인력계획', type: '보고', article: '22-3' },
    ]),
    m(3, '2026-09-03', [
      { id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', proposer: '근로자위원', carriedOver: true },
      { title: '교육훈련 기본계획', type: '의결', article: '21-1', proposer: '사용자위원', inFavor: 7, decision: '원안대로', implementation: { action: '교육 일정 공지', owner: '인사팀장', due: '2026-10-15' } },
      { title: '성희롱 예방 교육 방식', type: '협의', article: '20-16', proposer: '사용자위원' },
    ]),
  ];
  const impl = [
    { seq: 1, date: '2026-04-20', agendaId: 'A-20260305-01', status: '완료', evidence: '지급 대장(2026-04-20)' },
    { seq: 2, date: '2026-07-10', agendaId: 'A-20260604-02', status: '진행', owner: '시설팀장' },
  ];
  const grievances = [
    { seq: 1, caseId: 'G-2026-001', stage: '청취', date: '2026-05-20', category: '작업환경·안전' },
    { seq: 2, caseId: 'G-2026-001', stage: '회의 부의', date: '2026-05-28', agendaId: 'A-20260305-02' },
    { seq: 3, caseId: 'G-2026-001', stage: '통보', date: '2026-05-29' },
    { seq: 4, caseId: 'G-2026-002', stage: '청취', date: '2026-10-01', category: '근로시간·휴가' },
  ];
  const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n');
  return [
    ...minutes.map((x) => ({ name: `${x.meeting.key}.json`, text: JSON.stringify(x) })),
    { name: IMPL_LOG, text: lines(impl) },
    { name: DOC_LOG, text: '' },
    { name: GRIEVANCE_LOG, text: lines(grievances) },
  ];
}
