import { describe, expect, it } from 'vitest';
import { appendGrievance, grievanceCases, grievanceRecordErrors, type GrievanceRecord } from '@/lib/nosa-council/grievance';

// 고충처리 대장 — 법 제28조제1항(청취일부터 10일 이내 통보) · 제2항(협의회 부의) · 시행령 제9조(대장 1년 보존).
// 사건 번호·분류·날짜·단계만 받는다(이름·사연 없음). 값은 합성.

const heard = appendGrievance([], { caseId: 'G-2026-001', stage: '청취', date: '2026-03-02', category: '작업환경·안전' });

describe('처리결과 통보 기한 = 청취일 + 10일', () => {
  it('기한 날 통보는 기한 내, 다음 날은 늦음', () => {
    expect(grievanceCases(appendGrievance(heard, { caseId: 'G-2026-001', stage: '통보', date: '2026-03-12' }), '2026-04-01')[0]).toMatchObject({ due: '2026-03-12', notified: '2026-03-12', late: false, status: '통보' });
    expect(grievanceCases(appendGrievance(heard, { caseId: 'G-2026-001', stage: '통보', date: '2026-03-13' }), '2026-04-01')[0]).toMatchObject({ late: true });
  });
  it('통보가 없으면 오늘이 기한을 넘었을 때만 늦음', () => {
    expect(grievanceCases(heard, '2026-03-12')[0]).toMatchObject({ late: false, status: '청취' });
    expect(grievanceCases(heard, '2026-03-13')[0]).toMatchObject({ late: true });
  });
  it('협의회 부의(법 제28조제2항)는 상태로 남고, 통보 기한 알림은 그대로 둔다', () => {
    const r = grievanceCases(appendGrievance(heard, { caseId: 'G-2026-001', stage: '회의 부의', date: '2026-03-10', agendaId: 'A-20260305-02' }), '2026-03-20')[0];
    expect(r).toMatchObject({ status: '회의 부의', referredAgendaId: 'A-20260305-02', late: true });
  });
  it('정정은 새 기록 — 같은 단계는 마지막 기록을 쓴다', () => {
    let rs: GrievanceRecord[] = appendGrievance(heard, { caseId: 'G-2026-001', stage: '통보', date: '2026-03-13' });
    rs = appendGrievance(rs, { caseId: 'G-2026-001', stage: '통보', date: '2026-03-11', corrects: 2 });
    expect(rs).toHaveLength(3);
    expect(grievanceCases(rs, '2026-04-01')[0]).toMatchObject({ notified: '2026-03-11', late: false });
  });
});

describe('받지 않는 값', () => {
  it('이름 같은 사건 번호 · 청취 전 통보 · 안건 없는 부의 · 분류 밖 · 청취일 앞 날짜 · 청취 중복', () => {
    expect(grievanceRecordErrors({ caseId: '가상일', stage: '청취', date: '2026-03-02', category: '임금' }, []).join()).toMatch(/G-/);
    expect(grievanceRecordErrors({ caseId: 'G-9', stage: '통보', date: '2026-03-02' }, []).join()).toMatch(/청취 기록이 먼저/);
    expect(grievanceRecordErrors({ caseId: 'G-2026-001', stage: '회의 부의', date: '2026-03-05' }, heard).join()).toMatch(/안건 ID/);
    expect(grievanceRecordErrors({ caseId: 'G-1', stage: '청취', date: '2026-03-02', category: '기타' as never }, []).join()).toMatch(/분류/);
    expect(grievanceRecordErrors({ caseId: 'G-1', stage: '청취', date: '2026-03-02' }, []).join()).toMatch(/분류/);
    expect(grievanceRecordErrors({ caseId: 'G-2026-001', stage: '통보', date: '2026-03-01' }, heard).join()).toMatch(/앞섭니다/);
    expect(grievanceRecordErrors({ caseId: 'G-2026-001', stage: '청취', date: '2026-03-03', category: '임금' }, heard).join()).toMatch(/corrects/);
    expect(grievanceRecordErrors({ caseId: 'G-2026-001', stage: '통보', date: '2026-03-05' }, heard)).toEqual([]);
  });
});
