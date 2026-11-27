// 의존성 없는 날짜·상수. 화면이 첫 로드에 쓴다(pdf-lib·글꼴·지도는 「PDF 만들기」를 누를 때만 받는다).

export const MAX_PEOPLE = 4;

// 부호 — 화면 선택 목록(copy.ts)과 엔진 검사(validate, MCP make_form 공통)가 같은 목록을 쓴다(G4 2026-11-26).
/** 이 도구가 만드는 상실부호. 상실일 = 마지막 근무일(사망이면 사망일) 다음 날로만 계산한다 */
export const LOSS_CODES_SUPPORTED = ['01', '02', '16'] as const;
/** 별지 제8호서식(개정 2022. 10. 26.) 작성방법 건강보험 <상실부호> 전부. 04·10 은 상실일이 적용배제 신청일 당일이라 다르다 */
export const LOSS_CODES_FORM8 = ['01', '02', '04', '10', '13', '16', '17', '19', '24', '25', '26', '58'] as const;
/** 별지 제6호서식(개정 2025. 12. 1.) 작성방법 건강보험 자격취득부호 전부 */
export const ACQ_CODES_FORM6 = ['00', '04', '05', '06', '07', '10', '13', '14', '29', '30'] as const;
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
