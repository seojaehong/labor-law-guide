// 퇴고 — 공개 규범 검사(결정론). 한글 맞춤법(문화체육관광부 고시 제2017-12호)
//   · spacing = 제5장 띄어쓰기(제41~45항) · punct = 부록 「문장 부호」 · comma = 연결어미 뒤 쉼표(업무 문서 기준)
// 규칙은 공개 규범이라 코드에 둔다(비공개 팩이 아니다). 정규식은 파이썬 re 문법으로 쓰고 check.mjs 의 toJsSource 로 옮긴다.
// ★ 규정이 둘 다 허용하는 것(단위 명사·보조 용언·단음절 연속·고유 명사·이히, 절 사이·접속 부사 뒤 쉼표)은 넣지 않았다.
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
import { toJsSource } from './check.mjs';

// 파이썬 str.isspace 와 같은 공백(모두 BMP)
const WS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000].map((c) => String.fromCharCode(c)));
for (let c = 0x2000; c <= 0x200a; c++) WS.add(String.fromCharCode(c));
function strip(s) {
  let a = 0;
  let b = s.length;
  while (a < b && WS.has(s[a])) a++;
  while (b > a && WS.has(s[b - 1])) b--;
  return s.slice(a, b);
}
const leadWs = (s) => {
  let a = 0;
  while (a < s.length && WS.has(s[a])) a++;
  return a;
};
const isHi = (c) => c >= 0xd800 && c <= 0xdbff;
const isLo = (c) => c >= 0xdc00 && c <= 0xdfff;
const stepAt = (s, i) => (isHi(s.charCodeAt(i)) && isLo(s.charCodeAt(i + 1)) ? 2 : 1);
const cpLen = (s) => [...s].length;
/** UTF-16 위치 i 에서 n 코드포인트 앞·뒤 */
function cpBack(s, i, n) {
  while (i > 0 && n > 0) {
    i -= i > 1 && isLo(s.charCodeAt(i - 1)) && isHi(s.charCodeAt(i - 2)) ? 2 : 1;
    n--;
  }
  return i;
}
function cpFwd(s, i, n) {
  while (i < s.length && n > 0) { i += stepAt(s, i); n--; }
  return i;
}
/** UTF-16 위치 → 1부터 세는 코드포인트 칸 */
const colOf = (s, i) => cpLen(s.slice(0, i)) + 1;
/** 파이썬 line[a-before : b+after].strip() (코드포인트 기준) */
const around = (s, start, end, before, after) => strip(s.slice(cpBack(s, start, before), cpFwd(s, end, after)));

const rx = (src) => new RegExp(toJsSource(src), 'gu');

// ── 띄어쓰기(제5장) — [식, 사유, 등급, 근거]
// 의존 명사 「수」가 관형형 어미 뒤에 붙은 것 — 실무 빈발 어형만 열거한다(앞에 한글이 와도 잡는다: 「확인할수」)
const SU = ['할', '될', '볼', '올', '갈', '줄', '쓸', '들', '살', '알', '낼', '설', '있을', '없을', '받을', '만들', '내릴', '오를', '나올', '들어갈', '해낼'];
export const SPACING_RULES = [
  ['[가-힣]및(?=\\s)|(?<=\\s)및[가-힣]', '「및」은 띄어 쓴다(이사장 및 이사들)', 'A', '제45항'],
  ['수\\s+밖에', '「수밖에」는 붙여 쓴다 — 「밖에」가 조사다', 'A', '제41항'],
  // 「주 4.5일제 70%」의 「제」는 접두사가 아니다 — 앞에 한글이 오면 보지 않는다
  ['(?<![가-힣])제\\s+\\d', '순서를 나타내는 「제-」는 붙여 쓴다(제1항·제2조)', 'A', '제43항 다만'],
  [`(?:${SU.join('|')})수(?=\\s|[가는도도를의])`, '의존 명사 「수」는 띄어 쓴다(할 수 있다)', 'A', '제42항'],
  ['(?:하는|되는|있는|없는|같은|다른|이런|그런|저런)것(?=[\\s으이은을과와로도만])', '의존 명사 「것」은 띄어 쓴다(아는 것이 힘이다)', 'A', '제42항'],
  ['[가-힣]·[가-힣]+등(?=[\\s,.이은을과와]|$)', '열거 뒤의 「등」은 띄어 쓴다(책상, 걸상 등이 있다)', 'B', '제45항'],
  ['(?<=\\d)(?:억|만)(?=\\d)', '수는 「만」 단위로 띄어 쓴다(12억 3456만 7898)', 'B', '제44항'],
  // 의존 명사 「바」는 넣지 않는다 — 연결 어미 「-는바」와 구별할 수 없다
];
const SPACING_SKIP = ['#', '|', '---', '[관련', '[질의'];

