import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HwpDocument, initSync } from '@rhwp/core';
import { HEADER_XML } from '@/lib/contract-write/hwpx-header';
import { mdDocXml, mdSectionXml, mdToHwpx, parseMarkdown, presetHeader } from '@/lib/md-hwpx';
import { mdToHwpxWithTemplate } from '@/lib/md-hwpx/template';

// 261124 — 4열 표가 많은 검토의견서(가상 원고). 가로 용지 · 표 칸 어절 단위 줄 나눔 · 표 칸 줄간격
//
// 가로 용지 근거(추측 아님):
//  1) 기존 코드 src/lib/work-rules-report/render.ts:311 — 가로 = SEC_PR 의 landscape="WIDELY" 를 "NARROWLY" 로만 바꾸고
//     width/height(59528×84186)는 그대로 둔다. 본문 폭은 :265 LANDSCAPE_BODY_W = 84186 - 5670*2(세로 용지의 높이 - 좌우 여백).
//     시험 tests/unit/nosa-council-rules-compare.test.ts:94 가 hwpx 가로 출력에 landscape="NARROWLY" 를 단언한다.
//  2) 저장소의 한글 렌더러 rhwp(@rhwp/core 0.8.7)로 네 조합을 열어 본 결과(261124, 아래 「rhwp 로 열어 본다」 시험이 고정):
//     WIDELY  59528×84186 → 쪽 793.7×1122.5px(세로) · NARROWLY 59528×84186 → 1122.5×793.7(가로)
//     NARROWLY 84186×59528 → 793.7×1122.5(두 번 돌아 세로) · WIDELY 84186×59528 → 1122.5×793.7
//     → NARROWLY = 가로, width/height 는 용지 원래 치수(세로 기준) 그대로. 둘 다 바꾸면 다시 세로가 된다.
//  3) 여백은 돌지 않는다 — tribunal(위 12758·아래 8505)을 NARROWLY 로 열면 본문 열 폭 971.3px = (84186-5670*2)/75,
//     꼬리말 y = 793.7 - 113.4 - 56.7. 위·아래 여백은 가로 쪽의 위·아래에 그대로 붙는다.
//     그래서 가로의 본문 폭 = height - left - right, 본문 높이 = width - top - bottom.
//  - 저장소 안에 한글로 저장한 가로 hwpx 견본은 없다(tests/fixtures/laws/*.hwpx 두 개는 rhwp 가 만든 세로 WIDELY).
const MD = [
  '# 가상 검토의견서',
  '',
  '## 1. 쟁점별 검토',
  '',
  '| 쟁점 | 근로자 측 주장 | 회사 측 주장 | 검토 의견 |',
  '|---|---|---|---|',
  '| 단체협약상해고합의조항의적용범위 | 조합원해고자에게합의가필요하다는주장 | 합의해도절차상하자는없다는주장 | 합의조항은조합원인해고자에게만적용된다고보는것이타당하다 |',
  '| 징계절차 | 소명 기회가 없었다 | 서면으로 통지하였다 | 통지서 수령 여부를 더 확인한다 |',
  '',
  '본문 문단.',
].join('\n');

const pagePr = (sec: string) => /<hp:pagePr\b[^>]*>/.exec(sec)![0];
const tblW = (sec: string) => [...sec.matchAll(/<hp:tbl\b[\s\S]*?<hp:sz width="(\d+)"/g)].map((m) => Number(m[1]));
const paraPr = (h: string, id: number) => new RegExp(`<hh:paraPr id="${id}"[\\s\\S]*?</hh:paraPr>`).exec(h)![0];
const ls = (h: string, id: number) => [...paraPr(h, id).matchAll(/lineSpacing type="PERCENT" value="(\d+)"/g)].map((m) => Number(m[1]));
const brk = (h: string, id: number) => /breakNonLatinWord="(\w+)"/.exec(paraPr(h, id))![1];

