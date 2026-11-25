// 판례 인용 대조 — 문서의 [관련 판결] 블록 인용 조각이 그 사건 판결 전문에 글자 그대로 있는가.
// 대조 규칙은 ~/.claude/scripts/quote_check.py(2026-09-17~)를 옮겼다: 공백·따옴표·문장부호를 지우고 포함 여부를 보고,
// 없으면 가장 긴 공통 구간을 닻으로 창을 잘라 Ratcliff/Obershelp 유사도(파이썬 difflib 과 같은 방식)를 잰다. 0.85 이상 = 근사.
// ★ 결정론이다 — 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않고, 법제처에는 사건번호만 보낸다.
// ★ 「전문 못 찾음」은 공개 경로에서 전문을 받지 못했다는 뜻이지 판결이 없다는 뜻이 아니다(261123 실측: 없는 판결과
//   법제처에 없는 실제 하급심 판결이 똑같이 0건이었다). 응답에 「없는 판결」·「판정」을 쓰지 않는다.
// ★ 사건번호는 연도 2~4자리로 읽는다 — quote_check.py 는 4자리만 읽어 91다27518 같은 옛 대법원 사건을 놓쳤다.
import { fetchPrecedent, searchPrecedents } from './law-open.mjs';

export const VERDICT = {
  SAME: '일치',
  NEAR: '근사',
  DIFF: '불일치',
  NOT_FOUND: '전문 못 찾음',
  OTHER_COURT: '같은 사건번호의 다른 법원 판결만 있음',
  SUMMARY: '요약(대조 제외)',
};
export const NEAR_MIN = 0.85;
export const NOT_FOUND_NOTE =
  '「전문 못 찾음」은 법제처 공개 판례와 붙여 넣은 전문에서 그 사건의 전문을 받지 못했다는 뜻입니다. 판결이 없다는 뜻이 아닙니다. 하급심 판결은 대부분 법제처에 없으니 전문을 붙여 넣어 대조하세요.';

const NUM_RE = /\d{2,4}[가-힣]{1,3}\d{1,7}/g;
const HEAD_RE = /\[관련 (?:판결|판례|판정|결정)\]\s*([^\n]*)/;
const STRIP = /[\s"“”‘’'「」『』<>〈〉[\]()（）·ㆍ・,.:;!?~\-–—*`]/g;
const BRACKET = /\[[^[\]]{0,40}\]/g;
const CITE_TAG = /<\/?(?:law_cite|case_cite)\b[^>]*>/g;

export const key = (s) => String(s ?? '').replace(CITE_TAG, '').replace(BRACKET, '').replace(STRIP, '');

export function courtKey(s) {
  return String(s ?? '').replace(/[\s()（）]/g, '').replace('고법', '고등법원').replace('지법', '지방법원').replace('행법', '행정법원');
}

function headCourt(head) {
  const m = /([가-힣]+(?:법원|고법|지법|행법|위원회)(?:\s*\([가-힣]+\))?(?:\s*[가-힣]+지원)?)/.exec(head ?? '');
  return m ? m[1].trim() : '';
}

/** 가장 긴 공통 구간 — difflib.find_longest_match 와 같게, 같은 길이면 a 앞쪽·b 앞쪽을 고른다 */
function longest(a, alo, ahi, b, blo, bhi) {
  let best = [alo, blo, 0];
  let prev = new Map();
  for (let i = alo; i < ahi; i++) {
    const cur = new Map();
    for (let j = blo; j < bhi; j++) {
      if (a[i] !== b[j]) continue;
      const k = (prev.get(j - 1) ?? 0) + 1;
      cur.set(j, k);
      if (k > best[2]) best = [i - k + 1, j - k + 1, k];
    }
    prev = cur;
  }
  return best;
}

function matches(a, alo, ahi, b, blo, bhi) {
  const [i, j, k] = longest(a, alo, ahi, b, blo, bhi);
  if (!k) return 0;
  return k + matches(a, alo, i, b, blo, j) + matches(a, i + k, ahi, b, j + k, bhi);
}

const ratio = (a, b) => (a.length + b.length ? (2 * matches(a, 0, a.length, b, 0, b.length)) / (a.length + b.length) : 1);

/** 인용 조각 하나를 전문과 대조한다 → { verdict, ratio, near } */
export function matchPiece(piece, body) {
  const k = key(piece);
  const b = key(body);
  if (!k || b.includes(k)) return { verdict: VERDICT.SAME, ratio: 1, near: '' };
  const [ai, bi] = longest(b, 0, b.length, k, 0, k.length);
  const start = Math.max(0, ai - bi - 5);
  const win = b.slice(start, start + k.length + 10);
  const r = ratio(win, k);
  return { verdict: r >= NEAR_MIN ? VERDICT.NEAR : VERDICT.DIFF, ratio: Math.round(r * 1000) / 1000, near: win };
}

/**
 * [관련 …] 블록이 차지하는 줄(0부터) — check_citations 와 check_rewrite 가 같은 범위를 쓴다.
 * 머리줄(줄 어디에 있어도) + 이어지는 > 줄(빈 줄은 건너뜀). > 줄이 없으면 풍산식 — 빈 줄을 건너뛴 다음 원문 줄(빈 줄·○·#·[관련·|·- 앞까지).
 * @param {string[]} lines
 * @param {RegExp} [headRe] g 플래그 없는 머리줄 식(첫 묶음 = 머리줄 나머지)
 * @returns {{ line: number, m: RegExpExecArray, body: number[], quoted: boolean }[]}
 */
export function citationBlockRanges(lines, headRe = HEAD_RE) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = headRe.exec(lines[i]);
    if (!m) continue;
    const body = [];
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trimStart().startsWith('>'))) {
      if (headRe.test(lines[j])) break;
      if (lines[j].trimStart().startsWith('>')) body.push(j);
      j++;
    }
    const quoted = body.length > 0;
    // 풍산식 — 머리줄 다음 줄부터 인용부호 없이 원문
    if (!quoted) while (j < lines.length && lines[j].trim() && !/^\s*(○|#|\[관련|\||-\s)/.test(lines[j])) body.push(j++);
    out.push({ line: i, m, body, quoted });
  }
  return out;
}

