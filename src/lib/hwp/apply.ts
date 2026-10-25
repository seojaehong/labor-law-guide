// 취업규칙 점검 결과를 원래 한글 파일에 반영한다. 서버·AI 호출 없이 브라우저 안에서만 한다.
// planChanges: (문단 색인, 점검 항목) → 변경 목록. applyChanges: (원본 바이트, 수락 목록) → 새 파일 바이트.
// 원본 바이트는 고치지 않는다. 수락을 바꿀 때마다 원본에서 다시 적용하므로 거절·되돌리기는 목록에서 빼는 것으로 끝난다.
import type { InitInput } from '@rhwp/core';
import { splitArticles, type PeriodItem, type StdRule } from '@/lib/laws/standard-check';
import { HwpEditDoc, type HwpKind } from './hwp-doc';
import { listKey, nextLoc, type IndexedPara, type ParaLoc } from './para-index';

/** 빈 문단을 뺀 줄. ord = 색인 안 위치(문서 순서) */
export interface Line {
  text: string;
  loc: ParaLoc;
  controls: number;
  ord: number;
}

/** 문서에서 찾은 조문 — start·end 는 lines 번호(끝 포함). 장 제목·부칙 머리는 넣지 않는다 */
export interface Article {
  no: string;
  title: string;
  start: number;
  end: number;
  /** 조문 머리(「제N조(제목)」)가 끝나는 글자 위치 */
  headEnd: number;
  headStart: number;
  /** 부칙 아래 조문 */
  supplementary: boolean;
}

export type ChangeKind = 'replace' | 'insert' | 'word' | 'manual';

export interface Change {
  id: string;
  kind: ChangeKind;
  /** 개정 주제(매핑 topic) */
  topic: string;
  /** 표준 조문 표시 */
  std: string;
  /** 바뀌는 자리 설명 */
  where: string;
  /** 지금 글자. 삽입은 '' */
  before: string;
  /** 바꿀 문안 제안 — 수락 전에 고칠 수 있다. 삽입은 머리(번호·제목)를 뺀 본문 */
  after: string;
  /** replace: 바꿀 줄 범위 */
  start?: number;
  end?: number;
  /** insert: 이 조문(articles 번호) 뒤에 넣는다 */
  anchor?: number;
  /** insert: 새 조문 번호·제목. headless 면 머리 없이 항만 넣는다 */
  no?: string;
  title?: string;
  headless?: boolean;
  /** word: 줄 안 위치 */
  word?: { line: number; at: number; length: number };
  /** 자동 반영을 끈 이유 */
  blocked?: string;
  /** 넣는 자리를 사람이 꼭 봐야 하는 변경 */
  review?: string;
  /** 같은 글자를 건드려 함께 수락할 수 없는 변경 */
  overlaps: string[];
}

export interface Plan {
  lines: Line[];
  articles: Article[];
  changes: Change[];
}

