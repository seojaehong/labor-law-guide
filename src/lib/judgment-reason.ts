// 판결문 「이유」 가운데 판단 부분을 원문 글자 그대로 잘라 낸다.
// 반환값은 언제나 입력의 연속 구간(slice) 하나다 — 다듬기·이어붙이기·공백 정리·낱말 거름을 하지 않는다.
// 앞뒤 빈 줄만 떼어 낸다. 판단이 애매하면 더 앞에서 시작하거나 이유 전체를 돌려준다(판단 글자를 빠뜨리지 않는다).

/** 화면 제목·복사 머리줄에 쓰는 이름 */
export const VERBATIM_HOLDING_LABEL = '요지(판결문 원문 · 이유 중 판단 부분)';

/** 이보다 길면 처음 일부만 보이고 「전부 보기」로 펼친다 */
export function isLongHolding(text: string): boolean {
  return text.length > 500 || text.split('\n').length > 12;
}

const SPACE = '[ \\t\\u3000]';

/** 줄 머리 번호 줄 「1. 기초사실」 — 「1.5배」 같은 소수는 번호 줄이 아니다 */
const TOP_HEADING = new RegExp(`^${SPACE}*(\\d{1,2})[.．](?!\\d)${SPACE}*(\\S[^\\r\\n]*?)${SPACE}*$`, 'gm');

/** 「2. 15. 징계위원회를 …」처럼 줄바꿈에 걸린 날짜 조각 — 번호 줄 글자가 다시 「15.」로 시작한다 */
const DATE_FRAGMENT = /^\d{1,2}[.．]/;

/** 하위 표제 「나. 판단」「(1) 판단」「2) 이에 대한 판단」「(가) 판단」 */
const SUB_HEADING = new RegExp(`^${SPACE}*(?:[가-하][.．]|\\(?\\d{1,2}\\)|\\([가-하]\\))${SPACE}*(\\S[^\\r\\n]*?)${SPACE}*$`, 'gm');

/** 줄 하나로 선 이유 표지 — 「이유」「이    유」「【이    유】」 */
const REASON_MARKER = new RegExp(`^${SPACE}*[【\\[]?${SPACE}*이${SPACE}*유${SPACE}*[】\\]]?${SPACE}*$`, 'm');

/** 표제가 이보다 길면 문장으로 본다 */
const MAX_HEADING_LENGTH = 60;

/**
 * 건너뛰는 사실·주장·법령 표제(공백을 뺀 글자). 표제 전체가 이 목록과 같아야만 건너뛴다 —
 * 「원고의 주장에 대한 판단」「쟁점에 관한 판단」처럼 낱말을 품은 판단 표제는 건너뛰지 않는다.
 */
const SKIP_HEADINGS = new Set([
  '기초사실', '기초사실관계', '기본적사실관계', '기본사실', '사실관계', '인정사실', '인정되는사실', '전제사실',
  '경위', '처분의경위', '처분경위', '재심판정의경위', '사건의경위', '사건경위', '사건의개요', '재심판정의내용', '다툼없는사실',
  '당사자의주장', '당사자들의주장', '원고의주장', '원고들의주장', '원고주장', '피고의주장', '피고들의주장', '피고주장',
  '참가인의주장', '피고보조참가인의주장', '주장', '주장의요지',
  '관계법령', '관련법령', '관계규정', '관련규정', '관계법규', '관련법규',
  '쟁점', '주요쟁점',
]);

const compact = (value: string) => value.replace(/\s+/g, '');

function isSkipPart(part: string): boolean {
  const bare = part.replace(/등$/, '');
  const candidates = [bare, bare.replace(/의?요지$/, '')];
  return candidates.some((c) => c && (SKIP_HEADINGS.has(c) || SKIP_HEADINGS.has(c.replace(/^이사건(?:의)?/, ''))));
}

/** 「기초사실 및 처분의 경위 등」처럼 이어 쓴 표제는 모든 마디가 건너뛸 표제일 때만 건너뛴다 */
function isSkippedHeading(title: string): boolean {
  const text = compact(title);
  if (!text || text.includes('판단')) return false;
  if (isSkipPart(text)) return true;
  const parts = text.split(/및|,|·|ㆍ/);
  return parts.length > 1 && parts.every(isSkipPart);
}

/** 판단이 앞 절 안에 표제 없이 들어 있을 수 있다 — 결론만 남으면 요지로 내지 않는다 */
const CONCLUSION_HEADINGS = new Set(['결론', '결어']);

function isSentence(title: string): boolean {
  return /[.。]$/.test(title) || /(?:다|라)$/.test(title);
}

/** 표제 글자 — 짧고 문장 어미가 없다 */
function isHeadingTitle(title: string): boolean {
  return title.length <= MAX_HEADING_LENGTH && !isSentence(title);
}

type Heading = { start: number; title: string };

