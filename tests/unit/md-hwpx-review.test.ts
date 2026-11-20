import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mdDocXml, mdToHwpx, parseMarkdown, type MdFeatures } from '@/lib/md-hwpx';
import { checkHeader } from '@/lib/md-hwpx/header-check';
import { CHAR, PARA, getItem, paraMargins } from '@/lib/md-hwpx/header-edit';
import { mdToHwpxWithTemplate } from '@/lib/md-hwpx/template';

// pstack interrogate 261119 Act on — 생성기 쪽(병합 격자·양식+기능·줄 전체 강조·날짜·그림 경로)
const doc = (md: string, features: MdFeatures) => mdDocXml(parseMarkdown(md, { features }), { features });
const cellsOf = (section: string) =>
  [...section.matchAll(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/><hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"\/>/g)].map((m) => ({ col: +m[1], row: +m[2], cs: +m[3], rs: +m[4] }));
const area = (section: string) => cellsOf(section).reduce((s, c) => s + c.cs * c.rs, 0);

describe('가로+세로 병합 격자', () => {
  const both = { table: { merge: true, vmerge: true } };
  it.each([
    ['가로 병합 칸 아래 「^」 하나(부분)', '| A | B | C |\n|---|---|---|\n| h | h | h |\n| a | b | < |\n| x | ^ | y |', 4, 3],
    ['2×2 블록', '| A | B | C |\n|---|---|---|\n| a | < | 1 |\n| ^ | ^ | 2 |', 3, 3],
    ['블록 아래 한 칸만 「^」', '| A | B |\n|---|---|\n| a | < |\n| ^ | z |', 3, 2],
  ])('%s — 칸 넓이 합 = 행×열, S0 통과', (_, md, rows, cols) => {
    const { header, section } = doc(md, both);
    expect(area(section)).toBe(rows * cols);
    expect(checkHeader(header, section)).toEqual([]);
  });
  it('2×2 블록은 colSpan 2 · rowSpan 2 한 칸', () => {
    const c = cellsOf(doc('| A | B | C |\n|---|---|---|\n| a | < | 1 |\n| ^ | ^ | 2 |', both).section);
    expect(c.find((x) => x.row === 1 && x.col === 0)).toMatchObject({ cs: 2, rs: 2 });
  });
});

describe('S3 — 줄 전체 강조는 기호 내어쓰기와 무관', () => {
  it('들여쓰기를 켜지 않아도 기호 줄 전체 ** 는 굵게만(밑줄 없음)', () => {
    const { header, section } = doc('- **목록 줄 강조**', { underline: true });
    const id = Number(/charPrIDRef="(\d+)"><hp:t>목록 줄 강조<\/hp:t>/.exec(section)![1]);
    const x = getItem(header, CHAR, id);
    expect(x).toContain('<hh:bold/>');
    expect(x).toContain('<hh:underline type="NONE"');
  });
});

describe('S2 — 날짜는 기호가 아니다', () => {
  it('「2026. 11. 19. 기준」 문단은 내어쓰기 0', () => {
    const { header, section } = doc('2026. 11. 19. 기준 현황', { indent: true });
    const pp = Number(/<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*>(?:(?!<\/hp:p>)[\s\S])*2026\. 11\. 19\./.exec(section)![1]);
    expect(paraMargins(header, pp).case.intent ?? 0).toBe(0);
  });
});

describe('S10 — 그림 설명에 PC 경로를 넣지 않는다', () => {
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAE/wH/YeSuJgAAAABJRU5ErkJggg==', 'base64'));
  it('캡션 없는 그림의 shapeComment·캡션은 파일 이름만', async () => {
    const src = 'C:/사건자료/비공개폴더/흐름.png';
    const z = await JSZip.loadAsync(await mdToHwpx(`![](${src})`, { features: { image: true }, images: { [src]: PNG } }));
    const section = await z.file('Contents/section0.xml')!.async('string');
    expect(section).toContain('<hp:shapeComment>흐름.png</hp:shapeComment>');
    expect(section).not.toContain('비공개폴더');
  });
});

describe('S13 — 양식 + 기능', () => {
  it('기호 내어쓰기·밑줄을 켜도 양식 본문 모양(줄간격·글자 크기)을 물려받는다', async () => {
    const z = await JSZip.loadAsync(await mdToHwpx('# 양식 제목\n\n양식 본문 예시 문장이다.'));
    let h = await z.file('Contents/header.xml')!.async('string');
    const s = await z.file('Contents/section0.xml')!.async('string');
    const bodyPara = Number(/paraPrIDRef="(\d+)"[^>]*><hp:run charPrIDRef="\d+"><hp:t>\s*양식 본문 예시/.exec(s)![1]);
    const bodyChar = Number(/charPrIDRef="(\d+)"><hp:t>\s*양식 본문 예시/.exec(s)![1]);
    // 양식 본문 모양을 눈에 띄는 값으로: 줄간격 777%, 글자 11.7pt
    h = h.replace(new RegExp(`<hh:paraPr id="${bodyPara}"[\\s\\S]*?</hh:paraPr>`), (x) => x.replace(/(<hh:lineSpacing type="PERCENT" value=")\d+"/g, '$1777"'));
    h = h.replace(new RegExp(`(<hh:charPr id="${bodyChar}"[^>]*\\bheight=")\\d+"`), '$11170"');
    z.file('Contents/header.xml', h);
    const tpl = await z.generateAsync({ type: 'uint8array' });
    const out = await JSZip.loadAsync(
      await mdToHwpxWithTemplate('# 새 문서\n\n○ 기호 문단이다\n\n문장 **강조 낱말** 끝.', tpl, { samples: { body: '양식 본문 예시' }, features: { indent: true, underline: true } }),
    );
    const oh = await out.file('Contents/header.xml')!.async('string');
    const os = await out.file('Contents/section0.xml')!.async('string');
    const mk = /<hp:p [^>]*paraPrIDRef="(\d+)"[^>]*><hp:run charPrIDRef="(\d+)"><hp:t>○ 기호 문단이다/.exec(os)!;
    const para = getItem(oh, PARA, Number(mk[1]));
    expect(para).toContain('<hh:lineSpacing type="PERCENT" value="777"');
    expect(paraMargins(oh, Number(mk[1])).case.intent).toBeLessThan(0);
    expect(getItem(oh, CHAR, Number(mk[2]))).toMatch(/\bheight="1170"/);
    const em = Number(/charPrIDRef="(\d+)"><hp:t>강조 낱말<\/hp:t>/.exec(os)![1]);
    const emx = getItem(oh, CHAR, em);
    expect(emx).toMatch(/\bheight="1170"/);
    expect(emx).toContain('<hh:underline type="BOTTOM"');
    expect(checkHeader(oh, os)).toEqual([]);
  });
});
