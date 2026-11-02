// 의존성 없는 날짜·상수. 화면이 첫 로드에 쓴다(pdf-lib·글꼴·지도는 「PDF 만들기」를 누를 때만 받는다).

export const MAX_PEOPLE = 4;
/** 건강보험 EDI 첨부 한도 */
export const EDI_LIMIT_BYTES = 1_000_000;

export function parseYmd(s: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  // 2월 30일 같은 없는 날, 1900년 이전(달력 입력의 0026 등)은 받지 않는다
  if (y < 1900 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return [y, mo, d];
}

function mustYmd(s: string): [number, number, number] {
  const r = parseYmd(s);
  if (!r) throw new Error(`날짜를 확인해 주세요: ${s || '(빈칸)'}`);
  return r;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dotted = (ymd: string) => ymd.replace(/-/g, '.');

export function lossDateOf(lastWorkDay: string): string {
  const [y, m, d] = mustYmd(lastWorkDay);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function todayKst(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

export function ymdParts(s: string): [number, number, number] {
  return mustYmd(s);
}