/**
 * 최상위 번호 표제(1. 2. 3. … 차례대로). 어느 줄이 표제인지 가릴 수 없으면 null.
 * - 표제 뒤에서 「1.」로 다시 시작한 번호 줄은 본문에 인용한 목록(취업규칙·법령의 호)이다. 번호가 이어지는 동안 목록으로 본다
 *   — 목록 번호와 다음 표제 번호가 겹치면 목록으로 본다(뒤 표제를 놓치면 더 앞에서 시작하거나 이유 전체가 될 뿐 판단이 빠지지 않는다).
 * - 다음 표제 번호 자리에 문장·긴 줄이 오면 표제가 아니지만, 그 뒤에 같은 번호 표제가 또 나오면 어느 쪽이 진짜인지 모른다 → null.
 */
function topHeadings(reason: string): Heading[] | null {
  const headings: Heading[] = [];
  let expected = 1;
  let list = 0; // 인용 목록의 다음 번호(0 = 목록 밖)
  let sentenceAt = 0; // 문장·긴 줄이 차지한 표제 번호
  for (const match of reason.matchAll(TOP_HEADING)) {
    const number = Number(match[1]);
    const title = match[2];
    if (DATE_FRAGMENT.test(title)) continue;
    if (list && number === list) {
      list++;
      continue;
    }
    if (headings.length > 0 && number === 1) {
      list = 2;
      continue;
    }
    list = 0;
    if (number !== expected) continue;
    if (!isHeadingTitle(title)) {
      sentenceAt = number;
      continue;
    }
    if (sentenceAt === number) return null;
    headings.push({ start: match.index ?? 0, title });
    expected++;
  }
  return headings;
}

/** 절 글자 안에 「판단」이 든 하위 표제가 있는가 */
function hasJudgmentSubHeading(text: string): boolean {
  for (const match of text.matchAll(SUB_HEADING)) {
    if (compact(match[1]).includes('판단') && isHeadingTitle(match[1])) return true;
  }
  return false;
}

/** 앞뒤 빈 줄과 끝 공백만 뗀다 — 결과는 입력의 부분 문자열. 원문 요지 표지를 내보낼 때도 이것만 쓴다 */
export function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t　]*(?:\r\n|\n|\r))+/, '').replace(/\s+$/, '');
}

/**
 * 이유 글자에서 판단 부분을 고른다.
 * 최상위 번호 표제(1. 2. 3. … 차례대로, 짧고 문장 어미가 없는 줄)를 찾아 앞쪽의 사실·주장·법령 표제를 건너뛰고,
 * 그다음 표제부터 끝(결론 포함)까지를 돌려준다. 건너뛸 절 안에 「판단」 하위 표제(「나. 판단」)가 있으면 그 절부터 돌려준다.
 * 건너뛴 표제가 없거나, 건너뛴 뒤 남는 표제가 없거나 결론뿐이거나, 번호 표제가 없거나, 표제를 가릴 수 없으면 이유 전체를 돌려준다.
 */
export function extractJudgmentPart(reason: string): string {
  const headings = topHeadings(reason);
  if (!headings) return trimBlankLines(reason);
  let first = headings.findIndex((heading) => !isSkippedHeading(heading.title));
  const skipped = first === -1 ? headings.length : first;
  for (let i = 0; i < skipped; i++) {
    const end = i + 1 < headings.length ? headings[i + 1].start : reason.length;
    if (hasJudgmentSubHeading(reason.slice(headings[i].start, end))) {
      first = i;
      break;
    }
  }
  if (first <= 0 || CONCLUSION_HEADINGS.has(compact(headings[first].title))) return trimBlankLines(reason);
  return trimBlankLines(reason.slice(headings[first].start));
}

function textAfterMarker(text: string): string | null {
  const match = REASON_MARKER.exec(text);
  if (!match) return null;
  let end = (match.index ?? 0) + match[0].length;
  if (text.startsWith('\r\n', end)) end += 2;
  else if (text[end] === '\n' || text[end] === '\r') end += 1;
  const rest = text.slice(end);
  return rest.trim() ? rest : null;
}

/**
 * 이유 글자 — 「이유」 절이 있으면 그 글자, 없으면 전문(또는 절 글자)에서 줄 하나로 선 「이 유」 표지 뒤 글자.
 * 찾지 못하면 null.
 */
export function findReasonText(sections: ReadonlyArray<{ title?: string; text?: string }>, fullText: string): string | null {
  for (const section of sections) {
    if (compact(section.title ?? '') === '이유' && typeof section.text === 'string' && section.text.trim()) return section.text;
  }
  const fromFull = fullText ? textAfterMarker(fullText) : null;
  if (fromFull) return fromFull;
  for (const section of sections) {
    const found = typeof section.text === 'string' ? textAfterMarker(section.text) : null;
    if (found) return found;
  }
  return null;
}
