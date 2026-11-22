// 원격(base64) 입력 크기 검사 — 압축을 풀지 않고 zip 중앙 디렉터리의 「풀린 크기」만 더한다(zip 폭탄 차단).
// fs·네트워크 없음. 바이트를 받아 판정만 돌린다.

export const MAX_REMOTE_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_REMOTE_UNZIPPED_BYTES = 50 * 1024 * 1024;
export const MAX_REMOTE_OUTPUT_BYTES = 5 * 1024 * 1024;

export type ZipSizeResult = { ok: true; totalUncompressed: number; entries: number } | { ok: false; reason: string };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;

/**
 * zip 중앙 디렉터리에 적힌 항목별 풀린 크기를 더해 상한과 비교한다.
 * zip 이 아니면 ok:true(형식 판정은 엔진 inspect 가 needsReview 로 돌린다). zip64·깨진 디렉터리는 거부.
 */
export function checkZipUncompressedSize(bytes: Uint8Array, max = MAX_REMOTE_UNZIPPED_BYTES): ZipSizeResult {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: true, totalUncompressed: 0, entries: 0 };
  // 끝 중앙 디렉터리 레코드(EOCD, 06054b50) — 주석이 최대 65535 바이트라 그만큼 뒤에서 찾는다
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: 'zip 끝 디렉터리를 찾지 못했습니다.' };
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) return { ok: false, reason: 'zip64 형식은 받지 않습니다.' };
  let p = cdOffset;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) return { ok: false, reason: 'zip 중앙 디렉터리가 깨졌습니다.' };
    const size = u32(bytes, p + 24);
    if (size === 0xffffffff) return { ok: false, reason: 'zip64 형식은 받지 않습니다.' };
    total += size;
    if (total > max) return { ok: false, reason: `압축을 풀면 ${max} 바이트를 넘습니다.` };
    p += 46 + u16(bytes, p + 28) + u16(bytes, p + 30) + u16(bytes, p + 32);
  }
  return { ok: true, totalUncompressed: total, entries: count };
}
