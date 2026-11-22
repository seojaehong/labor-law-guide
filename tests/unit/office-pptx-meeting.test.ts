// 회의 PPTX(회의 전 검토안) — 합성 스냅숏으로만 시험한다(실명·실주소 없음).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx, type MeetingSnapshot } from '../../src/lib/office/pptx/meeting';

// 1×1 투명 PNG
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const LONG_TEXT = '가'.repeat(300);

function snapshot(): MeetingSnapshot {
  const prior = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    const id = `R-${String(n).padStart(2, '0')}`;
    return {
      id,
      hazard: n === 3 ? LONG_TEXT : `합성 위험요인 ${n}`,
      frequency: 2,
      severity: 3,
      grade: '중간 (6)',
      measure: `합성 대책 ${n}`,
      owner: '조치 담당(역할)',
      due: `2026-10-${String(10 + n).padStart(2, '0')}`,
      // 1·2·3 = 완료(P5 3장), 4 = 기한초과, 5 = 재조치, 나머지 미완료
      status: n <= 3 ? '완료' : n === 4 ? '기한초과' : n === 5 ? '재조치' : '미완료',
      result: n <= 3 ? `조치 결과 ${n}` : '',
      verifier: '확인자(역할)',
      // R-02 는 척도가 다르다 → P8 에서 「비교 안 함」
      scaleId: n === 2 ? 'scale-old' : 'scale-v1',
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
    status: { label: '초안' },
    scaleId: 'scale-v1',
    scaleName: '빈도×강도 3×3',
    prior,
    hazards: [
      { id: 'R-01', situation: '상황1', cause: '원인1', consequence: '결과1', frequency: 1, severity: 3, grade: '낮음 (3)', kind: 'unchanged', anchors: ['A-R-01'] },
      { id: 'R-02', situation: '상황2', cause: '원인2', consequence: '결과2', frequency: 1, severity: 2, grade: '낮음 (2)', kind: 'changed', sourceType: '현장 순회', anchors: ['A-R-02'] },
      { id: 'N-01', situation: '새 상황', cause: '새 원인', consequence: '새 결과', tags: ['넘어짐'], frequency: 2, severity: 2, grade: '중간 (4)', kind: 'new', sourceType: '근로자 의견', anchors: ['A-N-01'] },
    ],
    photos: [
      { itemId: 'R-01', side: 'before', data: PNG_1PX, mime: 'image/png' },
      { itemId: 'R-01', side: 'after', data: PNG_1PX, mime: 'image/png' },
      { itemId: 'R-02', side: 'after', data: PNG_1PX, mime: 'image/png' },
    ],
    opinions: [{ id: 'O-1', from: '근로자(역할)', text: '통로 조명이 어둡다', relatedIds: ['N-01'], anchors: ['A-O-1'] }],
    questions: [{ id: 'Q-1', question: 'N-01 을 이번 회차에 반영할지', targetIds: ['N-01'], options: ['반영', '보류'] }],
    anchors: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `A-R-0${i + 1}`, source: '합성 평가표', location: `시트1!B${i + 5}` })),
      { id: 'A-N-01', source: '합성 순회 기록', location: '2쪽' },
      { id: 'A-O-1', source: '합성 의견 수렴표', location: '1행' },
    ],
  };
}

async function zipOf(bytes: Uint8Array) {
  return JSZip.loadAsync(bytes);
}

async function slideXml(zip: JSZip, n: number) {
  return zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
}

