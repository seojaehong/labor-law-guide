// 오피스 엔진 한도 — 부르는 쪽이 주입한다(라이브러리 입구는 Limits 전부 필수, 기본값은 DEFAULT_LIMITS).
// zip 은 중앙 디렉터리에 적힌 크기를 믿지 않고 실제로 풀면서 누적 바이트를 센다(G4 Act on 4).
// fs·네트워크 없음. node:zlib 만 쓴다.
import { inflateRawSync } from 'node:zlib';

export interface Limits {
  /** 입력 바이트 상한 */
  maxInputBytes: number;
  /** zip 을 실제로 풀었을 때 누적 바이트 상한 */
  maxUnzippedBytes: number;
  /** zip 항목 수 상한 */
  maxZipEntries: number;
  /** 작업량 상한(칸 수 환산 — 칸·유효성 범위·병합 범위·읽을 행×열) */
  maxCells: number;
  /** 결과 바이트 상한 */
  maxOutputBytes: number;
}

const MB = 1024 * 1024;

/** 서버·작업자용 기본값. 원격 공개 입구는 src/lib/mcp/request-boundary.ts 의 REMOTE_OFFICE_LIMITS 를 쓴다 */
export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxInputBytes: 20 * MB,
  maxUnzippedBytes: 200 * MB,
  maxZipEntries: 10_000,
  maxCells: 2_000_000,
  maxOutputBytes: 20 * MB,
});

const LIMIT_KEYS: (keyof Limits)[] = ['maxInputBytes', 'maxUnzippedBytes', 'maxZipEntries', 'maxCells', 'maxOutputBytes'];

/** 한도 객체 검사 — 빠진 칸·음수·숫자 아님이면 이유 문자열 */
export function checkLimits(l: unknown): string | null {
  if (!l || typeof l !== 'object') return 'limits 를 주세요(DEFAULT_LIMITS 를 쓰려면 그대로 넘깁니다).';
  const bad = LIMIT_KEYS.filter((k) => {
    const v = (l as Record<string, unknown>)[k];
    return typeof v !== 'number' || !Number.isFinite(v) || v < 0;
  });
  return bad.length ? `limits 칸이 빠졌거나 숫자가 아닙니다: ${bad.join(', ')}` : null;
}

export type ZipReadResult =
  | { ok: true; parts: Map<string, Uint8Array>; totalUncompressed: number }
  | { ok: false; code: 'ZIP_TOO_LARGE' | 'BAD_ZIP'; message: string };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * zip 을 실제로 푼다. 항목마다 「남은 예산」을 출력 상한으로 걸고 풀어서, 선언 크기를 속인 zip 폭탄도
 * 누적 maxUnzippedBytes 를 넘는 순간 멈춘다. zip64·암호화 항목·지원 안 하는 압축 방식은 BAD_ZIP.
 */
export function readZipGuarded(bytes: Uint8Array, limits: Pick<Limits, 'maxUnzippedBytes' | 'maxZipEntries'>): ZipReadResult {
  const bad = (message: string) => ({ ok: false as const, code: 'BAD_ZIP' as const, message });
  const big = (message: string) => ({ ok: false as const, code: 'ZIP_TOO_LARGE' as const, message });
  if (!isZip(bytes)) return bad('zip 형식이 아닙니다.');
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return bad('zip 끝 디렉터리를 찾지 못했습니다.');
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) return bad('zip64 형식은 받지 않습니다.');
  if (count > limits.maxZipEntries) return big(`zip 항목이 ${limits.maxZipEntries}개를 넘습니다.`);
  const parts = new Map<string, Uint8Array>();
  const dec = new TextDecoder('utf-8');
  let p = cdOffset;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) return bad('zip 중앙 디렉터리가 깨졌습니다.');
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const compSize = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    if (compSize === 0xffffffff || local === 0xffffffff) return bad('zip64 형식은 받지 않습니다.');
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) return bad(`암호 걸린 zip 항목은 받지 않습니다: ${name}`);
    if (local + 30 > bytes.length || u32(bytes, local) !== 0x04034b50) return bad('zip 항목 머리가 깨졌습니다.');
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    if (start + compSize > bytes.length) return bad('zip 항목이 파일 끝을 넘습니다.');
    const data = bytes.subarray(start, start + compSize);
    const remaining = limits.maxUnzippedBytes - total;
    let out: Uint8Array;
    if (method === 0) {
      if (compSize > remaining) return big(`압축을 풀면 ${limits.maxUnzippedBytes} 바이트를 넘습니다.`);
      out = data;
    } else if (method === 8) {
      try {
        out = inflateRawSync(data, { maxOutputLength: Math.max(1, remaining) });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) return big(`압축을 풀면 ${limits.maxUnzippedBytes} 바이트를 넘습니다.`);
        return bad(`zip 항목을 풀지 못했습니다: ${name}`);
      }
      if (out.length > remaining) return big(`압축을 풀면 ${limits.maxUnzippedBytes} 바이트를 넘습니다.`);
    } else {
      return bad(`지원하지 않는 압축 방식(${method})입니다: ${name}`);
    }
    total += out.length;
    parts.set(name, out);
  }
  return { ok: true, parts, totalUncompressed: total };
}
