// 회의 결과 전파본(전파 덱 3종 중 2) — 확정 회의 스냅숏 → 근로자에게 전하는 덱. 합성 스냅숏만.
// 근거: 법 제36조④ 전단 · 규칙 제37조의3 2호(이행 결과 포함 공유) · 고시 제17조(공유 방법·신규 근로자).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import type { MeetingSnapshot } from '../../src/lib/office/pptx/meeting';
import { DEFAULT_LIMITS, OFFICE_OPS, makeBroadcastPptx as libBroadcast } from '@/lib/office';

function finalSnapshot(): MeetingSnapshot {
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
    actions: [{ id: 'AC-1', targetId: 'N-01', measure: '통로 조명 교체', owner: '시설 담당(역할)', due: '2027-01-20' }],
    deferred: [{ id: 'R-03', hazard: '설비 노후', reason: '설비 교체 예정', reevaluateBy: '2027-03-31' }],
  };
}

async function allText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return (await Promise.all(names.map((n) => zip.file(n)!.async('string')))).join('\n');
}

describe('makeBroadcastPptx — 회의 결과 전파본', () => {
  it('장 순서 B1 요약 → B2 바뀐 것 → B3 지킬 대책 → B4 의견 반영 → B5 지난 조치 결과 → B6 보류 → B7 공유 확인', async () => {
    const r = await makeBroadcastPptx(finalSnapshot());
    expect(r.ok).toBe(true);
    expect(r.slides.map((s) => s.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
  });

  it('바뀐 것은 신규·변경만, 대책은 대상 위험 원문과 담당·기한을 함께 싣는다', async () => {
    const r = await makeBroadcastPptx(finalSnapshot());
    const t = await allText(r.bytes!);
    expect(t).toContain('야간 통로 어두움');
    expect(t).toContain('사다리 작업');
    expect(t).not.toContain('그대로인 위험');
    expect(t).toContain('통로 조명 교체');
    expect(t).toContain('2027-01-20');
  });

  it('의견 반영 결과 — 결정과 이어진 의견은 결정을, 이어지지 않은 의견은 「이번 회의에서 결정 없음」', async () => {
    const r = await makeBroadcastPptx(finalSnapshot());
    expect(r.opinionResults).toEqual([
      { opinionId: 'O-1', result: '반영', decisionIds: ['D-1'] },
      { opinionId: 'O-2', result: '이번 회의에서 결정 없음', decisionIds: [] },
    ]);
  });

  it('지난 조치 이행 결과(규칙 제37조의3 2호)를 싣는다', async () => {
    const t = await allText((await makeBroadcastPptx(finalSnapshot())).bytes!);
    expect(t).toContain('경보기 설치 완료');
    expect(t).toContain('미완료');
  });

  it('빈 목록이면 그 장을 빼지 않고 「없음」 한 줄로 둔다', async () => {
    const s = { ...finalSnapshot(), deferred: [], opinions: [] };
    const r = await makeBroadcastPptx(s);
    expect(r.slides.map((x) => x.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    expect(await allText(r.bytes!)).toContain('없음');
  });

  it('확정되지 않은 스냅숏은 만들지 않는다(초안을 근로자에게 전하지 않음)', async () => {
    const r = await makeBroadcastPptx({ ...finalSnapshot(), kind: 'pre', status: { label: '초안' } });
    expect(r.ok).toBe(false);
    expect(r.errors!.join(' ')).toContain('확정');
    const junk = await makeBroadcastPptx({ site: 1 } as never);
    expect(junk.ok).toBe(false);
  });

  it('행이 많으면 장을 나눈다(대책 9건 → B3 2장)', async () => {
    const s = finalSnapshot();
    s.actions = Array.from({ length: 9 }, (_, i) => ({ id: `AC-${i}`, measure: `대책 ${i}`, owner: '담당(역할)', due: '2027-01-01' }));
    const r = await makeBroadcastPptx(s);
    expect(r.slides.filter((x) => x.code === 'B3')).toHaveLength(2);
  });
});

describe('라이브러리 입구 pptx.broadcast', () => {
  it('OFFICE_OPS 에 있고 결과 파일은 files[0]', async () => {
    expect(OFFICE_OPS).toContain('pptx.broadcast');
    const r = await libBroadcast(finalSnapshot(), { limits: DEFAULT_LIMITS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.op).toBe('pptx.broadcast');
    expect(r.files![0].name).toBe('broadcast.pptx');
  });
});
