// 회의(pre·final)·TBM·교안 덱 시험용 합성 스냅숏(가상 사업장 · 실명·주민번호 없음).
// 디자인 프리셋 조각 2-나 — 쪽 나눔·빈 목록·사진·사례/문제 있음·없음을 고루 넣는다.
import type { MeetingSnapshot } from '../../src/lib/office/pptx/meeting';
import type { TbmSnapshot } from '../../src/lib/office/pptx/tbm';
import type { EducationSnapshot } from '../../src/lib/office/pptx/education';

// 1×1 투명 PNG
export const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** 띄어쓰기 있는 긴 글(n 낱말) — 칸을 늘리고 장을 나누는지 보는 용도 */
export const words = (head: string, n: number) => `${head} ${Array.from({ length: n }, (_, i) => `낱말${i + 1}`).join(' ')}`;

export function meetingPre(long = false): MeetingSnapshot {
  const L = (t: string) => (long ? words(t, 24) : t);
  const prior = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    const id = `R-0${n}`;
    return {
      id,
      hazard: L(`합성 위험요인 ${n}`),
      frequency: 2,
      severity: 3,
      grade: '중간 (6)',
      measure: L(`합성 대책 ${n}`),
      owner: '조치 담당(역할)',
      due: `2026-10-${String(10 + n).padStart(2, '0')}`,
      status: n <= 3 ? '완료' : n === 4 ? '기한초과' : n === 5 ? '재조치' : '미완료',
      result: n <= 3 ? L(`조치 결과 ${n}`) : '',
      verifier: '확인자(역할)',
      scaleId: n === 2 ? 'scale-old' : 'scale-v1',
      legal: n === 1 ? '산업안전보건기준에 관한 규칙 제21조' : undefined,
      effect: n === 1 ? '보행 동선 분리' : undefined,
      residual: n === 1 ? '낮음' : undefined,
      anchors: [`A-${id}`],
    };
  });
  return {
    kind: 'pre',
    site: '합성 사업장',
    cycle: '2026년 2회차',
    meetingDate: '2026-11-30',
    basisDate: '2026-11-20',
    period: '2026-12-01 ~ 2027-05-31',
    author: '작성자(역할)',
    revision: 'rev-3',
    status: { label: '초안' },
    scaleId: 'scale-v1',
    scaleName: '빈도×강도 3×3',
    agenda: ['전회 조치 이행 확인', '신규·변경 위험요인 검토', '근로자 의견 검토', '결정 필요 사항'],
    safetyCase: L('지난달 하역장 후진 접촉 아차사고 1건 — 유도자 배치 후 재발 없음'),
    attendees: { planned: [{ role: '사업주(역할)', name: '대표(역할)' }, { role: '근로자대표', name: '근로자대표(역할)' }, { role: '관리감독자', name: '반장(역할)' }] },
    prior,
    hazards: [
      { id: 'R-01', situation: '상황1', cause: '원인1', consequence: '결과1', frequency: 1, severity: 3, grade: '낮음 (3)', kind: 'unchanged', anchors: ['A-R-01'] },
      { id: 'R-02', situation: L('사다리 작업 중 떨어짐'), cause: '원인2', consequence: '결과2', frequency: 1, severity: 2, grade: '낮음 (2)', kind: 'changed', sourceType: '현장 순회', anchors: ['A-R-02'] },
      { id: 'N-01', situation: L('야간 통로 어두움'), cause: '조명 부족', consequence: '넘어짐', tags: ['넘어짐'], measures: { technical: '조명 교체', education: '야간 보행 교육', management: '순회 점검' }, frequency: 2, severity: 2, grade: '중간 (4)', kind: 'new', sourceType: '근로자 의견', anchors: ['A-N-01'] },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `N-1${i}`, situation: `신규 위험 ${i + 1}`, cause: '원인', consequence: '부딪힘', frequency: 1, severity: 1, grade: '낮음 (1)', kind: 'new' })),
    ],
    photos: [
      { itemId: 'R-01', side: 'before', data: PNG_1PX, mime: 'image/png' },
      { itemId: 'R-01', side: 'after', data: PNG_1PX, mime: 'image/png' },
      { itemId: 'R-02', side: 'after', data: PNG_1PX, mime: 'image/png' },
    ],
    opinions: Array.from({ length: 9 }, (_, i) => ({ id: `O-${i + 1}`, from: '근로자(역할)', text: L(`의견 ${i + 1} 통로 조명이 어둡다`), relatedIds: ['N-01'], anchors: ['A-N-01'] })),
    questions: [
      { id: 'Q-1', question: L('N-01 을 이번 회차에 반영할지'), targetIds: ['N-01'], options: ['반영', '보류'] },
      { id: 'Q-2', question: 'R-02 대책을 바꿀지', targetIds: ['R-02'] },
    ],
    anchors: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `A-R-0${i + 1}`, source: '합성 평가표', location: `시트1!B${i + 5}` })),
      { id: 'A-N-01', source: '합성 의견함', location: '11월' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `A-X-${i + 1}`, source: '합성 기록', location: `쪽 ${i + 1}` })),
    ],
  };
}

