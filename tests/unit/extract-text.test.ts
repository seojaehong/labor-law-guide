import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { detectDocKind, extractDocText, MAX_EXTRACTED_CHARS } from '@/lib/contract-check/extract-text';

/** DOCX 최소 구조 — word/document.xml 하나면 파서가 읽어야 한다. */
async function makeDocx(paragraphs: string[]): Promise<ArrayBuffer> {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('');
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** HWPX 최소 구조 — 본문은 Contents/section0.xml 이후로 나뉜다. */
async function makeHwpx(sections: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  sections.forEach((paras, i) => {
    const body = paras.map((p) => `<hp:p><hp:run><hp:t>${p}</hp:t></hp:run></hp:p>`).join('');
    zip.file('Contents/section' + i + '.xml', `<?xml version="1.0"?><hml xmlns:hp="x">${body}</hml>`);
  });
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('detectDocKind', () => {
  it('MIME으로 판정한다', () => {
    expect(
      detectDocKind(
        'a',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('docx');
    expect(
      detectDocKind('a', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe('xlsx');
  });

  it('브라우저가 MIME을 안 붙이는 HWPX는 확장자로 판정한다', () => {
    expect(detectDocKind('근로계약서.hwpx', '')).toBe('hwpx');
    expect(detectDocKind('근로계약서.HWPX', 'application/octet-stream')).toBe('hwpx');
  });

  it('구형 HWP는 비지원 — null', () => {
    expect(detectDocKind('근로계약서.hwp', '')).toBeNull();
  });

  it('이미지·PDF는 이 함수 대상이 아니다', () => {
    expect(detectDocKind('a.jpg', 'image/jpeg')).toBeNull();
    expect(detectDocKind('a.pdf', 'application/pdf')).toBeNull();
  });
});

describe('extractDocText — DOCX', () => {
  it('문단을 개행으로 이어 붙인다', async () => {
    const buf = await makeDocx(['근로계약서', '월 급여: 2,400,000원', '수습기간 3개월']);
    const text = await extractDocText('docx', buf);
    expect(text).toContain('근로계약서');
    expect(text).toContain('2,400,000원');
    // 문단이 뭉치지 않아야 항목-값 짝이 유지된다
    expect(text.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('XML 엔티티를 복원한다', async () => {
    const buf = await makeDocx(['갑 &amp; 을은 다음과 같이 근로계약을 체결한다', '&lt;특약사항&gt; 제9조를 따른다']);
    const text = await extractDocText('docx', buf);
    expect(text).toContain('갑 & 을');
    expect(text).toContain('<특약사항>');
  });

  it('본문이 없으면 throw — 빈 문자열을 돌려주면 "빈 계약서"로 오인된다', async () => {
    const buf = await makeDocx(['']);
    await expect(extractDocText('docx', buf)).rejects.toThrow();
  });
});

describe('extractDocText — HWPX', () => {
  it('section을 번호 순으로 이어 붙인다', async () => {
    const buf = await makeHwpx([['제1조 근로계약기간은 2026년 9월 1일부터'], ['제9조 특약사항 — 금품은 30일 이내 지급']]);
    const text = await extractDocText('hwpx', buf);
    expect(text.indexOf('제1조')).toBeLessThan(text.indexOf('제9조'));
  });

  it('section이 10개를 넘어도 사전순이 아니라 숫자순으로 이어 붙인다', async () => {
    const buf = await makeHwpx(
      Array.from({ length: 12 }, (_, i) => [`구역${i}내용`]),
    );
    const text = await extractDocText('hwpx', buf);
    // 사전순이면 section10이 section2보다 앞선다 — 숫자순이어야 한다
    expect(text.indexOf('구역2내용')).toBeLessThan(text.indexOf('구역10내용'));
  });
});

describe('extractDocText — 공통', () => {
  it('상한을 넘는 본문은 잘라낸다', async () => {
    const long = 'x'.repeat(200);
    const buf = await makeDocx(Array.from({ length: 500 }, () => long));
    const text = await extractDocText('docx', buf);
    expect(text.length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS);
  });

  it('zip이 아닌 바이트는 throw', async () => {
    const buf = new TextEncoder().encode('not a zip at all').buffer;
    await expect(extractDocText('docx', buf as ArrayBuffer)).rejects.toThrow();
  });
});