/** 문서의 [관련 판결] 블록 → [{ line, head, court, caseNo, caseNos, pieces, summary }] */
export function parseCitationBlocks(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const out = [];
  for (const { line: i, m, body: idx, quoted } of citationBlockRanges(lines)) {
    const caseNos = m[1].match(NUM_RE) ?? [];
    if (!caseNos.length) continue;
    const body = idx.map((j) => (quoted ? lines[j].trimStart().slice(1).trim() : lines[j].trim()));
    const block = body.join('\n').replace(/\((사실관계|법리|적용|쟁점|판결 이유 발췌)\)/g, '…');
    const summary = block.includes('(사안 및 판단 요지)') || block.includes('(판시 취지)');
    const pieces = summary
      ? []
      : block.split(/…|⋯|\(중략\)|\.\.\./)
        .map((p) => p.trim())
        .filter((p) => key(p).length >= 12 && !/^\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/.test(p));
    out.push({ line: i + 1, head: m[1].trim(), court: headCourt(m[1]), caseNo: caseNos[0], caseNos, pieces, summary });
  }
  return out;
}

/**
 * 인용 대조.
 * @param {string} text 문서(md 또는 평문)
 * @param {{ bodies?: Record<string,string>, fetchBody?: (court:string, caseNo:string) => Promise<{court?:string|null, text?:string|null, source?:string}|null> }} o
 *   bodies = 사용자가 붙여 넣은 전문(사건번호 → 전문). fetchBody = 공개 경로(법제처) 전문 받기. 사건마다 한 번만 부른다
 */
export async function checkCitations(text, { bodies = {}, fetchBody } = {}) {
  const rows = [];
  const cache = new Map();
  const get = async (court, no) => {
    if (bodies[no]) return { court: null, text: bodies[no], source: '붙여 넣은 전문' };
    const ck = `${courtKey(court)}|${no}`;
    if (!cache.has(ck)) cache.set(ck, fetchBody ? fetchBody(court, no).catch(() => null) : Promise.resolve(null));
    return cache.get(ck);
  };
  for (const b of parseCitationBlocks(text)) {
    const base = { line: b.line, court: b.court, caseNo: b.caseNo };
    if (b.summary) {
      rows.push({ ...base, verdict: VERDICT.SUMMARY, ratio: null, piece: '', near: '', source: null });
      continue;
    }
    const got = b.pieces.length ? await get(b.court, b.caseNo) : null;
    const hc = courtKey(b.court);
    const gc = courtKey(got?.court);
    const other = got && gc && hc && !gc.includes(hc) && !hc.includes(gc);
    for (const p of b.pieces) {
      const piece = p.replace(/\s+/g, ' ').slice(0, 80);
      if (!got || (!other && !got.text)) rows.push({ ...base, verdict: VERDICT.NOT_FOUND, ratio: null, piece, near: '', source: null });
      else if (other) rows.push({ ...base, verdict: VERDICT.OTHER_COURT, ratio: null, piece, near: '', source: `${got.source ?? ''} · ${got.court}`.replace(/^ · /, '') });
      else {
        const m = matchPiece(p, got.text);
        rows.push({ ...base, verdict: m.verdict, ratio: m.ratio, piece, near: m.near.slice(0, 120), source: got.source ?? null });
      }
    }
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  return { rows, counts };
}

/** 공개 경로 — 법제처 Open API 에서 사건번호로 찾아 머리줄 법원과 맞는 판결의 전문을 받는다. 다른 법원 판결만 있으면 { court, text: null } */
export async function drfFetchBody(court, caseNo) {
  const r = await searchPrecedents({ caseNo, display: 20 });
  const exact = r.rows.filter((x) => x.caseNo.replace(/\s/g, '') === caseNo);
  if (!exact.length) return null;
  const hc = courtKey(court);
  const same = exact.find((x) => !x.court || !hc || courtKey(x.court).includes(hc) || hc.includes(courtKey(x.court)));
  if (!same) return { court: exact[0].court, text: null, source: '법제처' };
  const p = same.id ? await fetchPrecedent(same.id) : null;
  return p?.fullText ? { court: same.court, text: p.fullText, source: '법제처' } : null;
}
