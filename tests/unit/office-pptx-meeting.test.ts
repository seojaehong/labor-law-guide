// 회의 PPTX(회의 전 검토안) — 합성 스냅숏으로만 시험한다(실명·실주소 없음).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeMeetingPptx, type MeetingSnapshot } from '../../src/lib/office/pptx/meeting';
import { extractPptx } from '../../src/lib/office/pptx/extract';

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

  it('kind 가 pre·final 이 아니면 오류', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'x' as never });
    expect(r.ok).toBe(false);
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

function finalSnapshot(): MeetingSnapshot {
  const s = snapshot();
  return {
    ...s,
    kind: 'final',
    status: { label: '확정', version: 2 },
    actualMeetingDate: '2026-12-01',
    nextPeriod: '2027-06-01 ~ 2027-11-30',
    attendees: {
      planned: [
        { role: '사업주(역할)' },
        { role: '근로자대표', name: '대표(역할)' },
        { role: '안전 담당(역할)' },
      ],
      actual: [
        { role: '사업주(역할)' },
        { role: '근로자대표', name: '대표(역할)' },
      ],
    },
    decisions: [
      { id: 'D-1', questionId: 'Q-1', targetIds: ['N-01'], decision: '반영', reason: '근로자 의견 다수', anchors: ['A-N-01'] },
    ],
    actions: [
      { id: 'AC-1', targetId: 'N-01', measure: '통로 조명 교체', owner: '시설 담당(역할)', due: '2027-01-20', verifier: '확인자(역할)', anchors: ['A-N-01'] },
      { id: 'AC-2', targetId: 'R-04', measure: '안전난간 재설치', owner: '시설 담당(역할)', due: '2026-12-15', verifier: '확인자(역할)', anchors: ['A-R-04'] },
      { id: 'AC-3', targetId: 'R-05', measure: '교육 재실시', owner: '교육 담당(역할)', due: '2027-01-05', verifier: '확인자(역할)' },
    ],
    deferred: [
      { id: 'R-06', hazard: '합성 위험요인 6', reason: '설비 교체 예정', reevaluateBy: '2027-03-31', anchors: ['A-R-06'] },
    ],
  };
}

describe('makeMeetingPptx — 회의 후 확정본', () => {
  it('F1~F8 순서, 우수 사례가 없으면 F6 을 만들지 않는다', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    expect(r.ok).toBe(true);
    expect(r.slides.map((s) => s.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F7', 'F8']);
    const s = finalSnapshot();
    s.bestPractices = [{ id: 'B-1', title: '합성 우수 사례', text: '정리정돈 우수', anchors: ['A-R-01'] }];
    const r2 = await makeMeetingPptx(s, { kind: 'final' });
    expect(r2.slides.map((x) => x.code)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
    const zip = await zipOf(r2.bytes!);
    expect(await slideXml(zip, 6)).toContain('정리정돈 우수');
  });

  it('배지 「확정 v2」 가 모든 장에 있고, 모든 장 notes 에 anchors 가 있다', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    const zip = await zipOf(r.bytes!);
    for (const s of r.slides) {
      const xml = await slideXml(zip, s.no);
      expect(xml).toContain('확정 v2');
      expect(xml).not.toContain('초안');
      const notes = await zip.file(`ppt/notesSlides/notesSlide${s.no}.xml`)!.async('string');
      expect(notes).toContain('근거');
      for (const a of s.anchors) expect(notes).toContain(a);
    }
    const f1 = await slideXml(zip, 1);
    expect(f1).toContain('2026-12-01');
    expect(f1).toContain('2027-06-01 ~ 2027-11-30');
  });

  it('확정본은 status 가 확정이어야 한다', async () => {
    const s = finalSnapshot();
    s.status = { label: '초안' };
    const r = await makeMeetingPptx(s, { kind: 'final' });
    expect(r.ok).toBe(false);
  });

  it('F2 는 예정·실제 참석 표 둘과 근로자대표 참여 여부를 쓴다', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    const zip = await zipOf(r.bytes!);
    const xml = await slideXml(zip, r.slides.find((s) => s.code === 'F2')!.no);
    expect((xml.match(/<a:tbl>/g) ?? []).length).toBe(2);
    expect(xml).toContain('참석 예정');
    expect(xml).toContain('실제 참석');
    expect(xml).toContain('근로자대표 참여: 예');
    const s = finalSnapshot();
    s.attendees!.actual = [{ role: '사업주(역할)' }];
    const r2 = await makeMeetingPptx(s, { kind: 'final' });
    const z2 = await zipOf(r2.bytes!);
    expect(await slideXml(z2, r2.slides.find((x) => x.code === 'F2')!.no)).toContain('근로자대표 참여: 아니오');
  });

  it('F4 조치 계획 행이 기한 오름차순', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    const zip = await zipOf(r.bytes!);
    const xml = await slideXml(zip, r.slides.find((s) => s.code === 'F4')!.no);
    const pos = ['AC-2', 'AC-3', 'AC-1'].map((id) => xml.indexOf(id));
    expect(pos.every((p) => p > 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });

  it('F7 이월 목록은 prior[] 모양이라 다음 회차 P4 입력으로 그대로 쓰인다', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    const carry = r.carryOver!;
    expect(carry.map((p) => p.id)).toEqual(['R-04', 'R-05', 'N-01', 'R-06']);
    const allowed = ['id', 'hazard', 'frequency', 'severity', 'grade', 'measure', 'owner', 'due', 'status', 'result', 'verifier', 'scaleId', 'legal', 'effect', 'residual', 'anchors'];
    for (const p of carry) {
      for (const k of Object.keys(p)) expect(allowed).toContain(k);
      expect(p.status).toBe('미완료');
      expect(p.scaleId).toBe('scale-v1');
      expect(p.hazard).toBeTruthy();
    }
    expect(carry.find((p) => p.id === 'N-01')!.hazard).toBe('새 상황');
    const zip = await zipOf(r.bytes!);
    const f7 = await slideXml(zip, r.slides.find((s) => s.code === 'F7')!.no);
    for (const p of carry) expect(f7).toContain(p.id);

    // 다음 회차 회의 전 검토안 P4 입력
    const next = snapshot();
    next.prior = carry;
    next.anchors = finalSnapshot().anchors;
    const r2 = await makeMeetingPptx(next, { kind: 'pre' });
    expect(r2.ok).toBe(true);
    const z2 = await zipOf(r2.bytes!);
    const p4 = await slideXml(z2, r2.slides.find((s) => s.code === 'P4')!.no);
    for (const p of carry) expect(p4).toContain(p.id);
  });
});