const squash = (s: string) => s.replace(/[\s·ㆍ.,()]/g, '');
const HEAD = /제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\)|【[^】]*】|\[[^\]]*\])?/;
/** 장·절·관 제목, 부칙 머리 — 조문 범위를 여기서 끊는다 */
const DIVIDER = /^\s*(?:제\s*\d+\s*(?:장|절|관)(?:\s|$)|부\s*칙(?:\s|$|\())/;
const SUPP = /^\s*부\s*칙(?:\s|$|\()/;
const CIRCLED = /^[①-⑳]/;

export function toLines(index: IndexedPara[]): Line[] {
  return index.flatMap((e, ord) => (e.text.trim() ? [{ text: e.text, loc: e.loc, controls: e.controls, ord }] : []));
}

export function findArticles(lines: Line[]): Article[] {
  const out: Article[] = [];
  let supp = false;
  let cur: Article | null = null;
  const close = () => { if (cur) out.push(cur); cur = null; };
  lines.forEach((l, i) => {
    const heading = l.text.includes('\n') ? [] : splitArticles(l.text);
    if (heading.length) {
      close();
      const m = l.text.match(HEAD)!;
      cur = { no: heading[0].no, title: heading[0].title, start: i, end: i, headStart: m.index!, headEnd: m.index! + m[0].length, supplementary: supp };
      return;
    }
    if (DIVIDER.test(l.text)) {
      close();
      if (SUPP.test(l.text)) supp = true;
      return;
    }
    // 조문은 같은 목록(본문 구역·같은 셀) 안에서만 이어진다
    if (cur && listKey(lines[cur.end].loc) === listKey(l.loc)) cur.end = i;
    else close();
  });
  close();
  return out;
}

const label = (a: Article) => `${a.supplementary ? '부칙 ' : ''}${a.no}${a.title ? `(${a.title})` : ''}`;

/** 「앞 조문 번호+의2」. 이미 있으면 다음 가지 번호 */
export function nextArticleNo(prev: string, taken: Set<string>): string {
  const m = prev.match(/^(제\d+조)(?:의(\d+))?$/);
  if (!m) return prev;
  let n = m[2] ? Number(m[2]) + 1 : 2;
  while (taken.has(`${m[1]}의${n}`)) n++;
  return `${m[1]}의${n}`;
}

/** 삽입 번호가 쓸 수 있는지. 문제가 있으면 이유 */
export function insertProblem(c: Change, articles: Article[]): string | null {
  if (c.kind !== 'insert' || c.headless) return null;
  if (!/^제\d+조(?:의\d+)?$/.test(c.no ?? '')) return '조문 번호는 「제12조의2」 모양으로 적으세요';
  if (articles.some((a) => a.no === c.no)) return `${c.no}는 이미 있습니다. 다른 번호를 적으세요`;
  return null;
}

const bigrams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
function dice(a: string, b: string): number {
  const x = bigrams(squash(a)), y = bigrams(squash(b));
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}

/** 매핑 문안을 「제○조」 덩어리로 나눈다. 머리 없이 시작하는 앞부분(「○. 노동절」)도 한 덩어리 */
function blocks(clause: string): string[][] {
  const out: string[][] = [];
  for (const l of clause.split(/\r?\n/).map((x) => x.trimEnd()).filter((x) => x.trim())) {
    if (/^\s*제○조/.test(l) || !out.length) out.push([l]);
    else out[out.length - 1].push(l);
  }
  return out;
}

const PARTIAL = '부분 문안(…·○.)이라 자동 반영하지 않습니다. 문안을 복사해 직접 고치세요';
const DUP = (no: string) => `${no}가 문서에 두 번 이상 있습니다(부칙 등). 어느 조문인지 확인해 직접 고치세요`;
const CTRL = '조문 안에 표·그림이 있어 자동 반영하지 않습니다. 문안을 복사해 직접 고치세요';

export function planChanges(index: IndexedPara[], items: PeriodItem[]): Plan {
  const lines = toLines(index);
  const articles = findArticles(lines);
  const count = new Map<string, number>();
  for (const a of articles) count.set(a.no, (count.get(a.no) ?? 0) + 1);
  const taken = new Set(articles.map((a) => a.no));
  const firstSupp = articles.findIndex((a) => a.supplementary);
  const lastMain = firstSupp > 0 ? firstSupp - 1 : firstSupp < 0 ? articles.length - 1 : 0;
  const changes: Change[] = [];
  const text = (s: number, e: number) => lines.slice(s, e + 1).map((l) => l.text).join('\n');
  // 줄 사이의 빈 문단(글자 없는 표 문단 등)까지 본다 — 표가 조문 중간에 있으면 문단을 합치다 표를 건드린다
  const hasCtrl = (s: number, e: number) => index.slice(lines[s].ord, lines[e].ord + 1).some((x) => x.controls > 0);

  for (const it of items) {
    if (it.status === '반영됨') continue;
    const std = `${it.std.no}(${it.std.title})`;
    const mine = new Set(it.user.map((u) => u.no));
    it.verdicts.forEach((v, vi) => {
      if (v.status === '반영됨') return;
      const rule = v.rule as StdRule;
      const key = `${it.std.id}:${vi}`;
      const base = { topic: rule.topic, std, overlaps: [] as string[] };

      // 낱말 치환 — 옛 명칭이 문서 어디에 남아 있든 위치마다 하나씩
      if (rule.everywhere && v.stale.length && rule.ok[0]) {
        lines.forEach((l, li) => {
          for (const s of rule.stale) {
            for (let at = l.text.indexOf(s); at >= 0; at = l.text.indexOf(s, at + s.length)) {
              const a = articles.find((x) => li >= x.start && li <= x.end);
              changes.push({
                ...base, id: `${key}:w:${li}:${at}:${s}`, kind: 'word', where: a ? label(a) : '조문 밖 글',
                before: s, after: rule.ok[0], word: { line: li, at, length: s.length },
                ...(l.controls ? { blocked: CTRL } : {}),
              });
            }
          }
        });
      }

      if (!rule.clause) return;
      blocks(rule.clause).forEach((blk, bi) => {
        const id = `${key}:b${bi}`;
        const head = blk[0].match(/^\s*제○조\s*\(([^)]*)\)\s*/);
        const proposal = blk.join('\n');
        if (!head || /…/.test(proposal) || blk.some((l) => /^\s*○/.test(l))) {
          changes.push({ ...base, id, kind: 'manual', where: head ? head[1] : '해당 조문', before: '', after: proposal, blocked: PARTIAL });
          return;
        }
        const title = head[1].trim();
        const body = [blk[0].slice(head[0].length), ...blk.slice(1)];
        const marker = body[0].trim().match(CIRCLED)?.[0];
        const same = articles.filter((a) => squash(a.title) === squash(title));
        const target = same.find((a) => mine.has(a.no)) ?? same[0];

        if (target && it.status !== '조문 추가') {
          const ti = articles.indexOf(target);
          if ((count.get(target.no) ?? 0) > 1) {
            changes.push({ ...base, id, kind: 'replace', where: label(target), before: text(target.start, target.end), after: proposal.replace('제○조', target.no), start: target.start, end: target.end, blocked: DUP(target.no) });
            return;
          }
          if (marker && marker !== '①') {
            // 항 하나만 바꾸는 문안 — 같은 항 번호로 시작하는 줄부터 다음 항 앞까지
            let s = -1;
            for (let i = target.start; i <= target.end; i++) if (lines[i].text.trim().startsWith(marker)) { s = i; break; }
            if (s < 0) {
              changes.push({ ...base, id, kind: 'insert', where: `${label(target)} 끝`, before: '', after: body.join('\n').trim(), anchor: ti, headless: true, review: `${label(target)}에 ${marker}항이 없어 조문 끝에 붙입니다. 항 번호와 자리를 확인하세요` });
              return;
            }
            let e = s;
            while (e + 1 <= target.end && !CIRCLED.test(lines[e + 1].text.trim())) e++;
            changes.push({ ...base, id, kind: 'replace', where: `${label(target)} ${marker}항`, before: text(s, e), after: body.join('\n').trim(), start: s, end: e, ...(hasCtrl(s, e) ? { blocked: CTRL } : {}) });
            return;
          }
          // 조문 통째 — 머리(번호·제목)는 내 문서 것을 둔다
          const p0 = lines[target.start].text;
          const keepHead = p0.slice(0, target.headEnd);
          const headOnly = !p0.slice(target.headEnd).trim();
          const first = body[0].trim();
          const next = headOnly ? [keepHead, first, ...body.slice(1)] : [`${keepHead} ${first}`, ...body.slice(1)];
          changes.push({ ...base, id, kind: 'replace', where: label(target), before: text(target.start, target.end), after: next.filter((l) => l.trim()).join('\n'), start: target.start, end: target.end, ...(hasCtrl(target.start, target.end) ? { blocked: CTRL } : {}) });
          return;
        }
        // 새 조문 — 기본 자리: 짝지은 내 조문 뒤, 없으면 본칙 마지막 조문 뒤
        if (!articles.length) {
          changes.push({ ...base, id, kind: 'manual', where: title, before: '', after: proposal, blocked: '문서에서 조문을 찾지 못해 넣을 자리를 정할 수 없습니다' });
          return;
        }
        const own = articles.map((a, i) => [a, i] as const).filter(([a]) => mine.has(a.no) && !a.supplementary);
        const anchor = own.length ? own[own.length - 1][1] : lastMain;
        changes.push({
          ...base, id, kind: 'insert', where: `${label(articles[anchor])} 뒤`, before: '', after: body.join('\n').trim(), anchor, title,
          no: nextArticleNo(articles[anchor].no, taken),
          review: '넣을 자리와 조문 번호를 확인하세요. 뒤 조문 번호와 다른 조문이 인용한 번호는 바뀌지 않습니다',
        });
      });
    });
  }

  // 같은 자리를 겨누는 낱말 치환은 하나만 — 옛 명칭과 가장 닮은 새 명칭을 남긴다(「배우자 출산휴가」→「배우자 출산전후휴가」)
  const words = changes.filter((c) => c.kind === 'word');
  const drop = new Set<Change>();
  for (const a of words) for (const b of words) {
    if (a === b || drop.has(a) || drop.has(b) || a.word!.line !== b.word!.line) continue;
    const [x, y] = [a.word!, b.word!];
    if (x.at < y.at + y.length && y.at < x.at + x.length) drop.add(dice(a.before, a.after) >= dice(b.before, b.after) ? b : a);
  }
  const kept = changes.filter((c) => !drop.has(c));
  // 같은 줄을 건드리는 변경끼리는 하나만 수락할 수 있다
  const span = (c: Change): [number, number] | null => (c.kind === 'replace' ? [c.start!, c.end!] : c.kind === 'word' ? [c.word!.line, c.word!.line] : null);
  for (const a of kept) for (const b of kept) {
    const [x, y] = [span(a), span(b)];
    if (a !== b && x && y && x[0] <= y[1] && y[0] <= x[1] && !(a.kind === 'word' && b.kind === 'word')) a.overlaps.push(b.id);
  }
  return { lines, articles, changes: kept };
}

/** 이 변경이 들어간 뒤 문서에 있어야 할 줄 */
export function resultLines(c: Change): string[] {
  const after = c.after.split(/\r?\n/).filter((l) => l.trim());
  if (c.kind !== 'insert' || c.headless) return after;
  const head = `${c.no}(${c.title})`;
  return [after[0] ? `${head} ${after[0].trim()}` : head, ...after.slice(1)];
}

export function canAccept(c: Change, accepted: Change[], articles: Article[]): string | null {
  if (c.kind === 'manual' || c.blocked) return c.blocked ?? PARTIAL;
  if (!c.after.trim()) return '바꿀 문안이 비었습니다';
  const p = insertProblem(c, articles);
  if (p) return p;
  if (c.kind === 'insert' && !c.headless && accepted.some((x) => x !== c && x.kind === 'insert' && !x.headless && x.no === c.no)) return `${c.no}를 넣는 변경이 이미 있습니다`;
  const clash = accepted.find((x) => x !== c && c.overlaps.includes(x.id));
  return clash ? `같은 자리를 고치는 「${clash.topic}」 변경을 이미 수락했습니다` : null;
}

export interface Applied {
  bytes: Uint8Array;
  kind: HwpKind;
  /** 저장 손실 보고 수 — 0 이어야 한다 */
  loss: number;
  /** 저장본을 다시 열었을 때 찾지 못한 줄 */
  missing: string[];
}

/** 원본 바이트에서 수락한 변경만 적용한 새 파일. 뒤 문단부터 거꾸로 적용해 앞 좌표가 밀리지 않게 한다 */
/** 출력 기본값은 hwpx — rhwp 가 다시 쓴 .hwp 는 글자만 바꿔도 한컴 한글에서 안 열린 실측이 있다(구조 검증은 통과).
 *  .hwp 출력은 그 경고를 붙여 고를 때만 쓴다 */
export async function applyChanges(original: Uint8Array, accepted: Change[], out: HwpKind = 'hwpx', wasm?: InitInput): Promise<Applied> {
  const doc = await HwpEditDoc.open(original.slice(), wasm);
  try {
    const plan = { lines: toLines(doc.paragraphs()) };
    const articles = findArticles(plan.lines);
    accepted.forEach((c, i) => {
      const why = canAccept(c, accepted.slice(0, i), articles);
      if (why) throw new Error(`${c.topic}: ${why}`);
    });
    const at = (i: number) => {
      const l = plan.lines[i];
      if (!l) throw new Error('문서가 점검할 때와 다릅니다. 파일을 다시 올리세요');
      return l;
    };
    // 점검 때 본 글자와 지금 글자가 같아야 고친다
    for (const c of accepted) {
      const now = c.kind === 'replace' ? plan.lines.slice(c.start!, c.end! + 1).map((l) => l.text).join('\n')
        : c.kind === 'word' ? at(c.word!.line).text.slice(c.word!.at, c.word!.at + c.word!.length) : c.before;
      if (now !== c.before) throw new Error('문서가 점검할 때와 다릅니다. 파일을 다시 올리세요');
    }
    // 정렬 열쇠: [문단 순서, 문단 안 위치]. 삽입은 기준 조문 끝 문단의 가장 뒤
    const key = (c: Change): [number, number] =>
      c.kind === 'replace' ? [at(c.start!).ord, 0] : c.kind === 'word' ? [at(c.word!.line).ord, c.word!.at] : [at(articles[c.anchor!].end).ord, Infinity];
    const order = [...accepted].sort((a, b) => { const [x, y] = [key(a), key(b)]; return y[0] - x[0] || y[1] - x[1]; });
    const ops = doc.ops();
    doc.batch(() => {
      for (const c of order) {
        if (c.kind === 'word') {
          const w = c.word!;
          ops.replace(at(w.line).loc, w.at, w.length, c.after);
        } else if (c.kind === 'replace') {
          const olds = plan.lines.slice(c.start!, c.end! + 1);
          const next = resultLines(c);
          const n = olds.length, m = next.length;
          for (let j = m - 1; j >= n; j--) ops.insert(ops.splitAtEnd(olds[n - 1].loc), 0, next[j]);
          for (let i = n - 1; i >= m; i--) ops.drop(olds[i].loc);
          for (let i = Math.min(n, m) - 1; i >= 0; i--) ops.rewrite(olds[i].loc, next[i]);
        } else if (c.kind === 'insert') {
          const a = articles[c.anchor!];
          const end = at(a.end).loc;
          const next = resultLines(c);
          for (let j = next.length - 1; j >= 0; j--) ops.insert(ops.splitAtEnd(end), 0, next[j]);
          // 새 조문 머리는 기준 조문 머리의 글자 모양을 따른다(본문 끝 글자를 물려받아 머리가 보통 글씨가 되는 것을 막는다)
          if (!c.headless) ops.setCharShape(nextLoc(end), 0, `${c.no}(${c.title})`.length, ops.charShape(at(a.start).loc, a.headStart).charShapeId);
        }
      }
    });
    const { bytes, loss } = doc.exportWithReport(out);
    const back = await HwpEditDoc.open(bytes, wasm);
    const have = new Set(toLines(back.paragraphs()).map((l) => l.text.trim()));
    back.free();
    const missing = accepted.filter((c) => c.kind !== 'word').flatMap(resultLines).map((l) => l.trim()).filter((l) => !have.has(l));
    // 낱말 치환은 줄 전체가 바뀌므로 바뀐 낱말이 남았는지로 본다
    for (const c of accepted.filter((x) => x.kind === 'word')) if (![...have].some((l) => l.includes(c.after))) missing.push(c.after);
    return { bytes, kind: out, loss, missing };
  } finally {
    doc.free();
  }
}

/** 내려받을 이름: 원래 이름 + _수정안 + 원래 형식 */
export function proposalName(name: string, kind: HwpKind): string {
  const base = name.replace(/\.(hwpx?|HWPX?)$/, '') || '취업규칙';
  return `${base}_수정안.${kind}`;
}