// ── 문장 부호(부록) — 따옴표 안을 글자로 채운 줄에 보는 것
export const PUNCT_RULES = [
  [',\\s*(?:……|…|\\.\\.\\.)', '줄임표 앞에 쉼표를 쓰지 않는다', 'A', '§4 (1) 다만 (나)'],
  ['\\s+,', '쉼표 앞을 띄우지 않는다 — 쉼표는 앞말에 붙여 쓴다', 'A', '§4 띄어쓰기'],
  ['[가-힣A-Za-z0-9)\\]]\\s+\\.(?:\\s|$)', '마침표 앞을 띄우지 않는다', 'A', '§1 띄어쓰기'],
  ['\\(\\s|\\s\\)', '괄호는 안쪽을 띄우지 않는다', 'A', '§10 띄어쓰기'],
  [',,|、', '쉼표를 겹쳐 쓰거나 일본식 모점을 쓰지 않는다', 'A', '§4'],
  ['[가-힣]\\s+:', '쌍점은 앞말에 붙여 쓴다', 'A', '§6 띄어쓰기'],
  [',\\s*(?:그리고|및)\\s', '열거 끝의 「그리고·및」 앞에는 쉼표를 쓰지 않는 것이 자연스럽다(기능 중복)', 'B', '§4 (1) 해설'],
  // 「2,680시간」 같은 자릿수 구분 쉼표는 대상이 아니다 — 양쪽이 한 자리일 때만
  ['(?<!\\d)\\d,\\d(?!\\d)', '이웃하는 수를 나타내는 쉼표 뒤는 띄운다(5, 6세기)', 'B', '§4 (3)'],
  ['\\.\\.\\.(?!\\.)', '줄임표는 「……」로 쓴다(마침표 세 개가 아니다)', 'B', '§21'],
  ['[가-힣]ㆍ[가-힣][^,\\n]{0,20},\\s*[가-힣]{1,10}ㆍ', '한 열거 안에서 가운뎃점과 쉼표를 섞으면 층위가 흐려진다', 'B', '§5 (1)'],
  ['[가-힣]\\s+\\((?!주|註)', '괄호는 앞말에 붙여 쓴다 — 조문 표제(제52조 (징계))는 무시', 'B', '§10 띄어쓰기'],
];
// 따옴표의 띄어쓰기는 원문 그대로 본다(채우면 경계 안쪽 공백까지 사라진다)
export const PUNCT_RAW_RULES = [
  ['“\\s', '여는 큰따옴표는 뒷말에 붙여 쓴다', 'A', '§8 띄어쓰기'],
  ['\\s”', '닫는 큰따옴표는 앞말에 붙여 쓴다', 'A', '§8 띄어쓰기'],
  ['‘\\s', '여는 작은따옴표는 뒷말에 붙여 쓴다', 'A', '§9 띄어쓰기'],
  // 「’24. 10.」 처럼 연도를 줄여 적는 어포스트로피(같은 U+2019)는 닫는 따옴표가 아니다
  ['\\s’(?!\\d)', '닫는 작은따옴표는 앞말에 붙여 쓴다', 'A', '§9 띄어쓰기'],
];
const PUNCT_SKIP = ['#', '|', '---', '>', '[관련', '[질의'];

