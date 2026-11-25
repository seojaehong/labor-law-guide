// 퇴고 — 공개 규범 검사(결정론). 한글 맞춤법(문화체육관광부 고시 제2017-12호)
//   · spacing = 제5장 띄어쓰기(제41~45항) · punct = 부록 「문장 부호」 · comma = 연결어미 뒤 쉼표(규정이 아니라 업무 문서 관행)
// 규칙은 공개 규범이라 코드에 둔다(비공개 팩이 아니다). 정규식은 파이썬 re 문법으로 쓰고 check.mjs 의 toJsSource 로 옮긴다.
// ★ 규정이 둘 다 허용하는 것(단위 명사·보조 용언·단음절 연속·고유 명사·이히, 절 사이·접속 부사 뒤 쉼표)은 넣지 않았다.
// ★ 모델을 부르지 않는다. 문서 글은 이 함수 밖으로 나가지 않는다.
// ★ 시간은 글 길이에 비례해야 한다(261124 G4) — 긴 한 줄·긴 공백 덩어리·닫히지 않는 따옴표·쉼표가 촘촘한 긴 낱말에서
//   되짚기가 제곱으로 늘지 않게, 파이썬 원본과 같은 판정을 내는 선형 식으로 쓴다(퍼즈로 파이썬 원본과 대조).
import { execAll, toJsSource } from './check.mjs';

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
/** 끝 코드포인트(서로게이트 쌍이면 둘 다) */
const lastCp = (s) => (s.length > 1 && isLo(s.charCodeAt(s.length - 1)) && isHi(s.charCodeAt(s.length - 2)) ? s.slice(-2) : s.slice(-1));

// UTF-16 위치 → 1부터 세는 코드포인트 칸. 줄마다 한 번만 표를 만든다(서로게이트가 없는 줄은 위치 + 1).
// 걸림마다 줄 처음부터 다시 세면 긴 한 줄에서 걸림 수 × 줄 길이가 된다(10만 자 한 줄 30초, 261124 G4)
let colLine = null;
let colTable = null;
function colOf(s, i) {
  if (colLine !== s) {
    colLine = s;
    colTable = null;
    if (/[\uD800-\uDFFF]/.test(s)) {
      colTable = new Uint32Array(s.length + 1);
      let k = 0;
      for (let j = 0; j < s.length; j++) {
        colTable[j] = k;
        if (stepAt(s, j) === 2) colTable[++j] = k;
        k++;
      }
      colTable[s.length] = k;
    }
  }
  return (colTable ? colTable[i] : i) + 1;
}
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
  // 파이썬 원본은 \s+, — 공백 덩어리 첫 칸에서만 시작해도 걸림은 같다(덩어리 중간에서 시작하는 걸림은 첫 칸 걸림에 앞선다).
  // 덩어리 칸마다 끝까지 훑는 되짚기(덩어리 길이의 제곱)를 없앤다
  ['(?<!\\s)\\s+,', '쉼표 앞을 띄우지 않는다 — 쉼표는 앞말에 붙여 쓴다', 'A', '§4 띄어쓰기'],
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

// ── 연결어미 뒤 쉼표 — 「~고, ~며, ~경우,」 꼴. 규정이 아니라 업무 문서 관행이다(맞춤법은 연결어미 뒤 쉼표를 막지 않는다).
// 인용(“ ” ‘ ’ 「 」 " ") 안·> 줄·# 제목·「이상과 같이,」 줄은 둔다. 표(|) 줄과 [관련 …] 줄은 본다(파이썬 원본과 같다)
// 끝말(고·며·경우 …) — 파이썬 원본의 (?:…)$ 와 같다(끝이 이 중 하나로 끝나면)
const COMMA_ENDS = ['고', '며', '으며', '이며', '하며', '으나', '이나', '하나', '였으나', '였고', '하였고', '으므로', '므로', '이므로', '하므로', '경우', '지만', '는데', '은데', '인데',
  '어서', '아서', '여서', '하여', '되어', '라도', '더라도', '하면', '으면', '이면', '다면', '였다면', '면서', '으면서', '대하여', '관하여', '비추어', '따라', '보면',
  '다만', '또한', '한편', '그러나', '따라서', '반면', '특히', '이어', '그리고', '나아가', '아울러', '이후', '뒤', '때',
  '이상', '있어', '없어', '아니나', '기보다', '않아', '하되', '으되'];
