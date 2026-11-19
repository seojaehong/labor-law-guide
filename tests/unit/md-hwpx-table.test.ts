import { describe, expect, it } from 'vitest';
import { fitWidths, mdDocXml, parseMarkdown, type MdFeatures } from '@/lib/md-hwpx';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { BORDER, getItem } from '@/lib/md-hwpx/header-edit';

// 편집 기술 조각 S5(표 배치)·S6(열 폭)·S7(삼선표)
const doc = (md: string, features: MdFeatures) => mdDocXml(parseMarkdown(md, { features }), { features });
const TABLE = '| 구분 | 담당 | 내용 |\n|---|---|---|\n| 1 | 책임연구원 | 긴 설명 문장이 여기에 들어가고 칸 하나를 넉넉히 차지한다 긴 설명 문장이 여기에 들어간다 |\n| 2 | 연구원 | 짧음 |\n\n## 다음 제목';
const tcs = (section: string) => [...section.matchAll(/<hp:tc [^>]*borderFillIDRef="(\d+)"[\s\S]*?<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>[\s\S]*?<hp:cellSz width="(\d+)" height="(\d+)"\/><hp:cellMargin left="(\d+)" right="\d+" top="(\d+)"/g)].map((m) => ({ bf: +m[1], col: +m[2], row: +m[3], w: +m[4], h: +m[5], mLR: +m[6], mTB: +m[7] }));
const USABLE = 59528 - 5670 * 2;

describe('S5 — 표 배치 불변식과 선택값', () => {
  it('기본: 첫 행 tc 전부 header=1, rowAddr = 행 번호, sz height ≥ 행 높이 합', () => {
    const { section } = doc(TABLE, {});
    expect([...section.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>/g)][0][1].match(/header="1"/g)).toHaveLength(3);
    const cells = tcs(section);
    for (const c of cells) expect(c.row).toBe(Math.floor(cells.indexOf(c) / 3));
    const total = Number(/<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="(\d+)"/.exec(section)![1]);
    const rowSum = [0, 1, 2].reduce((s, r) => s + cells.find((c) => c.row === r)!.h, 0);
    expect(total).toBeGreaterThanOrEqual(rowSum);
    expect(section).toContain('pageBreak="CELL"');
  });
  it('float: treatAsChar 0 + outMargin bottom 850, 표 뒤 제목 앞에 빈 문단 / pageBreak TABLE', () => {
    const { section } = doc(TABLE, { table: { float: true, pageBreak: 'TABLE' } });
    expect(section).toContain('treatAsChar="0"');
    expect(/<hp:outMargin left="0" right="0" top="0" bottom="(\d+)"/.exec(section)![1]).toBe('850');
    expect(section).toContain('pageBreak="TABLE"');
    expect(section).toMatch(/<\/hp:tbl><hp:t\/><\/hp:run><\/hp:p><hp:p [^>]*paraPrIDRef="20"[^>]*><hp:run charPrIDRef="7"\/><\/hp:p><hp:p [^>]*paraPrIDRef="22"/);
  });
});

describe('S6 — 열 폭', () => {
  it('fit: 「책임연구원」 칸 폭 ≥ 낱말 폭 + 여백, 폭 합 = 본문 폭, 짧은 열은 제 폭만', () => {
    const { section } = doc(TABLE, { table: { width: 'fit' } });
    const row0 = tcs(section).filter((c) => c.row === 0);
    expect(row0.reduce((s, c) => s + c.w, 0)).toBe(USABLE);
    const half = Math.floor((1200 - 200) / 2);
    const pad = 510 * 2 + 200;
    expect(row0[1].w).toBeGreaterThanOrEqual(10 * half + pad); // 책임연구원 = 표시 폭 10
    expect(row0[2].w).toBeGreaterThan(row0[1].w);
    expect(row0[0].w).toBeLessThan(row0[1].w);
  });
  it('구분행 대시 수가 다르면 그 비율', () => {
    const md = '| 가 | 나 |\n|--|------|\n| 1 | 2 |';
    const { section } = doc(md, { table: { width: 'fit' } });
    const [a, b] = tcs(section).filter((c) => c.row === 0).map((c) => c.w);
    expect(a + b).toBe(USABLE);
    expect(Math.abs(b / a - 3)).toBeLessThan(0.01);
  });
  it('46자 무공백 덩어리 한 칸이 다른 열을 깎지 않는다(바닥 = 최장 낱말)', () => {
    const w = fitWidths([['항목', '설명'], ['가', 'x'.repeat(46)], ['책임연구원', '짧다']], USABLE, 500, 1220);
    expect(w[0]).toBeGreaterThanOrEqual(10 * 500 + 1220);
    expect(w.reduce((s, x) => s + x, 0)).toBe(USABLE);
  });
});