// ── 연결어미 뒤 쉼표 — 「~고, ~며, ~경우,」 꼴. 인용(“ ” ‘ ’ 「 」 " ") 안·> 줄·제목·「이상과 같이,」는 둔다
const COMMA_END = '(?:고|며|으며|이며|하며|으나|이나|하나|였으나|였고|하였고|으므로|므로|이므로|하므로|경우|지만|는데|은데|인데|'
  + '어서|아서|여서|하여|되어|라도|더라도|하면|으면|이면|다면|였다면|면서|으면서|대하여|관하여|비추어|따라|보면|'
  + '다만|또한|한편|그러나|따라서|반면|특히|이어|그리고|나아가|아울러|이후|뒤|때|'
  + '이상|있어|없어|아니나|기보다|않아|하되|으되)';
// 「경고, 견책」처럼 「고」로 끝나는 명사는 어미로 보지 않는다
const COMMA_NOUN_GO = ['경고', '해고', '사고', '보고', '참고', '신고', '광고', '재고', '최고', '원고', '피고', '창고', '권고', '공고', '등고', '마감고', '잔고', '노고', '기고', '탈고'];
const COMMA_SKIP = ['>', '#', '<<', '![', '[참고 매뉴얼]'];
const COMMA_REASON = '연결어미 뒤 쉼표는 뺀다(쉼표가 꼭 필요한 곳이 아니면)';

const compiled = {
  spacing: SPACING_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  punct: PUNCT_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  punctRaw: PUNCT_RAW_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  spacingQuote: rx('“[^”]*”'),
  commaQuote: rx('“[^”]*”|‘[^’]*’|「[^」]*」|"[^"]*"'),
  commaCand: rx('(\\S+?),(?=[ \\t]|$)'),
  commaEnd: new RegExp(`${toJsSource(COMMA_END)}$`, 'u'),
  hangulEnd: /[가-힣]$/u,
  digitEnd: new RegExp(`${toJsSource('[\\d)]')}$`, 'u'),
};

// 파이썬 str.splitlines 의 줄 나눔(CR 은 앞에서 LF 로 맞춘다)
const SPLITLINES = /[\n\v\f\x1c-\x1e\x85\u2028\u2029]/;

export const NORM_CHECKS = ['spacing', 'punct', 'comma'];
export const NORM_CAP = 500;

// 인용을 같은 길이(코드포인트)의 공백으로 — 칸 번호가 밀리지 않는다
const blankOut = (m) => ' '.repeat(cpLen(m));
/** 따옴표 안을 「가」로 채운다(부호는 남긴다) — punct_check.strip_quoted 와 같다 */
function fillQuoted(line) {
  let out = '';
  let dq = false;
  let sq = false;
  for (const ch of line) {
    if (ch === '“') dq = true;
    else if (ch === '”') dq = false;
    else if (ch === '‘') sq = true;
    else if (ch === '’') sq = false;
    else { out += dq || sq ? '가' : ch; continue; }
    out += ch;
  }
  return out;
}

const hit = (n, s, m, r, before, after, lead = 0) => ({
  line: n,
  col: colOf(s, m.index) + lead,
  len: cpLen(m[0]),
  grade: r.grade,
  word: m[0],
  reason: r.reason,
  basis: r.basis,
  ctx: around(s, m.index, m.index + m[0].length, before, after),
});

function spacing(lines, quote) {
  const out = [];
  lines.forEach((raw, i) => {
    const s = strip(raw);
    if (!s || SPACING_SKIP.some((p) => s.startsWith(p))) return;
    if (s.startsWith('>') && !quote) return;
    const line = quote ? raw : raw.replace(compiled.spacingQuote, blankOut);
    for (const r of compiled.spacing) for (const m of line.matchAll(r.rx)) out.push(hit(i + 1, line, m, r, 8, 8));
  });
  return out;
}