export function meetingPreEmpty(): MeetingSnapshot {
  const s = meetingPre();
  return { ...s, prior: [], hazards: [], photos: [], opinions: [], questions: [], anchors: [], agenda: undefined, attendees: undefined, safetyCase: undefined };
}

export function meetingFinal(long = false): MeetingSnapshot {
  const L = (t: string) => (long ? words(t, 24) : t);
  return {
    kind: 'final',
    site: '합성 사업장',
    cycle: '2026년 2회차',
    basisDate: '2026-11-20',
    actualMeetingDate: '2026-12-01',
    nextPeriod: '2026-12-01 ~ 2027-05-31',
    author: '작성자(역할)',
    revision: 'rev-4',
    status: { label: '확정', version: 2 },
    scaleId: 's1',
    scaleName: '빈도×강도 3×3',
    attendees: {
      planned: [{ role: '사업주(역할)', name: '대표(역할)' }, { role: '근로자대표', name: '근로자대표(역할)' }],
      actual: [{ role: '사업주(역할)', name: '대표(역할)' }, { role: '근로자대표', name: '근로자대표(역할)' }, { role: '관리감독자', name: '반장(역할)' }],
    },
    prior: [
      { id: 'R-01', hazard: '전회 위험 1', status: '완료', result: '경보기 설치 완료', frequency: 2, severity: 2, grade: '중간 (4)', anchors: ['A-1'] },
      { id: 'R-02', hazard: '전회 위험 2', status: '미완료', frequency: 1, severity: 3, scaleId: 's0' },
      { id: 'R-03', hazard: '설비 노후', status: '미완료', frequency: 2, severity: 1 },
    ],
    hazards: [
      { id: 'N-01', situation: L('야간 통로 어두움'), cause: '조명 부족', consequence: '넘어짐', kind: 'new', grade: '중간 (4)', frequency: 2, severity: 2, anchors: ['A-2'] },
      { id: 'R-02', situation: '사다리 작업', cause: '', consequence: '떨어짐', kind: 'changed', grade: '높음 (6)' },
    ],
    photos: [],
    opinions: [{ id: 'O-1', from: '근로자(역할)', text: '통로 조명이 어둡다', relatedIds: ['N-01'] }],
    questions: [{ id: 'Q-1', question: 'N-01 반영 여부', targetIds: ['N-01'] }],
    anchors: Array.from({ length: 13 }, (_, i) => ({ id: `A-${i + 1}`, source: '합성 평가표', location: `시트1!C${i + 3}` })),
    decisions: Array.from({ length: 9 }, (_, i) => ({ id: `D-${i + 1}`, questionId: 'Q-1', targetIds: ['N-01'], decision: L(`결정 ${i + 1} 반영`), reason: '근로자 의견 다수', anchors: ['A-2'] })),
    actions: [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `AC-${i + 1}`, targetId: 'N-01', measure: L(`대책 ${i + 1} 통로 조명 교체`), owner: '시설 담당(역할)', due: `2027-01-${String(20 - i).padStart(2, '0')}`, verifier: '안전 담당(역할)' })),
      { id: 'AC-7', targetId: 'R-02', measure: '사다리 상단 고정 장치 설치·2인 1조 작업', owner: '작업반장(역할)' },
      { id: 'AC-8', targetId: 'N-01', measure: '같은 위험 두 번째 대책', owner: '시설 담당(역할)', due: '2027-02-01' },
    ],
    deferred: [{ id: 'R-03', hazard: '설비 노후', reason: L('설비 교체 예정'), reevaluateBy: '2027-03-31' }],
    bestPractices: [{ id: 'B-1', title: '유도자 배치', text: L('하역장 후진 때 유도자를 두어 접촉 아차사고가 줄었다') }],
  };
}

