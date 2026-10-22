// 정밀 점검 — 취업규칙 본문을 조문 단위로 나누고 종전·개정안 조문을 제목·번호로 짝짓는다.
// 기준 구현은 scripts/work_rules_c/articles.py 다. 규칙을 바꾸면 두 곳을 같이 고친다.

export interface Article {
  no: string;
  title: string;
  body: string;
}

export type PairStatus = '동일' | '변경' | '신설' | '삭제';

export interface ArticlePair {
  no: string;
  status: PairStatus;
  old: Article | null;
  new: Article | null;
  oldNo: string | null;
}

const NO = String.raw`제\s*\d+\s*조(?:\s*의\s*\d+)?`;
// 조 머리: 제N조(제목) · 제N조【제목】 · 제N조 본문(괄호 없음 — 조사·「제」가 바로 붙으면 본문 속 인용으로 본다)
const HEAD = new RegExp(String.raw`^\s*(${NO})\s*(?:\(([^)]*)\)|【([^】]*)】|(?=\s+(?!에|의|와|과|을|를|및|부터|까지|제|·|,)\S))`);
const PAGE_MARK = /^-\s*\d+\s*-$/;
const TRAILING_PAGE_MARK = /\s+-\s*\d+\s*-\s*$/;
const CHAPTER = /^\s*제\s*\d+\s*(?:장|절|관)(?:\s|$)/; // 장·절 제목 — 어느 조문의 본문도 아니다
const TOC_REST = /^(?:\[[^\]]*\]\s*)*\.*\s*\d*$/; // 목차 줄 꼬리: 「[필수] 7」·「…… 12」·쪽 번호뿐
const STOP = /^\s*(?:부\s*칙|개정\s*부\s*칙|附\s*則|[[【]\s*별\s*[지표]|별\s*[지표]\s*제?\s*\d+\s*호)/;
export const DUP = '(번호 중복)';

export function splitArticles(text: string): Article[] {
  const found = new Map<string, { title: string; lines: string[] }>();
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(TRAILING_PAGE_MARK, '').trim();
    if (!line || PAGE_MARK.test(line) || CHAPTER.test(line)) continue;
    if (STOP.test(line)) {
      // 목차에 적힌 「부칙」은 멈춤 신호가 아니다 — 바로 앞 조문에 본문이 있을 때만 멈춘다
      if (current && found.get(current)!.lines.length) break;
      current = null;
      continue;
    }
    const m = HEAD.exec(line);
    if (m) {
      current = m[1].replace(/\s/g, '');
      const title = (m[2] ?? m[3] ?? '').trim();
      let rest = line.slice(m[0].length).trim();
      if (TOC_REST.test(rest)) rest = ''; // 목차 항목 — 본문이 아니다
      // 본문 있는 조문이 제목을 달리해 또 나오면 번호 중복 — 덮어쓰지 않는다.
      // 제목이 같으면 목차·반복본이므로 뒤의 것으로 바꾼다(목차 항목에 군더더기 줄이 붙는 일이 흔하다)
      const prev = found.get(current);
      if (prev?.lines.length && norm(prev.title) !== norm(title)) current += DUP;
      found.set(current, { title, lines: rest ? [rest] : [] });
      continue;
    }
    if (current) found.get(current)!.lines.push(line);
  }
  return [...found].map(([no, { title, lines }]) => ({ no, title, body: lines.join('\n') }));
}

/** 번호가 겹친 조문 — 앞의 것과 「(번호 중복)」이 붙은 것 모두. */
export function duplicated(nos: Iterable<string>): Set<string> {
  const all = new Set(nos);
  return new Set([...all].filter((n) => n.includes(DUP) || all.has(n + DUP)));
}

const key = (no: string) => (no.match(/\d+/g) ?? []).map(Number);
const norm = (s: string) => s.replace(/\s+/g, '');
const status = (a: Article, b: Article): PairStatus => (norm(a.body) === norm(b.body) ? '동일' : '변경');

function cmpKey(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** 제목이 같은 조문끼리 먼저 짝짓고(번호가 밀려도 따라간다), 남은 것은 번호로 짝짓는다. */
export function pairArticles(old: Article[], neu: Article[]): ArticlePair[] {
  const oldLeft = new Map(old.map((a) => [a.no, a]));
  const byNew = new Map<string, ArticlePair>();
  const titled = new Map<string, Article[]>();
  for (const a of old) if (a.title) titled.set(norm(a.title), [...(titled.get(norm(a.title)) ?? []), a]);
  for (const b of neu) {
    const cands = b.title ? (titled.get(norm(b.title)) ?? []).filter((a) => oldLeft.has(a.no)) : [];
    if (!cands.length) continue;
    const rank = (x: Article) => [x.no !== b.no ? 1 : 0, Math.abs((key(x.no)[0] ?? 0) - (key(b.no)[0] ?? 0))];
    const a = cands.reduce((p, x) => (cmpKey(rank(x), rank(p)) < 0 ? x : p));
    oldLeft.delete(a.no);
    byNew.set(b.no, { no: b.no, status: status(a, b), old: a, new: b, oldNo: a.no });
  }
  for (const b of neu) {
    if (byNew.has(b.no)) continue;
    const a = oldLeft.get(b.no);
    oldLeft.delete(b.no);
    byNew.set(b.no, a ? { no: b.no, status: status(a, b), old: a, new: b, oldNo: a.no }
      : { no: b.no, status: '신설', old: null, new: b, oldNo: null });
  }
  const pairs = [...byNew.values(),
    ...[...oldLeft.values()].map((a): ArticlePair => ({ no: a.no, status: '삭제', old: a, new: null, oldNo: a.no }))];
  // 파이썬 sorted 와 같게 — 안정 정렬, 같은 번호면 삭제가 뒤
  return pairs.sort((p, q) => cmpKey(key(p.no), key(q.no)) || Number(p.status === '삭제') - Number(q.status === '삭제'));
}
