import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { mdToHwpx } from '@/lib/md-hwpx';
import { fillCells, replaceText } from '@/lib/md-hwpx/postedit';

// S11 글자 치환 · S12 칸 채우기 — 사람이 손본 문서는 header 를 바이트 그대로 두고 글자만 바꾼다
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const parts = async (b: Uint8Array) => {
  const z = await JSZip.loadAsync(b);
  return {
    names: Object.keys(z.files),
    header: await z.file('Contents/header.xml')!.async('uint8array'),
    section: await z.file('Contents/section0.xml')!.async('string'),
  };
};
const MD = '# 보고\n\n첫 문장은 **강조 부분**과 보통 부분이다.\n\n둘째 문장에 고유한 낱말이 있다.\n\n반복 반복\n\n| 항목 | 값 |\n|---|---|\n| 가 | 1 |\n| 나 |  |';
// 한글이 저장한 문서처럼 linesegarray 를 문단마다 넣어 둔다
const withLineseg = async (b: Uint8Array) => {
  const z = await JSZip.loadAsync(b);
  const s = await z.file('Contents/section0.xml')!.async('string');
  z.file('Contents/section0.xml', s.replace(/<\/hp:p>/g, '<hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p>'));
  return z.generateAsync({ type: 'uint8array' });
};

describe('S11 — 글자 치환', () => {
  it('header 해시 동일, 고친 문단만 linesegarray 없음, 문단 수 동일, 미리보기', async () => {
    const src = await withLineseg(await mdToHwpx(MD));
    const a = await parts(src);
    const { bytes, preview } = await replaceText(src, [{ old: '고유한 낱말', new: '바뀐 낱말' }]);
    const b = await parts(bytes);
    expect(sha(b.header)).toBe(sha(a.header));
    expect(b.section).toContain('바뀐 낱말');
    expect(b.section.match(/<hp:p /g)!.length).toBe(a.section.match(/<hp:p /g)!.length);
    expect(b.section.match(/<hp:linesegarray>/g)!.length).toBe(a.section.match(/<hp:linesegarray>/g)!.length - 1);
    expect(/<hp:t>\s*둘째 문장에 바뀐 낱말이 있다.<\/hp:t><\/hp:run><\/hp:p>/.test(b.section)).toBe(true);
    expect(preview[0]).toMatchObject({ old: '고유한 낱말', new: '바뀐 낱말', before: '  둘째 문장에 ', after: '이 있다.' });
    expect(b.names[0]).toBe('mimetype');
  });
  it('0회·2회·run 경계 걸침은 거부하고 아무것도 바꾸지 않는다', async () => {
    const src = await mdToHwpx(MD);
    await expect(replaceText(src, [{ old: '없는 글자', new: 'x' }])).rejects.toThrow('없습니다');
    await expect(replaceText(src, [{ old: '반복', new: 'x' }])).rejects.toThrow('2번');
    await expect(replaceText(src, [{ old: '강조 부분과', new: 'x' }])).rejects.toThrow('경계');
    // 앞 치환이 맞아도 뒤가 거부되면 전체 거부
    await expect(replaceText(src, [{ old: '고유한', new: 'x' }, { old: '반복', new: 'y' }])).rejects.toThrow('2번');
  });
  it('특수문자(& < >)를 그대로 다룬다', async () => {
    const src = await mdToHwpx('# t\n\nA&B 회사와 C 회사');
    const { bytes } = await replaceText(src, [{ old: 'A&B 회사', new: '<가>&나' }]);
    expect((await parts(bytes)).section).toContain('&lt;가&gt;&amp;나');
  });
});

