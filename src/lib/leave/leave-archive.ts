import JSZip from 'jszip';
import { validateDocArchive } from '../laws/doc-io';

const ENTRY_LIMIT = 2 * 1024 * 1024;
export const LEAVE_EXPANDED_LIMIT = 5 * 1024 * 1024;

async function limitedEntry(entry: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []; let size = 0; let stopped = false;
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    stream.on('data', chunk => {
      if (stopped) return;
      size += chunk.byteLength;
      if (size > limit) { stopped = true; stream.pause(); reject(new Error('엑셀의 실제 압축 해제 크기가 제한을 초과했습니다. 파일을 나누어 주세요.')); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => {
      if (stopped) return;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      resolve(bytes);
    }).resume();
  });
}

/** ExcelJS receives only a canonical STORE archive of entries already bounded in actual bytes. */
export async function boundedLeaveArchive(data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  validateDocArchive(data);
  const input = await JSZip.loadAsync(data);
  const output = new JSZip(); let total = 0; let cells = 0;
  for (const entry of Object.values(input.files)) {
    if (entry.dir) continue;
    const bytes = await limitedEntry(entry, Math.min(ENTRY_LIMIT, LEAVE_EXPANDED_LIMIT - total));
    total += bytes.byteLength;
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(entry.name)) {
      const xml = new TextDecoder().decode(bytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('지원하지 않는 엑셀 XML 선언입니다.');
      const rows = xml.match(/<(?:\w+:)?row\b[^>]*>[\s\S]*?<\/(?:\w+:)?row>/g) ?? [];
      if ((xml.match(/<(?:\w+:)?row\b/g) ?? []).length > 5001) throw new Error('엑셀은 5,000명 이하로 나누어 주세요.');
      cells += (xml.match(/<(?:\w+:)?c\b/g) ?? []).length;
      if (cells > 50000) throw new Error('엑셀은 전체 50,000셀 이하로 나누어 주세요.');
      for (const row of rows) {
        const count = (row.match(/<(?:\w+:)?c\b/g) ?? []).length;
        if (count > 100) throw new Error('엑셀은 행당 100셀 이하로 나누어 주세요.');
      }
    }
    output.file(entry.name, bytes);
  }
  return output.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
}
