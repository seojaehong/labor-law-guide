import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { mdHwpxSummary, mdToHwpx, parseMarkdown } from '@/lib/md-hwpx';
import { imageSize } from '@/lib/md-hwpx/image';
import { checkHeader } from '@/lib/md-hwpx/header-check';

// S10 — 그림. BinData 수 = hpf 그림 item 수 = hp:pic 수, 출력 글자에 「![」 0
const PNG_2x1 = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAE/wH/YeSuJgAAAABJRU5ErkJggg==', 'base64'));
// 최소 JPEG 머리: SOI + SOF0(높이 3, 너비 5)
const JPG_5x3 = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x05, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('S10 — 그림', () => {
  it('그림 크기를 파일 머리에서 읽는다', () => {
    expect(imageSize(PNG_2x1)).toEqual({ w: 2, h: 1, ext: 'png' });
    expect(imageSize(JPG_5x3)).toEqual({ w: 5, h: 3, ext: 'jpg' });
    expect(() => imageSize(new Uint8Array([1, 2, 3]))).toThrow('그림 크기');
  });

  it('BinData 수 = hpf 그림 item 수 = hp:pic 수, 글자에 ![ 없음, 캡션 문단', async () => {
    const md = '# 제목\n\n![그림 1. 흐름](a.png)\n\n본문\n\n![](b.jpg)';
    const bytes = await mdToHwpx(md, { features: { image: true }, images: { 'a.png': PNG_2x1, 'b.jpg': JPG_5x3 } });
    const z = await JSZip.loadAsync(bytes);
    const bin = Object.keys(z.files).filter((n) => n.startsWith('BinData/'));
    const hpf = await z.file('Contents/content.hpf')!.async('string');
    const section = await z.file('Contents/section0.xml')!.async('string');
    const header = await z.file('Contents/header.xml')!.async('string');
    expect(bin.sort()).toEqual(['BinData/image1.png', 'BinData/image2.jpg']);
    expect(hpf.match(/<opf:item [^>]*isEmbeded="1"\/>/g)).toHaveLength(2);
    expect(section.match(/<hp:pic /g)).toHaveLength(2);
    for (const id of ['image1', 'image2']) expect(section).toContain(`binaryItemIDRef="${id}"`);
    expect([...section.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1]).join('')).not.toContain('![');
    expect(section).toContain('<hp:t>그림 1. 흐름</hp:t>');
    // 비율 유지: 2:1
    const [w, h] = /<hp:curSz width="(\d+)" height="(\d+)"/.exec(section)!.slice(1).map(Number);
    expect(w / h).toBeCloseTo(2, 1);
    expect(checkHeader(header, section)).toEqual([]);
    expect((await z.file('mimetype')!.async('string'))).toBe('application/hwp+zip');
    expect(Object.keys(z.files)[0]).toBe('mimetype');
  });

  it('그림 바이트가 없으면 멈춘다(글자로 인쇄하지 않는다)', async () => {
    await expect(mdToHwpx('![x](없음.png)', { features: { image: true } })).rejects.toThrow('그림 파일이 없습니다');
  });

  it('끄면 그림 줄은 글자로 남고 leftovers 에 「](」 로 보고된다(기존 동작)', () => {
    expect(mdHwpxSummary(parseMarkdown('![x](a.png)')).leftovers).toContain('](');
  });
});
