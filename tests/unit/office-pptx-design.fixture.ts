// 덱 디자인 프리셋 시험용 합성 스냅숏(가상 사업장). 시안 5종(261128)에 쓴 값과 같은 모양.
import type { MeetingSnapshot } from '../../src/lib/office/pptx/meeting';

export function finalSnapshotForDesign(): MeetingSnapshot {
  return {
    kind: 'final',
    site: '합성 사업장',
    cycle: '2026년 2회차',
    basisDate: '2026-11-20',
    actualMeetingDate: '2026-12-01',
    status: { label: '확정', version: 2 },
    scaleId: 's1',
    scaleName: '빈도×강도 3×3',
    prior: [
      { id: 'R-01', hazard: '전회 위험 1', status: '완료', result: '경보기 설치 완료' },
      { id: 'R-02', hazard: '전회 위험 2', status: '미완료' },
    ],
    hazards: [
      { id: 'R-01', situation: '그대로인 위험', cause: '', consequence: '', kind: 'unchanged' },
      { id: 'N-01', situation: '야간 통로 어두움', cause: '조명 부족', consequence: '넘어짐', kind: 'new', grade: '중간 (4)' },
      { id: 'R-02', situation: '사다리 작업', cause: '', consequence: '떨어짐', kind: 'changed', grade: '높음 (6)' },
    ],
    photos: [],
    opinions: [
      { id: 'O-1', from: '근로자(역할)', text: '통로 조명이 어둡다', relatedIds: ['N-01'] },
      { id: 'O-2', from: '근로자(역할)', text: '휴게실이 좁다', relatedIds: ['X-9'] },
    ],
    questions: [{ id: 'Q-1', question: 'N-01 반영 여부', targetIds: ['N-01'] }],
    anchors: [],
    decisions: [{ id: 'D-1', questionId: 'Q-1', targetIds: ['N-01'], decision: '반영', reason: '근로자 의견 다수' }],
    actions: [
      { id: 'AC-1', targetId: 'N-01', measure: '통로 조명 교체', owner: '시설 담당(역할)', due: '2027-01-20' },
      { id: 'AC-2', targetId: 'R-02', measure: '사다리 상단 고정 장치 설치·2인 1조 작업', owner: '작업반장(역할)', due: '2026-12-20' },
      { id: 'AC-3', targetId: 'R-01', measure: '후방 경보기 월 1회 작동 점검', owner: '안전 담당(역할)', due: '2027-02-28' },
    ],
    deferred: [{ id: 'R-03', hazard: '설비 노후', reason: '설비 교체 예정', reevaluateBy: '2027-03-31' }],
  };
}

/** 대책 n건 — 넘침·needs 거르기 시험용 */
export function manyActions(n: number): MeetingSnapshot {
  const s = finalSnapshotForDesign();
  s.actions = Array.from({ length: n }, (_, i) => ({
    id: `AC-${i + 1}`,
    targetId: 'N-01',
    measure: `대책 ${i + 1} 통로 조명 교체`,
    owner: '시설 담당(역할)',
    due: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
  return s;
}
