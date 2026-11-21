/**
 * 주민등록번호 모양 판정 — src/lib/exit-check/core/rrn.ts 의 hasRrnValue 와 같은 규칙을 옮긴 것.
 * 그 폴더는 엔진 사본이라 바깥에서 가져오지 못한다(tests/unit/exit-check-boundary.test.ts).
 * 두 판정이 같은지는 tests/unit/hr-forms.test.ts 「공용 판정과 같은 결과」가 지킨다 — 한쪽을 고치면 같이 고친다.
 * 글자를 먼저 접는다: NFKC(전각 숫자·부호), 보이지 않는 글자 제거, 모든 십진 숫자를 ASCII 로.
 * 6자리·구분자·7자리(첫 자리 1~8), 앞뒤가 숫자면 제외(더 긴 접수번호 등). 뒷자리를 가린 모양(1******)도 잡는다.
 */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/gu;
const SEP = '[\\p{Pd}\\u2212\\u2043\\uFE63\\uFF0D.\\s/_]*';
const D = '\\d';
const shape = (tail: string) => `(?<!\\d)${Array(6).fill(D).join(SEP)}${SEP}${tail}`;
const PATTERNS = [
  new RegExp(`${shape(`[1-8]${SEP}${Array(6).fill(D).join(SEP)}`)}(?!\\d)`, 'u'),
  new RegExp(shape(`[1-8]${SEP}[*xX●•]{6}`), 'u'),
];

function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let k = 0;
  while (k < 60 && /\p{Nd}/u.test(String.fromCodePoint(cp - k - 1))) k++;
  return String(k % 10);
}

const fold = (text: string) =>
  text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\p{Nd}/gu, (c) => (c >= '0' && c <= '9' ? c : asciiDigit(c)));

export function hasRrnValue(text: string): boolean {
  if (!text) return false;
  const t = fold(text);
  return PATTERNS.some((re) => re.test(t));
}
