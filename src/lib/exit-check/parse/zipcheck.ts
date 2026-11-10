// 원본: ~/dev/exit-check @cab1cce
// XLSX container checks from the ZIP central directory (docs/03 4.2). Pure; nothing is extracted.

export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // provisional

export interface ZipCheck {
  ok: boolean;
  reason_code: string | null;
  entries: string[];
}

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function checkXlsxContainer(bytes: Uint8Array): ZipCheck {
  const fail = (reason_code: string): ZipCheck => ({ ok: false, reason_code, entries: [] });
  if (CFB_SIGNATURE.every((b, i) => bytes[i] === b)) return fail("ENCRYPTED_OR_LEGACY_CONTAINER");
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) return fail("NOT_A_ZIP_CONTAINER");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 22 - 65535); p--) {
    if (view.getUint32(p, true) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) return fail("ZIP_DIRECTORY_NOT_FOUND");
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > bytes.length) return fail("ZIP_LAYOUT_NOT_SUPPORTED");

  const entries: string[] = [];
  let total = 0;
  let p = cdOffset;
  const dec = new TextDecoder("utf-8");
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return fail("ZIP_DIRECTORY_CORRUPT");
    const flags = view.getUint16(p + 8, true);
    const usize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (flags & 0x1) return fail("ENCRYPTED_OR_LEGACY_CONTAINER");
    if (usize === 0xffffffff) return fail("ZIP_LAYOUT_NOT_SUPPORTED");
    total += usize;
    entries.push(name);
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (total > MAX_UNCOMPRESSED_BYTES) return fail("UNCOMPRESSED_SIZE_LIMIT");
  const lower = entries.map((e) => e.toLowerCase());
  if (lower.some((e) => e.endsWith("vbaproject.bin") || e.includes("macrosheets/"))) return { ok: false, reason_code: "MACRO_PRESENT", entries };
  if (lower.some((e) => e.startsWith("xl/externallinks/"))) return { ok: false, reason_code: "EXTERNAL_LINK_PRESENT", entries };
  if (!lower.includes("xl/workbook.xml")) return { ok: false, reason_code: "WORKBOOK_PART_NOT_FOUND", entries };
  return { ok: true, reason_code: null, entries };
}