describe('S12 — 칸 채우기', () => {
  // 예시 서식: 칸 글자 모양을 파란 기울임으로 바꾼 양식
  const blueForm = async () => {
    const z = await JSZip.loadAsync(await mdToHwpx(MD));
    const h = await z.file('Contents/header.xml')!.async('string');
    // 13번(표 글자)을 파랑·기울임으로 — 같은 크기의 검정 글자 모양(15·13 외)은 header 에 이미 있다
    const blue = h.replace(/(<hh:charPr id="13"[^>]*textColor=")#000000"/, '$1#0000FF"').replace(/(<hh:charPr id="13"[\s\S]*?<hh:offset[^>]*\/>)/, '$1<hh:italic/>');
    z.file('Contents/header.xml', blue);
    return z.generateAsync({ type: 'uint8array' });
  };
  it('대상 칸 run 이 검정·기울임 없음, subList 여닫음 수 동일, header 그대로', async () => {
    const src = await blueForm();
    const a = await parts(src);
    const out = await fillCells(src, [{ table: 0, row: 2, col: 1, text: '채운 값' }]);
    const b = await parts(out);
    expect(sha(b.header)).toBe(sha(a.header));
    const run = /charPrIDRef="(\d+)"><hp:t>채운 값<\/hp:t>/.exec(b.section)!;
    const cp = new RegExp(`<hh:charPr id="${run[1]}"[\\s\\S]*?</hh:charPr>`).exec(new TextDecoder().decode(b.header))![0];
    expect(cp).toContain('textColor="#000000"');
    expect(cp).not.toContain('<hh:italic/>');
    expect(b.section.match(/<hp:subList/g)!.length).toBe(a.section.match(/<hp:subList/g)!.length);
    expect(b.section.match(/<\/hp:subList>/g)!.length).toBe(b.section.match(/<hp:subList/g)!.length);
  });
  it('없는 표·칸은 거부', async () => {
    const src = await mdToHwpx(MD);
    await expect(fillCells(src, [{ table: 3, row: 0, col: 0, text: 'x' }])).rejects.toThrow('표 3');
    await expect(fillCells(src, [{ table: 0, row: 9, col: 0, text: 'x' }])).rejects.toThrow('9행');
  });
});

// pstack 261119 Act on — 미리보기 잔존·원본 기준 판정·줄바꿈 중첩·글자 밖 내용·꾸밈 있는 검정·중첩 문단 lineseg
const edit = async (b: Uint8Array, f: (s: string) => string, extra?: (z: JSZip) => void) => {
  const z = await JSZip.loadAsync(b);
  z.file('Contents/section0.xml', f(await z.file('Contents/section0.xml')!.async('string')));
  extra?.(z);
  return z.generateAsync({ type: 'uint8array' });
};
const withPreview = (b: Uint8Array) =>
  edit(b, (s) => s, (z) => {
    z.file('Preview/PrvText.txt', '옛 글자 고유한 낱말');
    z.file('Preview/PrvImage.png', new Uint8Array([1, 2, 3]));
  }).then(async (x) => {
    const z = await JSZip.loadAsync(x);
    const hpf = await z.file('Contents/content.hpf')!.async('string');
    z.file('Contents/content.hpf', hpf.replace('</opf:manifest>', '<opf:item id="PrvImage" href="Preview/PrvImage.png" media-type="image/png"/></opf:manifest>'));
    return z.generateAsync({ type: 'uint8array' });
  });

describe('S11·S12 — 검토 반영(261119)', () => {
  it('고친 파일에 옛 미리보기(PrvText·PrvImage)와 그 manifest 줄이 남지 않는다', async () => {
    const src = await withPreview(await mdToHwpx(MD));
    for (const out of [(await replaceText(src, [{ old: '고유한 낱말', new: '바뀐 낱말' }])).bytes, await fillCells(src, [{ table: 0, row: 2, col: 1, text: '값' }])]) {
      const z = await JSZip.loadAsync(out);
      expect(Object.keys(z.files).filter((n) => n.startsWith('Preview/'))).toEqual([]);
      expect(await z.file('Contents/content.hpf')!.async('string')).not.toContain('Preview/');
    }
  });
  it('모든 치환을 원본 기준으로 판정한다 — 갑→병, 병→정 은 연쇄되지 않고, 겹치면 거부', async () => {
    const src = await mdToHwpx('# t\n\n갑 회사와 병 회사');
    const { bytes } = await replaceText(src, [{ old: '갑', new: '병' }, { old: '병', new: '정' }]);
    expect((await parts(bytes)).section).toContain('병 회사와 정 회사');
    await expect(replaceText(src, [{ old: '회사와 병', new: 'x' }, { old: '병 회사', new: 'y' }])).rejects.toThrow('겹칩니다');
  });
  it('한글이 &quot; 로 저장한 따옴표도 찾는다, 바꿀 글자의 제어문자는 지운다', async () => {
    const src = await edit(await mdToHwpx('# t\n\n그는 예 라고 했다'), (s) => s.replace('그는 예 라고', '그는 &quot;예&quot; 라고'));
    const { bytes } = await replaceText(src, [{ old: '"예"', new: '"아니\u0007오"' }]);
    const sec = (await parts(bytes)).section;
    expect(sec).toContain('그는 "아니오" 라고');
    expect(sec).not.toContain('\u0007');
  });
  it('중첩 문단: 표를 품은 문단의 글자를 고치면 그 문단 자기 linesegarray 만 지운다(표 안 문단은 그대로)', async () => {
    const md = '# t\n\n| 칸머리 | 값 |\n|---|---|\n| 칸글자 | 1 |';
    const src = await withLineseg(await edit(await mdToHwpx(md), (s) => s.replace(/(<hp:run charPrIDRef="(\d+)">)<hp:tbl/, '<hp:run charPrIDRef="$2"><hp:t>표앞글자</hp:t></hp:run>$1<hp:tbl')));
    const a = (await parts(src)).section;
    const { bytes } = await replaceText(src, [{ old: '표앞글자', new: '바뀐 글자' }]);
    const b = (await parts(bytes)).section;
    expect(b.match(/<hp:linesegarray>/g)!.length).toBe(a.match(/<hp:linesegarray>/g)!.length - 1);
    expect(b).toMatch(/<\/hp:tbl><hp:t\/><\/hp:run><\/hp:p>/);
    // 표 안 칸 문단은 lineseg 를 그대로 가진다
    expect(b).toMatch(/칸글자<\/hp:t><\/hp:run><hp:linesegarray>/);
  });
  it('여러 줄 채우기는 <hp:t> 하나 안에 lineBreak, 제어문자는 지운다', async () => {
    const out = await fillCells(await mdToHwpx(MD), [{ table: 0, row: 2, col: 1, text: '첫줄\n둘\u0001째줄' }]);
    const sec = (await parts(out)).section;
    expect(sec).toContain('<hp:t>첫줄<hp:lineBreak/>둘째줄</hp:t>');
    expect(sec).not.toContain('</hp:t><hp:lineBreak/>');
  });
  it('칸 첫 문단에 글자 밖 내용(누름틀·책갈피 등)이 있으면 채우지 않는다', async () => {
    const src = await edit(await mdToHwpx(MD), (s) => {
      const at = s.indexOf('<hp:cellAddr colAddr="1" rowAddr="2"/>');
      const close = s.lastIndexOf('</hp:p>', at);
      return s.slice(0, close) + '<hp:run charPrIDRef="13"><hp:ctrl><hp:bookmark name="x"/></hp:ctrl></hp:run>' + s.slice(close);
    });
    await expect(fillCells(src, [{ table: 0, row: 2, col: 1, text: 'x' }])).rejects.toThrow('글자 밖');
  });
  it('대신할 글자 모양은 밑줄·취소선 없는 검정이어야 한다', async () => {
    const z = await JSZip.loadAsync(await mdToHwpx(MD));
    let h = await z.file('Contents/header.xml')!.async('string');
    h = h.replace(/(<hh:charPr id="13"[^>]*textColor=")#000000"/, '$1#0000FF"');
    const pick = async (hdr: string) => {
      z.file('Contents/header.xml', hdr);
      const out = await fillCells(await z.generateAsync({ type: 'uint8array' }), [{ table: 0, row: 2, col: 1, text: '채운 값' }]);
      return Number(/charPrIDRef="(\d+)"><hp:t>채운 값/.exec((await parts(out)).section)![1]);
    };
    const first = await pick(h);
    // 첫 후보에 밑줄을 입히면 다른 후보를 골라야 한다
    const under = h.replace(new RegExp(`(<hh:charPr id="${first}"[\\s\\S]*?<hh:underline type=")NONE"`), '$1BOTTOM"');
    const second = await pick(under);
    expect(second).not.toBe(first);
    const cp = new RegExp(`<hh:charPr id="${second}"[\\s\\S]*?</hh:charPr>`).exec(under)![0];
    expect(cp).toContain('<hh:underline type="NONE"');
  });
});