export function meetingFinalEmpty(): MeetingSnapshot {
  const s = meetingFinal();
  return { ...s, attendees: undefined, decisions: [], actions: [], deferred: [], bestPractices: [], anchors: [] };
}

export function tbm(long = false): TbmSnapshot {
  const L = (t: string) => (long ? words(t, 20) : t);
  return {
    site: '합성 사업장',
    workDate: '2026-12-02',
    basisDate: '2026-12-01',
    cycle: '2026년 2회차',
    revision: 'rev-2',
    tasks: [
      {
        id: 'T-1',
        process: '지게차 하역',
        place: '1동 하역장',
        hazards: [
          { id: 'H-ok', situation: '허용 수준 위험', measures: ['대책 ok'], acceptability: 'acceptable' },
          { id: 'H-cond', situation: L('조건부 위험'), measures: ['대책 cond'], acceptability: 'conditional' },
          { id: 'H-new', situation: '새로 생긴 위험', measures: ['대책 new'], acceptability: 'acceptable', kind: 'new' },
          { id: 'H-bad', situation: L('후진 중 보행자 접촉'), cause: '후방 시야 가림', consequence: '부딪힘', measures: ['후방 경보기 작동 확인', L('유도자 배치')], acceptability: 'unacceptable', seriousConcern: true, anchors: ['A-1'] },
        ],
        questions: ['오늘 유도자는 어디에 서나요?', '경보기 소리를 들었나요?', '세 번째 질문'],
      },
      { id: 'T-2', process: '선반 정리', hazards: [{ id: 'H-s1', situation: '사다리에서 떨어짐', measures: [], acceptability: 'conditional', seriousConcern: true }] },
    ],
    anchors: [{ id: 'A-1', source: '합성 평가표', location: '시트1!B5' }],
  };
}

export function education(long = false): EducationSnapshot {
  const L = (t: string) => (long ? words(t, 24) : t);
  return {
    site: '합성 사업장',
    basisDate: '2026-12-01',
    educationDate: '2026-12-05',
    course: 'hire',
    cycle: '2026년 2회차',
    hazards: [
      { id: 'H-1', situation: '허용 위험', measures: ['대책 1'], acceptability: 'acceptable', consequence: '넘어짐' },
      { id: 'H-2', situation: L('지게차 부딪힘'), measures: ['유도자 배치', L('후방 경보기')], acceptability: 'unacceptable', consequence: '부딪힘' },
      { id: 'H-3', situation: '사다리 떨어짐', measures: ['사다리 고정'], acceptability: 'conditional', consequence: '떨어짐' },
      { id: 'H-4', situation: '바닥 미끄러짐', measures: [], consequence: '넘어짐' },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `H-x${i}`, situation: `기타 위험 ${i + 1}`, measures: ['정리정돈'], acceptability: 'acceptable' as const, consequence: i % 2 ? '베임' : '끼임' })),
    ],
    cases: [
      { id: 'C-1', title: '합성 사례 — 후진 지게차', text: L('합성 사례 본문 후진하던 지게차가 보행자와 부딪혔다'), accidentType: '부딪힘', source: '합성 출처' },
      { id: 'C-2', title: '합성 사례 — 사다리', text: '합성 사례 본문 2' },
      { id: 'C-3', title: '합성 사례 — 세 번째', text: '실리지 않는 사례' },
    ],
    quiz: [{ question: L('지게차 후진 때 누가 유도하나요?'), answer: '유도자' }, { question: '사다리는 몇 명이 작업하나요?' }],
  };
}

export function educationBare(): EducationSnapshot {
  const s = education();
  return { ...s, course: 'regular', cycle: undefined, cases: [], quiz: [] };
}