describe('makeMeetingPptx — 회의 전 검토안', () => {
  it('장 순서가 P1~P10 규칙대로(P4 이어짐·P5 항목 수만큼)', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    expect(r.ok).toBe(true);
    expect(r.slides.map((s) => s.code)).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P4', 'P5', 'P5', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
    ]);
    expect(r.slides[4].title).toContain('(계속)');
    expect(r.slides.slice(5, 8).map((s) => s.title)).toEqual([
      expect.stringContaining('R-01'),
      expect.stringContaining('R-02'),
      expect.stringContaining('R-03'),
    ]);
    expect(r.slides.map((s) => s.no)).toEqual(r.slides.map((_, i) => i + 1));
    const zip = await zipOf(r.bytes!);
    expect(zip.file(`ppt/slides/slide${r.slides.length}.xml`)).toBeTruthy();
    expect(zip.file(`ppt/slides/slide${r.slides.length + 1}.xml`)).toBeNull();
    // A4 가로
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    const m = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
    expect(Number(m[1])).toBeGreaterThan(Number(m[2]));
    expect(Math.round(Number(m[1]) / 360000)).toBe(30); // 29.7cm
    expect(Math.round(Number(m[2]) / 360000)).toBe(21);
  });

  it('모든 장 notes 에 그 장 anchors 가 들어 있다', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const zip = await zipOf(r.bytes!);
    const p4 = r.slides.filter((s) => s.code === 'P4');
    expect(p4[0].anchors).toContain('A-R-01');
    expect(p4[1].anchors).toContain('A-R-07');
    expect(r.slides.find((s) => s.code === 'P10')!.anchors).toHaveLength(10);
    for (const s of r.slides) {
      const notes = await zip.file(`ppt/notesSlides/notesSlide${s.no}.xml`)!.async('string');
      expect(notes).toContain('근거');
      for (const a of s.anchors) expect(notes).toContain(a);
    }
  });

  it('P8 은 척도 ID 가 다른 항목을 「비교 안 함」 으로 쓴다', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const zip = await zipOf(r.bytes!);
    const p8 = r.slides.find((s) => s.code === 'P8')!;
    const xml = await slideXml(zip, p8.no);
    expect(xml).toContain('비교 안 함');
    // R-01 은 같은 척도 → 증감(6 → 3 = -3)
    expect(xml).toContain('-3');
    expect(r.changes!.find((c) => c.id === 'R-02')!.delta).toBe('비교 안 함');
    expect(r.changes!.find((c) => c.id === 'R-01')!.delta).toBe(-3);
  });

  it('배지 「초안」 이 모든 장에, 사진 없는 P5 에 「사진 없음」', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const zip = await zipOf(r.bytes!);
    for (const s of r.slides) expect(await slideXml(zip, s.no)).toContain('초안');
    const p5 = r.slides.filter((s) => s.code === 'P5');
    const x1 = await slideXml(zip, p5[0].no); // R-01 사진 둘
    const x2 = await slideXml(zip, p5[1].no); // R-02 조치 후만
    const x3 = await slideXml(zip, p5[2].no); // R-03 사진 없음
    expect(x1).not.toContain('사진 없음');
    expect((x1.match(/<p:pic>/g) ?? []).length).toBe(2);
    expect(x2).toContain('사진 없음');
    expect((x2.match(/<p:pic>/g) ?? []).length).toBe(1);
    expect(x3).toContain('사진 없음');
    expect((x3.match(/<p:pic>/g) ?? []).length).toBe(0);
  });

  it('overflowEstimates 가 긴 한글 300자 칸을 잡고 짧은 칸은 잡지 않는다', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const hit = r.overflowEstimates.filter((e) => e.ref === 'R-03');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0].chars).toBe(300);
    expect(hit[0].chars).toBeGreaterThan(hit[0].capacity);
    expect(r.overflowEstimates.every((e) => e.ref === 'R-03')).toBe(true);
  });

  it('잘못된 스냅숏은 {ok:false, errors}', async () => {
    const s = snapshot();
    s.site = '';
    s.prior[1].id = s.prior[0].id;
    const r = await makeMeetingPptx(s, { kind: 'pre' });
    expect(r.ok).toBe(false);
    expect(r.errors!.length).toBeGreaterThanOrEqual(2);
    expect(r.bytes).toBeUndefined();
  });
});
