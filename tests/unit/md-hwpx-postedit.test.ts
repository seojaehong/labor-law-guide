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
