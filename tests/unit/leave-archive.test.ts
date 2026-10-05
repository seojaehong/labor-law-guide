import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { boundedLeaveArchive } from '@/lib/leave/leave-archive';

describe('actual workbook expansion budget', () => {
  it('repackages small normal entries with bounded bytes', async () => {
    const zip = new JSZip(); zip.file('xl/worksheets/sheet1.xml', '<worksheet><row><c>synthetic</c></row></worksheet>');
    const safe = await boundedLeaveArchive(await zip.generateAsync({ type: 'uint8array' }));
    expect(await (await JSZip.loadAsync(safe)).file('xl/worksheets/sheet1.xml')!.async('text')).toContain('synthetic');
  });
  it('stops an ordinary stored entry above the actual per-entry limit', async () => {
    const zip = new JSZip(); zip.file('benign.bin', new Uint8Array(3 * 1024 * 1024));
    await expect(boundedLeaveArchive(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }))).rejects.toThrow('실제 압축 해제');
  });
  it('stops aggregate expansion across otherwise allowed entries', async () => {
    const zip = new JSZip(); for (let i = 0; i < 3; i++) zip.file(`benign-${i}.bin`, new Uint8Array(2 * 1024 * 1024));
    await expect(boundedLeaveArchive(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }))).rejects.toThrow('실제 압축 해제');
  });
  it('rejects excess worksheet rows before ExcelJS parsing', async () => {
    const zip = new JSZip(); zip.file('xl/worksheets/sheet1.xml', `<worksheet>${'<row/>'.repeat(5002)}</worksheet>`);
    await expect(boundedLeaveArchive(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('5,000명');
  });
});