// 「경고, 견책」처럼 「고」로 끝나는 명사는 어미로 보지 않는다
const COMMA_NOUN_GO = ['경고', '해고', '사고', '보고', '참고', '신고', '광고', '재고', '최고', '원고', '피고', '창고', '권고', '공고', '등고', '마감고', '잔고', '노고', '기고', '탈고'];
// 위 명사와 끝이 같아도 동사 활용이면 어미다 — 「살피고」(살피다)·「살펴보고」「알아보고」(-아/-어 + 보다)
const COMMA_VERB_GO = [
  ['피고', ['살']],
  ['보고', ['아', '어', '여', '해', '펴', '봐', '와', '워', '춰', '려', '켜', '져', '쳐', '혀', '겨', '셔', '돼', '줘']],
];
const isVerbGo = (w) => COMMA_VERB_GO.some(([noun, stems]) => {
  if (!w.endsWith(noun) || w.length <= noun.length) return false;
  return stems.includes(lastCp(w.slice(0, -noun.length)));
});
// 그림(![)·HTML 주석(<<)·참고 자료 표시 줄은 본문이 아니다
const COMMA_SKIP = ['>', '#', '<<', '![', '[참고 매뉴얼]'];
const COMMA_RULE = { reason: '연결어미 뒤 쉼표는 뺀다(쉼표가 꼭 필요한 곳이 아니면)', basis: '연결어미 뒤 쉼표' };

const compiled = {
  spacing: SPACING_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  punct: PUNCT_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  punctRaw: PUNCT_RAW_RULES.map(([re, reason, grade, basis]) => ({ rx: rx(re), reason, grade, basis })),
  // 파이썬 원본은 (\S+?),(?=[ \t]|$) — 걸림은 늘 낱말(공백 덩어리 사이) 첫 칸에서 시작한다(낱말 중간에서 시작하는 걸림이 있으면
  // 같은 쉼표까지 가는 첫 칸 걸림이 먼저다). 첫 칸에서만 시작해 낱말 칸마다 끝까지 훑는 되짚기를 없앤다
  commaCand: rx('(?<!\\S)(\\S+?),(?=[ \\t]|$)'),
  hangulEnd: /^[가-힣]$/u,
  digitEnd: new RegExp(`^${toJsSource('[\\d)]')}$`, 'u'),
};
const COMMA_A = { grade: 'A', ...COMMA_RULE };
const COMMA_B = { grade: 'B', ...COMMA_RULE };

// 인용 가리기 — 파이썬 re.sub(r'“[^”]*”|…', 같은 길이 공백, line) 과 같다. 여는 부호마다 닫는 부호까지 정규식이 훑으면
// 닫히지 않는 여는 부호가 많은 줄에서 제곱이 된다(따옴표 5만 개 194초) → 닫는 부호의 마지막 위치를 먼저 구해 한 번만 훑는다
const SPACING_QUOTES = [['“', '”']];
const COMMA_QUOTES = [['“', '”'], ['‘', '’'], ['「', '」'], ['"', '"']];
function blankQuotes(line, pairs) {
  const last = new Map(pairs.map(([o, c]) => [o, { c, at: line.lastIndexOf(c) }]));
  let out = '';
  let from = 0;
  let i = 0;
  while (i < line.length) {
    const q = last.get(line[i]);
    if (q && q.at > i) {
      const j = line.indexOf(q.c, i + 1);
      out += line.slice(from, i) + ' '.repeat(cpLen(line.slice(i, j + 1)));
      i = j + 1;
      from = i;
    } else i++;
  }
  return from ? out + line.slice(from) : line;
}