describe('용지 방향(orientation)', () => {
  const items = parseMarkdown(MD);
  it('기본(portrait)은 지금과 같은 구역 — landscape 가 들어가지 않는다', () => {
    const def = mdSectionXml(items);
    expect(mdSectionXml(items, { orientation: 'portrait' })).toBe(def);
    expect(pagePr(def)).toContain('landscape="WIDELY" width="59528" height="84186"');
    expect(def).not.toContain('NARROWLY');
    expect(tblW(def)).toEqual([59528 - 5670 * 2]);
  });
  it('landscape = NARROWLY, 치수는 그대로(바꾸면 rhwp 에서 다시 세로), 표 폭은 가로 본문 폭', () => {
    for (const preset of ['internal', 'tribunal'] as const) {
      const sec = mdSectionXml(items, { preset, orientation: 'landscape' });
      expect(pagePr(sec)).toContain('landscape="NARROWLY" width="59528" height="84186"');
      expect(tblW(sec)).toEqual([84186 - 5670 * 2]);
    }
  });
  it('열 폭 fit 도 가로 폭을 나눈다', () => {
    const fit = { features: { table: { width: 'fit' as const } } };
    const sec = mdSectionXml(parseMarkdown(MD, fit), { ...fit, orientation: 'landscape' });
    const cells = [.../<hp:tr>[\s\S]*?<\/hp:tr>/.exec(sec)![0].matchAll(/<hp:cellSz width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(cells).toHaveLength(4);
    expect(cells.reduce((s, x) => s + x, 0)).toBe(84186 - 5670 * 2);
  });
  it('본문 높이도 가로를 따른다 — 세로에서 글자처럼 두던 표가 가로에서는 떠 있는 표', () => {
    // 한 줄 행 20개: 세로 본문 높이 72846 의 55% 미만, 가로 본문 높이 48188 의 55% 이상
    const rows = ['| 가 | 나 |', '|---|---|', ...Array.from({ length: 20 }, (_, i) => `| ${i} | 값 |`)].join('\n');
    const it2 = parseMarkdown(rows);
    expect(mdSectionXml(it2)).toContain('treatAsChar="1"');
    expect(mdSectionXml(it2, { orientation: 'landscape' })).toContain('treatAsChar="0"');
  });
  it('알 수 없는 방향은 멈춘다', () => {
    expect(() => mdDocXml(items, { orientation: 'sideways' as never })).toThrow('orientation');
  });
  it('rhwp 로 열어 본다 — landscape 는 가로 쪽, 본문 열 폭 = 가로 본문 폭', async () => {
    initSync({ module: readFileSync(join(dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json')), 'rhwp_bg.wasm')) });
    const info = async (o: object) => JSON.parse(new HwpDocument(await mdToHwpx(MD, o)).getPageInfo(0));
    const p = await info({});
    const l = await info({ preset: 'tribunal', orientation: 'landscape' });
    expect(p.width).toBeLessThan(p.height);
    expect(l.width).toBeGreaterThan(l.height);
    expect(l.columns[0].width).toBeCloseTo((84186 - 5670 * 2) / 75, 0);
  });
  it('양식(--template)의 쪽 설정이 우선 — orientation 을 줘도 양식 pagePr 그대로', async () => {
    const tpl = await mdToHwpx('# 양식\n\n양식 본문 예시.');
    const out = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, tpl, { orientation: 'landscape' }));
    const sec = await out.file('Contents/section0.xml')!.async('string');
    expect(pagePr(sec)).toContain('landscape="WIDELY" width="59528" height="84186"');
    expect(tblW(sec)).toEqual([59528 - 5670 * 2]);
  });
});

describe('표 칸 문단(27~29) — 어절 단위 줄 나눔·줄간격', () => {
  it('표 칸은 BREAK_WORD, 본문(20)과 공용 바탕(HEADER_XML)은 그대로', () => {
    for (const preset of ['internal', 'tribunal'] as const) {
      const h = presetHeader(preset);
      for (const id of [27, 28, 29]) expect(brk(h, id)).toBe('BREAK_WORD');
      expect(brk(h, 20)).toBe(brk(HEADER_XML, 20));
    }
    expect(brk(HEADER_XML, 27)).toBe('KEEP_WORD'); // 근로계약서·서식 작성기가 같은 바탕을 쓴다 — 바탕은 고치지 않는다
  });
  it('표 칸 줄간격 기본 150, tableLineSpacing 으로 바꾼다(본문 줄간격은 그대로)', async () => {
    for (const id of [27, 28, 29]) expect(ls(presetHeader('internal'), id)).toEqual([150, 150]);
    const z = await JSZip.loadAsync(await mdToHwpx(MD, { preset: 'tribunal', tableLineSpacing: 200 }));
    const h = await z.file('Contents/header.xml')!.async('string');
    for (const id of [27, 28, 29]) expect(ls(h, id)).toEqual([200, 200]);
    expect(ls(h, 20)).toEqual([200, 200]); // tribunal 본문 200
    const zi = await JSZip.loadAsync(await mdToHwpx(MD, { tableLineSpacing: 120 }));
    expect(ls(await zi.file('Contents/header.xml')!.async('string'), 20)).toEqual([160, 160]);
  });
  it('행 높이 추정도 줄간격을 따른다', () => {
    const items = parseMarkdown(MD);
    const h = (o: object) => Number(/<hp:tbl\b[\s\S]*?<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="(\d+)"/.exec(mdSectionXml(items, o))![1]);
    expect(h({ tableLineSpacing: 200 })).toBeGreaterThan(h({}));
    expect(h({})).toBeGreaterThan(h({ tableLineSpacing: 100 }));
  });
  it('범위(100~250 정수) 밖은 멈춘다', async () => {
    const items = parseMarkdown(MD);
    for (const v of [99, 251, 150.5, Number.NaN]) {
      expect(() => mdDocXml(items, { tableLineSpacing: v })).toThrow('tableLineSpacing');
      await expect(mdToHwpx(MD, { tableLineSpacing: v })).rejects.toThrow('tableLineSpacing');
    }
    expect(() => mdDocXml(items, { tableLineSpacing: 100 })).not.toThrow();
    expect(() => mdDocXml(items, { tableLineSpacing: 250 })).not.toThrow();
  });
  it('양식 모드에도 표 칸 모양이 옮겨 간다', async () => {
    const tpl = await mdToHwpx('# 양식\n\n양식 본문 예시.');
    const z = await JSZip.loadAsync(await mdToHwpxWithTemplate(MD, tpl, { tableLineSpacing: 180 }));
    const h = await z.file('Contents/header.xml')!.async('string');
    const s = await z.file('Contents/section0.xml')!.async('string');
    const cellPara = Number(/<hp:tc\b[^>]*><hp:subList[^>]*><hp:p id="\d+" paraPrIDRef="(\d+)"/.exec(s)![1]);
    expect(brk(h, cellPara)).toBe('BREAK_WORD');
    expect(ls(h, cellPara)).toEqual([180, 180]);
  });
});
