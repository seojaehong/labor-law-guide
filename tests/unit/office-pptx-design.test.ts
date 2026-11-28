// 덱 디자인 프리셋(조각 1) — 시안 5종(quiet·field·app·report·story, 261128 채택)을 데이터로 두고
// 전파 덱 B1·B3 만 부품 배치로 바꾼다. 프리셋을 고르지 않으면 지금 출력 그대로(슬라이드 XML 해시로 고정).
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { makeBroadcastPptx } from '../../src/lib/office/pptx/broadcast';
import { capacityOf, textUnits } from '../../src/lib/office/pptx/meeting';
import {
  DESIGN_IDS,
  contrastRatio,
  designErrors,
  designScale,
  designsFor,
  fixedTextBoxes,
  fitHeadTitle,
  getDeckDesign,
  type DesignId,
} from '../../src/lib/office/pptx/design';
import { DESIGN_IDS as LIB_DESIGN_IDS, DEFAULT_LIMITS, designsFor as libDesignsFor, makeBroadcastPptx as libBroadcast } from '@/lib/office';
import { finalSnapshotForDesign, manyActions } from './office-pptx-design.fixture';

async function slideXmls(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}
async function slideHash(bytes: Uint8Array): Promise<string> {
  // 병합 전 해시는 이름순(slide1, slide10…)으로 이어 붙여 만들었다 — 같은 방식으로 잰다
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  const h = createHash('sha256');
  for (const n of names) h.update(await zip.file(n)!.async('string'));
  return h.digest('hex');
}
const names = (xml: string) => [...xml.matchAll(/<p:cNvPr id="\d+" name="([^"]+)"/g)].map((m) => m[1]);

// 프리셋마다 B1·B3 에만 있는 부품 도형 이름(objectName)
const PART_MARK: Record<DesignId, { b1: string; b3: string; head: string | null }> = {
  quiet: { b1: 'part:kpi-hero', b3: 'part:hairline-table', head: null },
  field: { b1: 'part:tile-grid', b3: 'part:row-cards', head: 'head:left-band' },
  app: { b1: 'part:chip-grid', b3: 'part:checklist-cards', head: 'head:pill-meta' },
  report: { b1: 'part:summary-table', b3: 'part:report-grid', head: 'head:ribbon' },
  story: { b1: 'part:before-after', b3: 'part:deadline-timeline', head: 'head:capsule' },
};