function punct(lines, quote) {
  const out = [];
  lines.forEach((raw, i) => {
    const s = strip(raw);
    if (!s) return;
    if (!quote && PUNCT_SKIP.some((p) => s.startsWith(p))) return;
    const lead = leadWs(raw) ? cpLen(raw.slice(0, leadWs(raw))) : 0;
    const line = quote ? s : fillQuoted(s);
    for (const r of compiled.punct) for (const m of line.matchAll(r.rx)) out.push(hit(i + 1, line, m, r, 12, 12, lead));
    for (const r of compiled.punctRaw) for (const m of s.matchAll(r.rx)) out.push(hit(i + 1, s, m, r, 12, 12, lead));
  });
  return out;
}

function comma(lines, warnOnly) {
  const out = [];
  const grade = warnOnly ? 'B' : 'A';
  lines.forEach((ln, i) => {
    const s = strip(ln);
    if (!s || COMMA_SKIP.some((p) => s.startsWith(p)) || s.includes('이상과 같이,')) return;
    const h = ln.replace(compiled.commaQuote, blankOut);
    for (const m of h.matchAll(compiled.commaCand)) {
      const w = m[1];
      if (!compiled.commaEnd.test(w) || !compiled.hangulEnd.test(w)) continue;
      if (COMMA_NOUN_GO.some((x) => w.endsWith(x)) || compiled.digitEnd.test(w)) continue;
      out.push({
        line: i + 1,
        col: colOf(h, m.index),
        len: cpLen(m[0]),
        grade,
        word: m[0],
        reason: COMMA_REASON,
        basis: '연결어미 뒤 쉼표',
        ctx: around(h, m.index, m.index + m[0].length, 12, 10),
      });
    }
  });
  return out;
}

/**
 * A 먼저(만든 차례), 남는 칸에 B — counts 는 전부
 * @returns {{ counts: { A: number, B: number }, hits: any[], truncated?: boolean }}
 */
function pack(all, cap) {
  const a = all.filter((h) => h.grade === 'A');
  const b = all.filter((h) => h.grade === 'B');
  const hits = [...a, ...b].slice(0, cap);
  const r = { counts: { A: a.length, B: b.length }, hits };
  if (all.length > hits.length) r.truncated = true;
  return r;
}

/**
 * @param {string} text
 * @param {{ checks?: ('spacing'|'punct'|'comma')[], quote?: boolean, warnOnly?: boolean, cap?: number }} [o]
 *   quote — > 인용 줄과 “ ” 원문 인용도 본다(띄어쓰기·문장 부호). warnOnly — 쉼표 걸림을 B 로(PDF·PPTX 추출본).
 */
export function checkNorms(text, o = {}) {
  const checks = o.checks?.length ? o.checks : NORM_CHECKS;
  const cap = o.cap ?? NORM_CAP;
  // 파이썬 read_text 처럼 줄 끝을 \n 으로 맞춘다. 띄어쓰기·문장 부호는 splitlines(\v \f \x1c-\x1e \x85 U+2028 U+2029 도 줄 나눔), 쉼표는 \n 만
  const t = String(text ?? '').replace(/\r\n?/g, '\n');
  const out = {};
  if (checks.includes('spacing') || checks.includes('punct')) {
    const lines = t.split(SPLITLINES);
    if (checks.includes('spacing')) out.spacing = pack(spacing(lines, !!o.quote), cap);
    if (checks.includes('punct')) out.punct = pack(punct(lines, !!o.quote), cap);
  }
  if (checks.includes('comma')) out.comma = pack(comma(t.split('\n'), !!o.warnOnly), cap);
  return out;
}