describe('extractPptx — 장별 글자·표·notes', () => {
  it('검토안 덱을 읽으면 P1 제목·배지·anchor 가 나온다', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const x = await extractPptx(r.bytes!);
    expect(x.ok).toBe(true);
    expect(x.slides.map((s) => s.no)).toEqual(r.slides.map((s) => s.no));
    const p1 = x.slides[0];
    // 표지(카탈로그 1)는 장 번호 머리 없이 큰 제목이 title 도형이다 — 장 목록 제목은 그대로 「P1 표지」
    expect(r.slides[0].title).toBe('P1 표지');
    expect(p1.shapes.find((s) => s.name === 'title')?.text).toBe('회의 전 검토안');
    expect(p1.shapes.find((s) => s.name === 'badge')?.text).toBe('초안');
    expect(p1.notes).toContain('근거 anchor');
    // 장마다 notes 에 그 장 anchors
    for (const info of r.slides) {
      const s = x.slides[info.no - 1];
      for (const a of info.anchors) expect(s.notes, `${info.code} ${a}`).toContain(a);
    }
  });

  it('표는 행·칸 글자로 나온다(P4 전회 이행 현황)', async () => {
    const r = await makeMeetingPptx(snapshot(), { kind: 'pre' });
    const x = await extractPptx(r.bytes!);
    const no = r.slides.find((s) => s.code === 'P4')!.no;
    const tbl = x.slides[no - 1].shapes.find((s) => s.table)?.table;
    expect(tbl).toBeDefined();
    expect(tbl![0]).toContain('ID');
    expect(tbl!.map((row) => row[0])).toContain('R-01');
  });

  it('확정본 배지 「확정 v2」 를 읽는다', async () => {
    const r = await makeMeetingPptx(finalSnapshot(), { kind: 'final' });
    const x = await extractPptx(r.bytes!);
    for (const s of x.slides) expect(s.shapes.find((sh) => sh.name === 'badge')?.text).toBe('확정 v2');
  });

  it('zip 이 아닌 바이트·빈 바이트는 예외 없이 needsReview', async () => {
    for (const b of [new Uint8Array(0), new Uint8Array([1, 2, 3, 4]), new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]) {
      const x = await extractPptx(b);
      expect(x.ok).toBe(false);
      expect(x.needsReview).toBe(true);
      expect(x.reason).toBeTruthy();
    }
  });
});
