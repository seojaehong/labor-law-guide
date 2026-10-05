import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { MAX_FILE_BYTES, readDocText, validateDocArchive } from '@/lib/laws/doc-io';

async function doc(text: string, compression: 'STORE' | 'DEFLATE' = 'STORE') {
  const zip = new JSZip(); zip.file('word/document.xml', `<w:p><w:t>${text}</w:t></w:p>`);
  return zip.generateAsync({ type: 'uint8array', compression });
}
describe('document resource limits', () => {
  it('rejects oversized and malformed input before decompression', () => {
    expect(() => validateDocArchive(new Uint8Array(MAX_FILE_BYTES + 1))).toThrow('10MB');
    expect(() => validateDocArchive(new Uint8Array(30))).toThrow('압축');
  });
  it('rejects a highly compressed document', async () => {
    await expect(readDocText(await doc('x'.repeat(2 * 1024 * 1024), 'DEFLATE'), 'docx')).rejects.toThrow('압축률');
  });
  it('limits actual expansion even if central directory size is forged', async () => {
    const bytes = await doc('x'.repeat(MAX_FILE_BYTES + 1), 'DEFLATE');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 1024, true);
    await expect(readDocText(bytes, 'docx')).rejects.toThrow();
  });
  it('reads ordinary text without treating markup as HTML', async () => {
    expect(await readDocText(await doc('제1조 &lt;script&gt; &amp; 회사'), 'docx')).toBe('제1조 <script> & 회사');
  });
});

describe.each(['docx', 'hwpx'] as const)('%s empty body rejection', kind => {
  it.each(['empty', 'image-only', 'whitespace'])('rejects %s rather than returning an empty success', async content => {
    const prefix = kind === 'docx' ? 'w' : 'hp';
    const inner = content === 'empty' ? '' : content === 'image-only' ? `<${prefix}:drawing/>` : `<${prefix}:t>  \n\t </${prefix}:t>`;
    const zip = new JSZip();
    zip.file(kind === 'docx' ? 'word/document.xml' : 'Contents/section0.xml', `<${prefix}:p>${inner}</${prefix}:p>`);
    await expect(readDocText(await zip.generateAsync({ type: 'uint8array' }), kind)).rejects.toThrow('읽을 수 있는 글자가 없습니다');
  });
});