describe('S8 — 가로 병합', () => {
  const md = '| 구분 | 1분기 | 2분기 | 3분기 |\n|---|---|---|---|\n| 합계 | 300 | < | < |\n| 가 | 1 | 2 | 3 |\n| 나 | 소계 | < | 9 |';
  it('행마다 span 합 = colCnt, colAddr = 누적 위치, cellSz 합 = 표 폭', () => {
    const { header, section } = doc(md, { table: { merge: true, style: 'threeLine' } });
    expect(section).toContain('colCnt="4"');
    const trs = [...section.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>/g)].map((m) =>
      [...m[1].matchAll(/<hp:cellAddr colAddr="(\d+)" rowAddr="\d+"\/><hp:cellSpan colSpan="(\d+)" rowSpan="1"\/><hp:cellSz width="(\d+)"/g)].map((c) => ({ col: +c[1], span: +c[2], w: +c[3] })),
    );
    expect(trs.map((r) => r.length)).toEqual([4, 2, 4, 3]);
    for (const r of trs) {
      expect(r.reduce((s, c) => s + c.span, 0)).toBe(4);
      let at = 0;
      for (const c of r) {
        expect(c.col).toBe(at);
        at += c.span;
      }
      expect(r.reduce((s, c) => s + c.w, 0)).toBe(USABLE);
    }
    expect(section).not.toContain('<hp:t>&lt;</hp:t>');
    expect(checkHeader(header, section)).toEqual([]);
  });
  it('끄면 「<」 는 글자 그대로', () => {
    expect(doc(md, {}).section).toContain('<hp:t>&lt;</hp:t>');
  });
});

describe('S7 — 삼선표', () => {
  it('머리·가운데·끝 행 테두리가 위치별, 바깥 세로선 없음, 칸 여백 283/113, 칸 줄간격 110%', () => {
    const { header, section } = doc(TABLE, { table: { style: 'threeLine' } });
    const cells = tcs(section);
    const bf = (r: number, c: number) => getItem(header, BORDER, cells.find((x) => x.row === r && x.col === c)!.bf);
    expect(bf(0, 0)).toContain('<hh:topBorder type="SOLID" width="0.4 mm"');
    expect(bf(0, 0)).toContain('<hh:leftBorder type="NONE"');
    expect(bf(0, 0)).toContain('faceColor="#E5E5E5"');
    expect(bf(1, 1)).toContain('<hh:bottomBorder type="SOLID" width="0.12 mm"');
    expect(bf(1, 1)).toContain('<hh:leftBorder type="SOLID"');
    expect(bf(2, 2)).toContain('<hh:bottomBorder type="SOLID" width="0.3 mm"');
    expect(bf(2, 2)).toContain('<hh:rightBorder type="NONE"');
    expect(new Set(cells.map((c) => c.bf)).size).toBe(9);
    for (const c of cells) expect([c.mLR, c.mTB]).toEqual([283, 113]);
    const pp = Number(/<hp:subList id="" [^>]*><hp:p [^>]*paraPrIDRef="(\d+)"/.exec(section)![1]); // 바닥글 subList(id="0") 제외
    expect(new RegExp(`<hh:paraPr id="${pp}"[\\s\\S]*?</hh:paraPr>`).exec(header)![0].match(/value="110"/g)).toHaveLength(2);
    expect(checkHeader(header, section)).toEqual([]);
  });
});
