// 규정 이름 정리 — 파일 이름·본문 첫 줄에서 규정 이름을 뽑고, 같은 규정의 여러 파일(형식·판)을 하나로 묶는다.
import type { DocLine, SourceKind } from './model';

/** 규정 이름으로 볼 꼬리말 */
export const REG_SUFFIX = /(규정|규칙|세칙|정관|학칙|지침|내규|요령|규약|준칙|강령|기준|예규)$/;
/** 법령(1단계 대조 밖)으로 볼 꼬리말 */
export const LAW_SUFFIX = /(법|법률|시행령|시행규칙|령|조례|훈령|고시)$/;

/** 띄어쓰기·가운뎃점·낫표를 지운 비교용 이름 */
export const normName = (s: string) => s.replace(/[\s·ㆍ‧∙・「」『』"“”'‘’]/g, '');

/** 기관 이름 머리(「가나대학교 」·「학교법인 다라학원 」)를 뗀 이름 */
export function bareName(s: string): string {
  // 기관 이름 낱말은 네 글자 이상이다(「가나대학교」·「다라학원」). 「대학원 학칙」의 대학원은 기관 이름이 아니다
  return normName(s.replace(/^.*?[가-힣]{2,}(?:대학교|(?<!대)학원|공단|공사|재단|진흥원|진흥회|협회)\s+(?=\S)/, ''));
}

/** 같은 규정인가 — 정리한 이름이 같거나, 기관 머리를 떼면 같다 */
export function sameName(a: string, b: string): boolean {
  const x = normName(a), y = normName(b);
  if (x === y) return true;
  const bx = bareName(a), by = bareName(b);
  return bx === by || bx === y || x === by;
}

/** 파일 이름 → 규정 이름 후보: 분류번호·날짜 꼬리·개정 꼬리·확장자를 뗀다 */
export function nameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '');
  return base
    .replace(/^\s*[\d]+(?:[-.][\d]+)*\s*/, '') // 2-3-18
    .replace(/[_\s]*\(?\s*\d{6,8}\s*\)?/g, ' ') // (20231103)
    .replace(/[_\s]*(?:일부|전부|신규)?\s*(?:개정|제정|폐지)(?:안|본)?/g, ' ')
    .replace(/[_\s]*\((?:PDF|HWP|최종|수정)\)/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 본문 첫머리에서 규정 이름을 찾는다. 없으면 null */
export function nameFromText(lines: DocLine[]): string | null {
  for (const l of lines.slice(0, 6)) {
    const t = l.text.trim().replace(/\s+/g, ' ');
    if (!t || /^제\s*\d+\s*(?:조|장)/.test(t)) continue;
    if (t.length <= 40 && REG_SUFFIX.test(normName(t))) return t;
  }
  return null;
}

/** 날짜 숫자(YYYYMMDD) — 파일 이름 괄호나 「최근개정 : 2023. 11. 08.」 */
export function versionDate(fileName: string, amended?: string): string {
  const f = fileName.match(/(?:19|20)\d{6}/g);
  if (f) return f.sort().pop()!;
  const m = amended?.match(/((?:19|20)\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}` : '';
}

const KIND_RANK: Record<SourceKind, number> = { hwpx: 0, hwp: 1, docx: 2, txt: 3 };

export interface Candidate {
  path: string;
  name: string;
  kind: SourceKind;
  date: string;
  size: number;
}

export interface Grouped<T extends Candidate> {
  chosen: T;
  others: T[];
}

/** 같은 규정 파일을 묶어 하나만 고른다: 판(날짜)이 늦은 것 → 형식(hwpx·hwp·docx·txt) → 크기 */
export function groupSame<T extends Candidate>(list: T[]): Grouped<T>[] {
  const groups: T[][] = [];
  for (const c of list) {
    const g = groups.find((x) => sameName(x[0].name, c.name));
    if (g) g.push(c);
    else groups.push([c]);
  }
  return groups.map((g) => {
    const sorted = [...g].sort((a, b) => (b.date || '').localeCompare(a.date || '') || KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.size - a.size);
    return { chosen: sorted[0], others: sorted.slice(1) };
  });
}

/** 「인사규정 별지 제1호서식」 같은 파일이면 앞부분(규정 이름)을 돌려준다 */
export function annexOwner(name: string): string | null {
  const m = name.match(/^(.+?)\s*[[<【(]?\s*별\s*[표지]/);
  return m && REG_SUFFIX.test(normName(m[1])) ? m[1].trim() : null;
}

const bigrams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
export function similarity(a: string, b: string): number {
  const x = bigrams(normName(a)), y = bigrams(normName(b));
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}