// 파이썬 str.splitlines 의 줄 나눔(CR 은 앞에서 LF 로 맞춘다)
const SPLITLINES = /[\n\v\f\x1c-\x1e\x85\u2028\u2029]/;

/** checks 를 비우면 도는 검사(종전 셋 — 발송 게이트·퇴고 체험 화면이 기대는 기본값) */
export const NORM_CHECKS = ['spacing', 'punct', 'comma'];
/** 문서 안 일관성(261125) — checks 에 이름을 적어야만 돈다 */
export const NORM_OPT_CHECKS = ['listEnd', 'abbrev'];
/** 받는 검사 이름 전부(입력 검사용) */
export const NORM_CHECKS_ALL = [...NORM_CHECKS, ...NORM_OPT_CHECKS];
export const NORM_CAP = 500;

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

// 걸림은 먼저 가볍게 적어 두고(줄·위치·규칙), 상한 안에 든 것만 칸·문맥을 만든다
const raw = (line, s, m, r, before, after, lead = 0) => ({ line, s, idx: m.index, m0: m[0], r, before, after, lead });
const materialize = (h) => ({
  line: h.line,
  col: colOf(h.s, h.idx) + h.lead,
  len: cpLen(h.m0),
  grade: h.r.grade,
  word: h.m0,
  reason: h.r.reason,
  basis: h.r.basis,
  ctx: around(h.s, h.idx, h.idx + h.m0.length, h.before, h.after),
});

function spacing(lines, quote) {
  const out = [];
  lines.forEach((ln, i) => {
    const s = strip(ln);
    if (!s || SPACING_SKIP.some((p) => s.startsWith(p))) return;
    if (s.startsWith('>') && !quote) return;
    const line = quote ? ln : blankQuotes(ln, SPACING_QUOTES);
    for (const r of compiled.spacing) for (const m of execAll(r.rx, line)) out.push(raw(i + 1, line, m, r, 8, 8));
  });
  return out;
}

function punct(lines, quote) {
  const out = [];
  lines.forEach((ln, i) => {
    const s = strip(ln);
    if (!s) return;
    if (!quote && PUNCT_SKIP.some((p) => s.startsWith(p))) return;
    const lw = leadWs(ln);
    const lead = lw ? cpLen(ln.slice(0, lw)) : 0;
    const line = quote ? s : fillQuoted(s);
    for (const r of compiled.punct) for (const m of execAll(r.rx, line)) out.push(raw(i + 1, line, m, r, 12, 12, lead));
    for (const r of compiled.punctRaw) for (const m of execAll(r.rx, s)) out.push(raw(i + 1, s, m, r, 12, 12, lead));
  });
  return out;
}

function comma(lines, warnOnly) {
  const out = [];
  const r = warnOnly ? COMMA_B : COMMA_A;
  lines.forEach((ln, i) => {
    const s = strip(ln);
    if (!s || COMMA_SKIP.some((p) => s.startsWith(p)) || s.includes('이상과 같이,')) return;
    const h = blankQuotes(ln, COMMA_QUOTES);
    for (const m of execAll(compiled.commaCand, h)) {
      const w = m[1];
      const end = lastCp(w);
      if (!COMMA_ENDS.some((x) => w.endsWith(x)) || !compiled.hangulEnd.test(end)) continue;
      if ((COMMA_NOUN_GO.some((x) => w.endsWith(x)) && !isVerbGo(w)) || compiled.digitEnd.test(end)) continue;
      out.push(raw(i + 1, h, m, r, 12, 10));
    }
  });
  return out;
}