describe('프리셋 형식', () => {
  it('5종(quiet·field·app·report·story)이 형식 검사를 통과한다', () => {
    expect([...DESIGN_IDS]).toEqual(['quiet', 'field', 'app', 'report', 'story']);
    for (const id of DESIGN_IDS) {
      const d = getDeckDesign(id);
      expect(d.id).toBe(id);
      expect(designErrors(d)).toEqual([]);
      expect(d.slots.B1.maxItems).toBeGreaterThanOrEqual(4);
      expect(d.slots.B3.maxItems).toBeGreaterThan(0);
      expect(d.slots.B3.needs.length).toBeGreaterThan(0);
      expect(d.overflowOrder).toEqual(['abbreviate', 'shrink-once', 'more-count', 'next-slide']);
    }
  });

  it('형식이 깨진 프리셋은 이유를 돌려준다', () => {
    const broken = { ...getDeckDesign('quiet'), slots: { B1: getDeckDesign('quiet').slots.B1 } };
    expect(designErrors(broken).join(' ')).toContain('B3');
    expect(designErrors({ id: 'x' }).length).toBeGreaterThan(0);
    const badColor = structuredClone(getDeckDesign('app'));
    (badColor.tokens.colors as Record<string, string>).ink = 'blue';
    expect(designErrors(badColor).join(' ')).toContain('ink');
  });

  it('px → 인치 환산은 한 곳(designScale) — 16:9 에서 1920px = 13.333in, 글자 1px = 0.5pt', () => {
    const s = designScale(13.333, 7.5);
    expect(s.x(1920)).toBeCloseTo(13.333, 3);
    expect(s.y(1080)).toBeCloseTo(7.5, 3);
    expect(s.pt(64)).toBeCloseTo(32, 1);
  });

  it('글자색 대비 4.5:1 이상(프리셋이 적은 글자–바탕 짝 전부)', () => {
    expect(contrastRatio('FFFFFF', '000000')).toBeCloseTo(21, 0);
    for (const id of DESIGN_IDS) {
      const d = getDeckDesign(id);
      expect(d.textPairs.length).toBeGreaterThanOrEqual(3);
      for (const [fg, bg] of d.textPairs) {
        const r = contrastRatio(d.tokens.colors[fg]!, d.tokens.colors[bg]!);
        expect(r, `${id} ${fg}/${bg} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('「1/2」·날짜 칸이 한 줄 폭 추정(capacityOf) 안에 든다', () => {
    for (const id of DESIGN_IDS) {
      for (const [w, h] of [[13.333, 7.5], [11.69, 8.27]] as const) {
        const b = fixedTextBoxes(getDeckDesign(id), designScale(w, h));
        expect(capacityOf(b.kpiValue.wIn, b.kpiValue.pt, 1), `${id} kpi`).toBeGreaterThanOrEqual(textUnits('1/2'));
        expect(capacityOf(b.date.wIn, b.date.pt, 1), `${id} date`).toBeGreaterThanOrEqual(textUnits('2026-12-20'));
      }
    }
  });

  it('장 제목(「(1/2)」 포함)은 한 번만 줄여 한 줄에 든다 — 하한 20pt', () => {
    const titles = ['이번 회의에서 정한 것', '새로 생기거나 바뀐 위험 (1/2)', '이번에 정한 대책 (1/2)', '여러분 의견은 이렇게 처리했습니다 (1/2)', '지난번 대책은 어떻게 됐나 (1/2)', '다음으로 미룬 것 (1/2)', '공유 확인'];
    for (const id of DESIGN_IDS) {
      for (const t of titles) {
        const f = fitHeadTitle(getDeckDesign(id), designScale(13.333, 7.5), t);
        expect(f.pt, `${id} ${t}`).toBeGreaterThanOrEqual(20);
        expect(capacityOf(f.wIn, f.pt, 1), `${id} ${t}`).toBeGreaterThanOrEqual(textUnits(t));
      }
    }
  });
});

describe('프리셋 미지정 = 지금 출력 그대로(슬라이드 XML 해시)', () => {
  const GOLDEN = {
    base: { A4: 'a8874b37bb45f574d9d55952d5f2aa570dc50191ff442fd6a606a33c8ca43ef7', wide: 'd9e063c498ff79c5b4635ad291ef1dcb38a465e11f4d530580810c3881cc6425' },
    nine: { A4: '40fc3e1be9735cae7a46059efc00b6819850f03a0126132c97435db937570edf', wide: '8afd9a245a0c99b38fd1ab873cffc5b697dd980bfac67c17f7a792db84f43a85' },
    empty: { A4: '4e2455938dcbbcd71c14caa8c30837b58ef26063c37e864f0ced9db83948b71a', wide: '74ff6690eb02ef1dbba4e8453f6b82538606d48b50350657aa579774674c485e' },
  };
  const cases = {
    base: () => finalSnapshotForDesign(),
    nine: () => manyActions(9),
    empty: () => ({ ...manyActions(0), deferred: [], opinions: [] }),
  };
  for (const k of ['base', 'nine', 'empty'] as const) {
    it(`${k} — A4·16:9`, async () => {
      expect(await slideHash((await makeBroadcastPptx(cases[k]())).bytes!)).toBe(GOLDEN[k].A4);
      expect(await slideHash((await makeBroadcastPptx(cases[k](), { design: undefined })).bytes!)).toBe(GOLDEN[k].A4);
      expect(await slideHash((await makeBroadcastPptx(cases[k](), { layout: '16:9' })).bytes!)).toBe(GOLDEN[k].wide);
    });
  }
});

describe('프리셋별 B1·B3 부품', () => {
  for (const id of DESIGN_IDS) {
    it(`${id} — B1·B3 에 그 프리셋 고유 부품 도형, 다른 프리셋 부품은 없음`, async () => {
      const r = await makeBroadcastPptx(finalSnapshotForDesign(), { design: id });
      expect(r.ok, (r.errors ?? []).join()).toBe(true);
      expect(r.slides.map((s) => s.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
      const xml = await slideXmls(r.bytes!);
      const b1 = names(xml[0]);
      const b3 = names(xml[2]);
      expect(b1).toContain(PART_MARK[id].b1);
      expect(b3).toContain(PART_MARK[id].b3);
      for (const other of DESIGN_IDS.filter((o) => o !== id)) {
        expect(b1).not.toContain(PART_MARK[other].b1);
        expect(b3).not.toContain(PART_MARK[other].b3);
      }
      if (PART_MARK[id].head) for (const x of xml) expect(names(x)).toContain(PART_MARK[id].head);
      // 표 칸 여백이 인치로 읽혀 칸이 무너지지 않았는지(여백 1in 미만) — pptxgenjs 는 위 여백이 1 미만이면 인치로 읽는다
      for (const x of [xml[0], xml[2]]) for (const m of x.matchAll(/mar[LR]="(\d+)"/g)) expect(Number(m[1])).toBeLessThan(914400);
      // 내용은 스냅숏 원문 그대로
      const all = xml.join('\n');
      for (const m of ['통로 조명 교체', '사다리 상단 고정 장치 설치·2인 1조 작업', '후방 경보기 월 1회 작동 점검', '2026-12-20', '1/2']) expect(all).toContain(m);
      expect(all).not.toMatch(/…|\.\.\./);
    });
  }

  it('나머지 장(B2·B4~B7)은 프리셋 색을 받는다 — report 남색', async () => {
    const r = await makeBroadcastPptx(finalSnapshotForDesign(), { design: 'report' });
    const xml = await slideXmls(r.bytes!);
    expect(xml[1]).toContain('1B2A4A');
    expect(xml[3]).toContain('1B2A4A');
  });

  it('프리셋을 고르고 판형을 안 주면 16:9', async () => {
    const r = await makeBroadcastPptx(finalSnapshotForDesign(), { design: 'quiet' });
    const zip = await JSZip.loadAsync(r.bytes!);
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    expect(pres).toMatch(/<p:sldSz cx="12192000" cy="6858000"/);
  });

  it('없는 프리셋 이름은 오류(기본값으로 바꿔 만들지 않음)', async () => {
    const r = await makeBroadcastPptx(finalSnapshotForDesign(), { design: 'neon' as never });
    expect(r.ok).toBe(false);
    expect(r.errors!.join(' ')).toContain('design');
  });
});

describe('needs 거르기와 넘침 순서', () => {
  it('대책 3건 스냅숏은 5종 모두 담을 수 있다', () => {
    const r = designsFor(finalSnapshotForDesign());
    expect(r.map((x) => x.id)).toEqual([...DESIGN_IDS]);
    for (const x of r) expect(x.ok, `${x.id} ${x.reason}`).toBe(true);
  });

  it('대책 20건 스냅숏은 ok=false 와 이유(대책 장 한 장 한도)', () => {
    const r = designsFor(manyActions(20));
    for (const x of r) {
      expect(x.ok).toBe(false);
      expect(x.reason).toContain('20');
      expect(x.reason).toContain('대책');
    }
  });

  for (const id of DESIGN_IDS) {
    it(`${id} — 대책 20건: 말줄임 없이 20건 전부 싣고, 「외 N건」 뒤 다음 장, warnings 에 단계 기록`, async () => {
      const r = await makeBroadcastPptx(manyActions(20), { design: id });
      expect(r.ok).toBe(true);
      const b3 = r.slides.filter((s) => s.code === 'B3');
      expect(b3.length).toBeGreaterThan(1);
      const xml = await slideXmls(r.bytes!);
      const all = xml.join('\n');
      for (let i = 1; i <= 20; i++) expect(all).toContain(`대책 ${i} 통로 조명 교체`);
      expect(all).not.toMatch(/…|\.\.\./);
      const firstB3 = xml[b3[0].no - 1];
      expect(firstB3).toMatch(/외 \d+건/);
      expect(r.warnings.join(' ')).toContain('B3');
      expect(r.warnings.join(' ')).toMatch(/외 \d+건/);
    });
  }
});

describe('라이브러리 입구', () => {
  it('design 을 넘기고 designsFor·DESIGN_IDS 를 내보낸다', async () => {
    expect([...LIB_DESIGN_IDS]).toEqual([...DESIGN_IDS]);
    expect(libDesignsFor(finalSnapshotForDesign()).every((x) => x.ok)).toBe(true);
    const r = await libBroadcast(finalSnapshotForDesign(), { limits: DEFAULT_LIMITS, design: 'field' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const xml = await slideXmls(r.files![0].bytes);
    expect(names(xml[0])).toContain('part:tile-grid');
  });
});
