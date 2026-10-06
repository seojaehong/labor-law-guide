import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { compareDocx } from '@/lib/laws/doc-io';

describe('comparison DOCX sections are opt-in', () => {
  it('retains the original single-table API and output behavior', async () => {
    const blob = await compareDocx({ title: '기존 제목', intro: ['기존 안내'], head: ['현행', '개정안'], widths: [7000, 7000], rows: [['기존 본문 <&>', '개정 본문']], foot: ['기존 출처'] });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expect(xml).not.toContain('pageBreakBefore');
    expect(xml).not.toContain('w:keepNext');
    expect(xml).not.toContain('w:val="24"');
    expect(xml).toContain('<w:sz w:val="18"/>');
    expect(xml).toContain('기존 본문 &lt;&amp;&gt;');
    expect(xml).toContain('<w:gridCol w:w="7000"/>');
    expect(xml).toContain('w:orient="landscape"');
    expect(xml.indexOf('기존 안내')).toBeLessThan(xml.indexOf('<w:tbl>'));
    expect(xml.indexOf('기존 출처')).toBeGreaterThan(xml.indexOf('</w:tbl>'));
  });

  it('places a new-page heading before each later table and keeps local sources with their table', async () => {
    const blob = await compareDocx({ title: '전체 제목', intro: [], head: ['전', '후'], widths: [7000, 7000], foot: ['전체 끝'],
      sections: [
        { title: '첫 개정 <&>', intro: ['첫 공포'], rows: [['첫 전', '첫 후']], foot: ['첫 출처'] },
        { title: '둘째 개정', intro: ['둘째 공포'], rows: [['둘째 전', '둘째 후']], foot: ['둘째 출처'] },
        { title: '셋째 개정', intro: [], rows: [], foot: [] },
      ],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(3);
    expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(xml.match(/<w:tblHeader\/>/g)).toHaveLength(3);
    expect(xml).toContain('첫 개정 &lt;&amp;&gt;');
    expect(xml.indexOf('첫 출처')).toBeLessThan(xml.indexOf('<w:pageBreakBefore/>'));
    expect(xml.lastIndexOf('둘째 출처')).toBeLessThan(xml.lastIndexOf('<w:pageBreakBefore/>'));
    expect(xml.lastIndexOf('전체 끝')).toBeGreaterThan(xml.lastIndexOf('</w:tbl>'));
  });
});