// ── 문서 안 일관성(261125) — 목록 끝맺음(listEnd)·기관 약칭(abbrev). 맞춤법 규정이 아니라 업무 문서 관행이라 B(문맥 확인)만 낸다.
// 줄 하나가 아니라 문서 구조를 보는 검사라 기본(NORM_CHECKS)에 넣지 않는다 — checks 에 이름을 적어야 돈다.
// 줄은 \n 으로만 나눈다(쉼표 검사와 같다). ``` · ~~~ 코드 블록 안은 보지 않는다. quote·warnOnly 는 이 둘에 영향이 없다.
const FENCE = /^[ \t]*(?:```|~~~)/u;
const isHangul = (c) => c >= '가' && c <= '힣';

// listEnd — 같은 목록에서 대부분 문장(~다.)으로 끝나는데 몇 항목만 서술어 없이(명사·괄호로) 끝나거나, 그 반대.
// 항목 = 「- 」「* 」「1. 」「1) 」 줄(번호는 두 자리까지 — 「2026. 11. 25.」 같은 날짜 줄은 목록이 아니다).
// 이어지는 줄(들여 쓴 줄, 빈 줄 없이 붙은 줄)은 앞 항목에 붙고, 판단은 항목 끝으로 한다. 하위 목록(더 들여 쓴 항목)은 따로 본다.
// 표(|)·제목(#)·인용(>)·가로줄·HTML 줄은 목록을 끊는다. 빈 줄은 끊지 않는다(마크다운의 느슨한 목록).
const LIST_ITEM = /^([ \t]*)([-*]|\d{1,2}[.)])[ \t]+(?=\S)/u;
const LIST_BREAK = /^[ \t]*(?:[#|><]|(?:[-*_][ \t]*){3,}$)/u;
const LIST_MIN = 3; // 항목이 이보다 적으면 다수를 말할 수 없다
const END_TRIM = new Set([...'.。．!！?？…*_`~']); // 끝 마침표·강조 표시
const OPEN_OF = { ')': '(', '）': '（', ']': '[' };
const CLOSE_QUOTE = new Set([...'」』”’"\'']);
// 「요」로 끝나는 명사 — 문장(~해요)이 아니다
const YO_NOUN = ['필요', '중요', '주요', '개요', '수요', '소요', '강요', '긴요', '적요', '요요'];
const LIST_BASIS = '목록 끝맺음(규정이 아니라 업무 문서 관행)';
const indentOf = (ws) => {
  let n = 0;
  for (const c of ws) n += c === '\t' ? 4 - (n % 4) : 1;
  return n;
};

/** 항목 끝맺음 — 'sent'(문장) / 'noun'(서술어 없음) / null(판단하지 않음: 빈 항목·쌍점으로 끝나는 머리 항목) */
function endKind(text) {
  let s = text;
  for (;;) {
    let b = s.length;
    while (b > 0 && (WS.has(s[b - 1]) || END_TRIM.has(s[b - 1]))) b--;
    s = s.slice(0, b);
    // 끝 괄호는 덧붙인 말이다 — 짝이 맞으면 통째로 떼고 그 앞말로 판단한다(「…둡니다(…).」는 문장, 「…본문(…없습니다)」는 명사)
    const close = s[b - 1];
    const open = OPEN_OF[close];
    if (!open) break;
    let depth = 0;
    let j = b - 1;
    for (; j >= 0; j--) {
      if (s[j] === close) depth++;
      else if (s[j] === open && --depth === 0) break;
    }
    if (j < 0) break;
    s = s.slice(0, j);
  }
  if (!s) return null;
  const c = lastCp(s);
  if (c === ':' || c === '：') return null;
  if (CLOSE_QUOTE.has(c) || !isHangul(c)) return 'noun'; // 인용·숫자·기호로 끝나면 항목 자체의 서술어가 없다
  // 종결 어미는 줄기에 붙는다 — 홀로 선 「다」(가·나·다 순번)는 문장이 아니다
  if (!isHangul(s[s.length - 2] ?? '')) return 'noun';
  if (c === '다' || c === '까' || c === '죠') return 'sent';
  if (c === '요') return YO_NOUN.some((w) => s.endsWith(w)) ? 'noun' : 'sent';
  return 'noun'; // 명사·명사형 종결(~함·~음·~임)
}

/** 줄 끝 낱말(위치·글자) — 정규식 되짚기 없이 뒤에서 센다 */
function lastWord(s) {
  let b = s.length;
  while (b > 0 && WS.has(s[b - 1])) b--;
  let a = b;
  while (a > 0 && !WS.has(s[a - 1])) a--;
  return { index: a, 0: s.slice(a, b) };
}

function judgeList(g, out) {
  const judged = [];
  for (const it of g.items) {
    const k = endKind(it.parts.join(' '));
    if (k) judged.push({ it, k });
  }
  const n = judged.length;
  if (n < LIST_MIN) return;
  let sent = 0;
  for (const x of judged) if (x.k === 'sent') sent++;
  const noun = n - sent;
  const minor = Math.min(sent, noun);
  if (!minor || minor * 3 > n) return; // 소수가 1/3 이하일 때만 — 다수가 분명해야 한다
  const minorKind = sent < noun ? 'sent' : 'noun';
  const r = minorKind === 'noun'
    ? { grade: 'B', reason: `같은 목록 ${n}개 항목 중 ${sent}개는 문장(~다.)으로 끝나는데 이 항목은 서술어 없이 끝난다 — 끝맺음을 맞춘다`, basis: LIST_BASIS }
    : { grade: 'B', reason: `같은 목록 ${n}개 항목 중 ${noun}개는 서술어 없이(명사·명사형으로) 끝나는데 이 항목은 문장으로 끝난다 — 끝맺음을 맞춘다`, basis: LIST_BASIS };
  for (const x of judged) if (x.k === minorKind) out.push(raw(x.it.line, x.it.raw, lastWord(x.it.raw), r, 16, 0));
}

function listEnd(lines) {
  const out = [];
  const open = []; // 열린 목록(바깥 → 안): { indent, fam, items }
  let cur = null; // 마지막 항목: { indent, parts, line, raw } — line·raw 는 항목의 끝 줄
  let blank = false;
  let fence = false;
  const closeTo = (k) => {
    while (open.length > k) judgeList(open.pop(), out);
  };
  const closeAll = () => {
    closeTo(0);
    cur = null;
  };
  lines.forEach((ln, i) => {
    if (FENCE.test(ln)) {
      fence = !fence;
      closeAll();
      blank = false;
      return;
    }
    if (fence) return;
    const s = strip(ln);
    if (!s) {
      blank = true;
      return;
    }
    if (LIST_BREAK.test(ln)) {
      closeAll();
      blank = false;
      return;
    }
    const m = LIST_ITEM.exec(ln);
    if (m) {
      const indent = indentOf(m[1]);
      const fam = m[2].slice(-1); // - * . ) — 표시가 바뀌면 다른 목록
      let k = open.length;
      while (k > 0 && open[k - 1].indent > indent) k--;
      closeTo(k);
      let g = open[open.length - 1];
      if (g && g.indent === indent && g.fam !== fam) {
        closeTo(open.length - 1);
        g = undefined;
      }
      if (!g || g.indent !== indent) {
        g = { indent, fam, items: [] };
        open.push(g);
      }
      cur = { indent, parts: [ln.slice(m[0].length)], line: i + 1, raw: ln };
      g.items.push(cur);
      blank = false;
      return;
    }
    // 항목 밖 줄 — 빈 줄 없이 붙었거나(게으른 이어쓰기) 항목보다 들여 썼으면 앞 항목에 이어진다
    if (cur && (!blank || indentOf(ln.slice(0, leadWs(ln))) > cur.indent)) {
      cur.parts.push(s);
      cur.line = i + 1;
      cur.raw = ln;
    } else closeAll();
    blank = false;
  });
  closeAll();
  // 하위 목록이 먼저 닫히므로 줄 차례로 맞춘다
  return out.sort((a, b) => a.line - b.line || a.idx - b.idx);
}

// abbrev — 기관 약칭이 정의 없이 섞인 곳. 두 경우만 본다(과잉 걸림을 막으려고 좁게 둔다).
//  ① 「한국」+X 꼴 정식 명칭(끝말 공사·공단·원·재단·협회 등)이 문서에 있는데, X 를 「한국」 없이 따로 썼고 「(이하 「X」)」 정의가 없다
//  ② 기관명 뒤 「(이하 「X」)」·「(이하 X)」 정의가 있는데, 그보다 앞에서 X 를 썼다
// X 는 낱말 첫머리에서 시작하고 뒤에 조사만 붙은 것만 본다 — 다른 정식 명칭 속 글자(「한국가나공사」 속 「가나공사」)·다른 낱말(「대한가나공사」)은 보지 않는다.
// 끝말만 남은 약칭(「…평가원」을 「평가원」으로)·영문 약칭·법령 약칭은 보지 않는다.
// 정식 명칭·정의는 모든 줄(제목·인용·표 포함)에서 모으고, 약칭은 쉼표 검사처럼 > 인용·# 제목·그림 줄과 따옴표(“ ” ‘ ’ 「 」 " ") 안을 빼고 찾는다(표 줄은 본다).
const ORG_ENDS = ['공제회', '진흥회', '연합회', '위원회', '공사', '공단', '재단', '협회', '센터', '원'];
// 정식 명칭·약칭 뒤에 붙는 조사 — 짧은 것부터(긴 몸말을 먼저 본다)
const PARTICLES = ['', '은', '는', '이', '가', '을', '를', '의', '과', '와', '에', '도', '만', '로', '나', '며', '다', '인', '라', '란', '들',
  '에서', '에게', '에는', '에도', '으로', '로서', '로는', '로도', '까지', '부터', '보다', '처럼', '과의', '와의', '과는', '와는', '과도', '와도',
  '이나', '이며', '이고', '이다', '이라', '이란', '라는', '였다', '마다', '이랑', '들은', '들이', '들의',
  '에서는', '에서도', '으로서', '으로는', '으로도', '이라는', '이었다', '입니다'];
const WORD = /(?<![가-힣A-Za-z0-9])[가-힣A-Za-z0-9]+/gu;
// (이하 「X」) · (이하 X) · (이하 "X"라 한다) … — 머리 「(이하」만 식으로 찾고 나머지는 손으로 훑는다.
// 한 식에 [ \t]* 를 선택 요소 사이로 잇달아 두면, 닫는 괄호 없는 긴 공백 덩어리에서 되짚기가 제곱·세제곱이 된다(261125 실측)
const DEF_HEAD = /\([ \t]*이하/gu;
const OPEN_QUOTE = new Set([...'「『“"‘\'']);
const NAME_STOP = new Set([...'」』”"’\'()']);
const TAIL_CH = new Set([...'이라고으로한다함칭부른']); // 「라 한다」「으로 칭한다」 꼴 꼬리에 쓰는 글자
const TAIL_OK = /^(?:이?라고?|으?로)?(?:한다|함|칭한다|칭함|부른다)?$/u;
const TAIL_VERB = /^(?:한다|함|칭한다|칭함|부른다)$/u;
const NAME_TAIL = ['이라고', '라고', '이라', '라', '으로', '로']; // 따옴표 없는 「X라 한다」의 「라」
const isBlank = (c) => c === ' ' || c === '\t';
/** 「(이하」 뒤(from)가 정의 꼴이면 약칭, 아니면 null */
function defAt(line, from) {
  let i = from;
  while (i < line.length && isBlank(line[i])) i++;
  const quoted = OPEN_QUOTE.has(line[i]);
  if (quoted) {
    i++;
    while (i < line.length && isBlank(line[i])) i++;
  }
  const a = i;
  while (i < line.length && !WS.has(line[i]) && !NAME_STOP.has(line[i])) i++;
  let name = line.slice(a, i);
  if (!name) return null;
  let tail = '';
  for (; i < line.length && line[i] !== ')'; i++) {
    const c = line[i];
    if (isBlank(c) || CLOSE_QUOTE.has(c)) continue;
    if (!TAIL_CH.has(c) || tail.length >= 8) return null;
    tail += c;
  }
  if (i >= line.length || !TAIL_OK.test(tail)) return null;
  if (!quoted && TAIL_VERB.test(tail)) {
    const t = NAME_TAIL.find((x) => name.length > x.length && name.endsWith(x));
    if (t) name = name.slice(0, name.length - t.length);
  }
  return name;
}
const ABBR_SKIP = ['>', '#', '<<', '!['];
const ABBR_BASIS = '약칭 일관성(규정이 아니라 업무 문서 관행)';
/** 목적격 조사 — 끝 글자에 받침이 있으면 「을」, 없으면 「를」(한글이 아니면 「을(를)」) */
const eul = (w) => {
  const c = lastCp(w);
  return isHangul(c) ? ((c.charCodeAt(0) - 0xac00) % 28 ? '을' : '를') : '을(를)';
};

/** 기관 이름이면 끝말 — 끝말 앞에 한 글자(「원」은 세 글자) 이상 있어야 한다(「교원」「연구원」「공사」 같은 낱말을 기관으로 보지 않게) */
function orgEnd(name) {
  const e = ORG_ENDS.find((x) => name.endsWith(x));
  if (!e) return null;
  return cpLen(name) - cpLen(e) >= (e === '원' ? 3 : 1) ? e : null;
}
/** 낱말에서 끝 조사를 뗀 몸말 — 긴 몸말부터, cond 를 처음 만족하는 것 */
function stemOf(word, cond) {
  for (const p of PARTICLES) {
    if (word.length > p.length && word.endsWith(p)) {
      const stem = word.slice(0, word.length - p.length);
      if (cond(stem)) return stem;
    }
  }
  return null;
}
/** 정의 앞 기관명 — 「…한국가나공사(이하」의 「한국가나공사」(닫는 따옴표·공백은 건너뛴다) */
function nameBefore(line, at) {
  let b = at;
  while (b > 0 && (WS.has(line[b - 1]) || CLOSE_QUOTE.has(line[b - 1]))) b--;
  let a = b;
  while (a > 0 && /[가-힣A-Za-z0-9]/u.test(line[a - 1])) a--;
  return line.slice(a, b);
}

function abbrev(lines) {
  const names = new Map(); // X → 정식 명칭(「한국」+X)
  const defs = new Map(); // 약칭 → { line, col, full } (처음 정의)
  let fence = false;
  lines.forEach((ln, i) => {
    if (FENCE.test(ln)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    for (const m of execAll(WORD, ln)) {
      const w = m[0];
      if (!w.startsWith('한국')) continue;
      const full = stemOf(w, (st) => st.startsWith('한국') && !!orgEnd(st.slice(2)));
      if (full && !names.has(full.slice(2))) names.set(full.slice(2), full);
    }
    for (const m of execAll(DEF_HEAD, ln)) {
      const abbr = defAt(ln, m.index + m[0].length);
      if (!abbr || defs.has(abbr)) continue;
      const full = nameBefore(ln, m.index);
      if (!full || !orgEnd(full)) continue;
      // 칸은 줄마다 한 번 만든 표로 센다(정의·걸림마다 줄 처음부터 세면 걸림 수 × 줄 길이가 된다)
      defs.set(abbr, { line: i + 1, col: colOf(ln, m.index), full });
    }
  });
  const watched = new Map();
  for (const [x, full] of names) if (!defs.has(x)) watched.set(x, { full });
  for (const [x, d] of defs) watched.set(x, d);
  if (!watched.size) return [];

  const out = [];
  fence = false;
  lines.forEach((ln, i) => {
    if (FENCE.test(ln)) {
      fence = !fence;
      return;
    }
    const s = strip(ln);
    if (fence || !s || ABBR_SKIP.some((p) => s.startsWith(p))) return;
    const h = blankQuotes(ln, COMMA_QUOTES);
    for (const m of execAll(WORD, h)) {
      const x = stemOf(m[0], (st) => watched.has(st));
      if (!x) continue;
      const d = watched.get(x);
      let r;
      if (d.line === undefined) {
        r = { grade: 'B', reason: `「${d.full}」${eul(d.full)} 줄인 「${x}」${eul(x)} 정의 없이 썼다 — 정식 명칭을 쓰거나, 처음 나오는 곳에 「(이하 「${x}」)」를 둔다`, basis: ABBR_BASIS };
      } else if (i + 1 < d.line || (i + 1 === d.line && colOf(h, m.index) < d.col)) {
        r = { grade: 'B', reason: `약칭 「${x}」${eul(x)} 정의한 곳(${d.line}행 「${d.full}(이하 「${x}」)」)보다 앞에서 썼다 — 정의를 앞으로 옮기거나 정식 명칭을 쓴다`, basis: ABBR_BASIS };
      } else continue;
      out.push(raw(i + 1, h, { index: m.index, 0: x }, r, 10, 10));
    }
  });
  return out;
}

/**
 * A 먼저(만든 차례), 남는 칸에 B — counts 는 전부. 상한 밖 걸림은 세기만 한다
 * @returns {{ counts: { A: number, B: number }, hits: any[], truncated?: boolean }}
 */
function pack(all, cap) {
  let nA = 0;
  for (const h of all) if (h.r.grade === 'A') nA++;
  const nB = all.length - nA;
  const takeA = Math.min(cap, nA);
  const takeB = Math.min(cap - takeA, nB);
  const hits = [];
  for (const h of all) {
    if (hits.length >= takeA) break;
    if (h.r.grade === 'A') hits.push(materialize(h));
  }
  let b = 0;
  for (const h of all) {
    if (b >= takeB) break;
    if (h.r.grade === 'B') { hits.push(materialize(h)); b++; }
  }
  const r = { counts: { A: nA, B: nB }, hits };
  if (all.length > hits.length) r.truncated = true;
  return r;
}

/**
 * @param {string} text
 * @param {{ checks?: ('spacing'|'punct'|'comma'|'listEnd'|'abbrev')[], quote?: boolean, warnOnly?: boolean, cap?: number }} [o]
 *   checks — 비우면 spacing·punct·comma. listEnd(목록 끝맺음)·abbrev(기관 약칭)는 적어야만 돈다.
 *   quote — > 인용 줄과 “ ” 원문 인용도 본다(띄어쓰기·문장 부호. 쉼표·listEnd·abbrev 는 늘 인용을 뺀다). warnOnly — 쉼표 걸림을 B 로(PDF·PPTX 추출본).
 */
export function checkNorms(text, o = {}) {
  const checks = o.checks?.length ? o.checks : NORM_CHECKS;
  const cap = o.cap ?? NORM_CAP;
  // 파이썬 read_text 처럼 줄 끝을 \n 으로 맞춘다. 띄어쓰기·문장 부호는 splitlines(\v \f \x1c-\x1e \x85 U+2028 U+2029 도 줄 나눔), 쉼표는 \n 만
  const t = String(text ?? '').replace(/\r\n?/g, '\n');
  const out = {};
  try {
    if (checks.includes('spacing') || checks.includes('punct')) {
      const lines = t.split(SPLITLINES);
      if (checks.includes('spacing')) out.spacing = pack(spacing(lines, !!o.quote), cap);
      if (checks.includes('punct')) out.punct = pack(punct(lines, !!o.quote), cap);
    }
    if (checks.includes('comma')) out.comma = pack(comma(t.split('\n'), !!o.warnOnly), cap);
    if (checks.includes('listEnd') || checks.includes('abbrev')) {
      const lines = t.split('\n');
      if (checks.includes('listEnd')) out.listEnd = pack(listEnd(lines), cap);
      if (checks.includes('abbrev')) out.abbrev = pack(abbrev(lines), cap);
    }
  } finally {
    colLine = null; // 마지막 줄을 붙잡아 두지 않는다
    colTable = null;
  }
  return out;
}
