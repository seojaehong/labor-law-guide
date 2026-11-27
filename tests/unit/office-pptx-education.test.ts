// 위험성평가 교육 교안(전파 덱 3종 중 3) — 합성 스냅숏만.
// 근거(261127 법제처 원문 확인): 산업안전보건법 시행규칙 별표 5 제1호 가목(정기교육)·다목(채용 시·작업내용 변경 시) 「위험성 평가에 관한 사항」.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { makeEducationPptx, type EducationSnapshot } from '../../src/lib/office/pptx/education';
import { DEFAULT_LIMITS, OFFICE_OPS, makeEducationPptx as libEducation } from '@/lib/office';

function snapshot(): EducationSnapshot {
  return {
    site: '합성 사업장',
    basisDate: '2026-12-01',
    educationDate: '2026-12-05',
    course: 'regular',
    hazards: [
      { id: 'H-1', situation: '허용 위험', measures: ['대책 1'], acceptability: 'acceptable', consequence: '넘어짐' },
      { id: 'H-2', situation: '지게차 부딪힘', measures: ['유도자 배치'], acceptability: 'unacceptable', consequence: '부딪힘' },
      { id: 'H-3', situation: '사다리 떨어짐', measures: ['사다리 고정'], acceptability: 'conditional', consequence: '떨어짐' },
      { id: 'H-4', situation: '바닥 미끄러짐', measures: ['흡착포'], consequence: '넘어짐' },
    ],
    cases: [{ id: 'C-1', title: '합성 사례 — 후진 지게차', text: '합성 사례 본문', accidentType: '부딪힘', source: '합성 출처' }],
    quiz: [{ question: '지게차 후진 때 누가 유도하나요?', answer: '유도자' }],
  };
}

async function allText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return (await Promise.all(names.map((n) => zip.file(n)!.async('string')))).join('\n');
}

describe('makeEducationPptx — 위험성평가 교육 교안', () => {
  it('E1 표지 → E2 결과 요약 → E3 주요 위험 → E4 사례 → E5 확인 문제 → E6 교육 확인 서명부', async () => {
    const r = await makeEducationPptx(snapshot());
    expect(r.ok).toBe(true);
    expect(r.slides.map((s) => s.code)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);
  });

  it('표지에 교육 종류와 확인된 근거(별표 5 제1호 가목·다목)를 적는다', async () => {
    const t = await allText((await makeEducationPptx(snapshot())).bytes!);
    expect(t).toContain('정기교육');
    expect(t).toContain('별표 5 제1호 가목');
    const t2 = await allText((await makeEducationPptx({ ...snapshot(), course: 'change' })).bytes!);
    expect(t2).toContain('작업내용 변경 시 교육');
    expect(t2).toContain('별표 5 제1호 다목');
  });

  it('E2 요약 — 허용 여부별 개수와 재해 유형 상위를 센다', async () => {
    const r = await makeEducationPptx(snapshot());
    expect(r.summary).toEqual({ total: 4, unacceptable: 1, conditional: 1, acceptable: 1, unknown: 1, byConsequence: [['넘어짐', 2], ['부딪힘', 1], ['떨어짐', 1]] });
  });

  it('E3 주요 위험은 TBM 과 같은 순서(허용 불가 → 조건부 …)로 topN 개, 나머지는 omitted', async () => {
    const r = await makeEducationPptx(snapshot(), { topN: 2 });
    expect(r.shown).toEqual(['H-2', 'H-3']);
    expect(r.omitted).toEqual(['H-1', 'H-4']);
  });

  it('사례가 없으면 E4 를 빼고 경고, 확인 문제가 없으면 빈 줄 + 경고(지어 쓰지 않음)', async () => {
    const r = await makeEducationPptx({ ...snapshot(), cases: [], quiz: [] });
    expect(r.slides.map((s) => s.code)).toEqual(['E1', 'E2', 'E3', 'E5', 'E6']);
    expect(r.warnings.some((w) => w.includes('사례'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('확인 문제'))).toBe(true);
  });

  it('사례 출처를 장에 적는다', async () => {
    expect(await allText((await makeEducationPptx(snapshot())).bytes!)).toContain('합성 출처');
  });

  it('입력이 틀리면 errors(던지지 않음)', async () => {
    expect((await makeEducationPptx({ ...snapshot(), hazards: [] })).ok).toBe(false);
    expect((await makeEducationPptx({ ...snapshot(), course: 'x' as never })).ok).toBe(false);
    expect((await makeEducationPptx({ site: 1 } as never)).ok).toBe(false);
  });
});

describe('라이브러리 입구 pptx.education', () => {
  it('OFFICE_OPS 에 있고 결과 파일은 files[0]', async () => {
    expect(OFFICE_OPS).toContain('pptx.education');
    const r = await libEducation(snapshot(), { limits: DEFAULT_LIMITS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta.op).toBe('pptx.education');
    expect(r.files![0].name).toBe('education.pptx');
  });
});
