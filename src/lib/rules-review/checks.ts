// 규정 정비 점검 — 규정끼리 맞춰 보고 어긋난 자리(항목)를 낸다. 판정이 아니라 「확인할 곳」 목록이다.
// 고친 문안(after)은 기계적으로 안전한 경우에만 낸다. 그렇지 않으면 null 이고, 담당자가 직접 쓴다.
import { articleAt, articleLabel, articleText, CIRCLED, HEAD, noKey, type Article, type Regulation } from './model';
import { bareName, LAW_SUFFIX, normName, REG_SUFFIX, sameName, similarity } from './names';
import { PLAIN_RULES } from './plain';

export type FindingKind =
  | 'reg-ref' | 'reg-name' | 'article-ref' | 'para-ref' | 'deleted-ref' | 'delegation' | 'parent'
  | 'annex-missing' | 'annex-unused' | 'numbering' | 'para-numbering' | 'definition' | 'same-matter'
  | 'plain' | 'amend-mark' | 'para-glyph'
  /** 점검 항목이 아니라 담당자가 조문을 직접 고친 줄 */
  | 'amend';

export const KIND_LABEL: Record<FindingKind, string> = {
  'reg-ref': '묶음에 없는 규정 인용',
  'reg-name': '규정 이름 표기 다름',
  'article-ref': '없는 조문 인용',
  'para-ref': '없는 항 인용',
  'deleted-ref': '삭제된 조문 인용',
  delegation: '위임 대상 규정 없음',
  parent: '상위 규정 없음',
  'annex-missing': '부르는 별표·서식 없음',
  'annex-unused': '본문이 부르지 않는 별표·서식',
  numbering: '조 번호 빠짐·겹침',
  'para-numbering': '항 번호 빠짐',
  'para-glyph': '항 번호 글자 다름',
  definition: '같은 용어 다른 정의',
  'same-matter': '규정·세칙 기준 차이',
  plain: '알기 쉬운 표현',
  'amend-mark': '개정 표시',
  amend: '직접 고친 조문',
};

/** 과업 요구 묶음 — 화면의 종류 묶음과 검토표 열 */
export const KIND_GROUP: Record<FindingKind, string> = {
  'reg-ref': '위임·인용', 'reg-name': '위임·인용', 'article-ref': '위임·인용', 'para-ref': '위임·인용', 'deleted-ref': '위임·인용',
  delegation: '위임·인용', parent: '위임·인용',
  'annex-missing': '별표·서식', 'annex-unused': '별표·서식',
  numbering: '체계', 'para-numbering': '체계', 'para-glyph': '체계',
  definition: '규정 간 충돌', 'same-matter': '규정 간 충돌',
  plain: '용어·문장', 'amend-mark': '용어·문장',
  amend: '직접 고친 조문',
};

export interface Span {
  line: number;
  at: number;
  length: number;
  /** 이 자리만의 바꿀 글자(알기 쉬운 표현처럼 자리마다 다를 때). 없으면 항목의 after */
  to?: string;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  reg: string;
  /** 걸린 조문(「제3조(정의)」). 조문 밖이면 '' */
  article: string;
  /** 걸린 글자 자리 — 여러 곳을 한 번에 고치는 항목(알기 쉬운 표현)은 여럿 */
  spans: Span[];
  /** 걸린 글자 */
  before: string;
  /** 바꿀 글자. 기계적으로 안전하지 않으면 null */
  after: string | null;
  message: string;
  /** 맞대 본 상대 */
  other: { reg: string; article: string; text: string } | null;
  /** 직접 고친 조문: 고치기 전 줄 전문 — 다시 올렸을 때 같은 줄을 찾는 데 쓴다 */
  orig?: string;
}

// ── 항목 번호: 같은 파일을 다시 올려도 같은 번호가 나와야 결정·부서 의견이 다시 붙는다 ──
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

class Out {
  list: Finding[] = [];
  private seen = new Map<string, number>();
  add(f: Omit<Finding, 'id'>) {
    const base = `${f.kind}|${normName(f.reg)}|${f.article}|${f.before}`;
    const n = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, n);
    this.list.push({ ...f, id: `${f.kind.slice(0, 2)}-${hash(`${base}|${n}`)}` });
  }
}

// ── 이름 풀기 ──
export interface Index {
  regs: Regulation[];
  find(name: string): Regulation | null;
}

export function buildIndex(regs: Regulation[]): Index {
  return {
    regs,
    find(name) {
      const hits = regs.filter((r) => sameName(r.name, name));
      return hits.length === 1 ? hits[0] : hits[0] ?? null;
    },
  };
}

const SELF = /^(?:이|본|동|같은|해당)$/;

/** 줄에서 조문 인용을 찾을 범위 — 본문(첫 부칙·별표 앞)만 */
const bodyEnd = (r: Regulation) => Math.min(r.suppStart ?? Infinity, r.annexStart ?? Infinity, r.lines.length);

/** 줄 끝 개정 표시(「[2013.12.20.개정]」)는 인용 찾기에서 뺀다 — 「개정 세칙 제27조」 같은 오인을 막는다 */
const MARKS = /[[<](?:[^\]>]{0,40}?(?:개정|신설|삭제|본조신설|전문개정)[^\]>]{0,40}?)[\]>]/g;
const blank = (s: string, re: RegExp) => s.replace(re, (m) => ' '.repeat(m.length));

interface Ref {
  /** 인용한 규정. null = 같은 규정 */
  name: string | null;
  bracketed: boolean;
  no: string | null;
  para: number | null;
  at: number;
  length: number;
  /** 규정 이름 부분만의 자리 */
  nameAt: number;
  nameLength: number;
  /** 낫표 없는 이름의 후보(긴 것부터). 어디서 이름이 시작하는지 몰라 묶음과 맞는 것을 고른다 */
  cands?: { name: string; at: number }[];
  /** 법령이나 이름을 알 수 없는 다른 규정 — 대조하지 않는다 */
  foreign?: boolean;
  /** 이름 없이 「제N조」만 적은 인용 */
  bare?: boolean;
}

const ART = String.raw`제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?`;

/** 한 줄의 인용을 모두 찾는다 */
export function findRefs(text: string): Ref[] {
  const t = blank(text, MARKS);
  const out: Ref[] = [];
  const used: [number, number][] = [];
  const free = (a: number, b: number) => !used.some(([x, y]) => a < y && x < b);
  const mark = (a: number, b: number) => used.push([a, b]);
  // ① 낫표 인용 — 「직원 인사 규정」 제15조제2항
  // 「정관」(이하 “정관”이라 한다) 제43조 처럼 줄임말 정의가 끼어도 같은 인용이다
  for (const m of t.matchAll(new RegExp(String.raw`「([^」]{1,60})」(?:\s*\(이하[^)]*\))?(?:\s*(?:${ART}))?`, 'g'))) {
    const at = m.index!;
    mark(at, at + m[0].length);
    const no = m[2] ? `제${m[2]}조${m[3] ? `의${m[3]}` : ''}` : null;
    out.push({ name: m[1].trim(), bracketed: true, no, para: m[4] ? Number(m[4]) : null, at, length: m[0].length, nameAt: at + 1, nameLength: m[1].length });
  }
  // ② 낫표 없는 이름 + 조문 — 교원인사규정 제11조 · 이 규정 제8조
  for (const m of t.matchAll(new RegExp(String.raw`((?:[가-힣A-Za-z0-9·ㆍ]+\s?){1,8}?)(규정|세칙|학칙|정관|규칙|지침|내규)\s*${ART}`, 'g'))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!free(start, end)) continue;
    mark(start, end);
    const suffixEnd = start + m[1].length + m[2].length;
    const toks = [...m[1].matchAll(/\S+/g)].map((x) => start + x.index!);
    const no = `제${m[3]}조${m[4] ? `의${m[4]}` : ''}`;
    const para = m[5] ? Number(m[5]) : null;
    const lastTok = t.slice(toks.at(-1)!, suffixEnd - m[2].length).trim();
    if (SELF.test(lastTok)) {
      const at = toks.at(-1)!;
      out.push({ name: null, bracketed: false, no, para, at, length: end - at, nameAt: at, nameLength: 0 });
      continue;
    }
    const cands = toks.map((at) => ({ name: t.slice(at, suffixEnd).trim(), at }));
    const short = cands.at(-1)!;
    out.push({ name: short.name, bracketed: false, no, para, at: short.at, length: end - short.at, nameAt: short.at, nameLength: suffixEnd - short.at, cands });
  }
  // ③ 이름 없는 조문 — 같은 규정. 앞 낱말이 법령·다른 규정이면 뺀다(「법 제5조」·「영 제3조」)
  for (const m of t.matchAll(new RegExp(ART, 'g'))) {
    const at = m.index!;
    if (!free(at, at + m[0].length)) continue;
    const prev = t.slice(Math.max(0, at - 12), at).match(/([가-힣A-Za-z」』)]+)\s*$/)?.[1] ?? '';
    mark(at, at + m[0].length);
    const no = `제${m[1]}조${m[2] ? `의${m[2]}` : ''}`;
    const para = m[3] ? Number(m[3]) : null;
    const other = prev && (LAW_SUFFIX.test(prev) || /^(?:법|영|규칙|시행령|시행규칙|협약|부칙|구|종전|개정|같은법|동법)$/.test(prev) || /[」』]$/.test(prev) || REG_SUFFIX.test(prev));
    // 법령·이름 모를 다른 규정 — 뒤따르는 「, 제53조」가 이어받도록 자리만 남긴다
    out.push({ name: other ? '(다른 법령·규정)' : null, bracketed: false, no, para, at, length: m[0].length, nameAt: at, nameLength: 0, foreign: !!other, bare: true });
  }
  out.sort((a, b) => a.at - b.at);
  // 「제52조(…),제53조」·「제75조와 제75조의2」·「제29조제2항 및 제30조제4항」 — 이어 적은 조문은 앞 인용의 대상을 따른다
  for (let k = 1; k < out.length; k++) {
    const cur = out[k], prev = out[k - 1];
    if (!cur.bare || !prev.no) continue;
    const gap = t.slice(prev.at + prev.length, cur.at);
    if (!CONT.test(gap)) continue;
    out[k] = { ...cur, name: prev.name, bracketed: prev.bracketed, foreign: prev.foreign, cands: prev.cands };
  }
  return out;
}

const CONT = /^\s*(?:\((?:[^()]|\([^)]*\))*\)\s*)?(?:,|·|ㆍ|및|와|과|또는|내지|부터|~|∼)\s*$/;

function articleByNo(r: Regulation, no: string): Article | undefined {
  return r.articles.find((a) => a.no === no);
}

// 「~규정」·「~규칙」으로 끝나도 대통령령·부령인 것이 많다(「공무원 수당 등에 관한 규정」·「사학기관 재무·회계규칙」).
// 머리말로 가려 1단계 대조에서 뺀다 — 법령 대조는 2단계에서 법제처 원문으로 한다
const NATIONAL = /^(?:공무원|국가|정부|지방공무원|대학교원|교육공무원|사학기관|사립학교|고등교육|초[·ㆍ‧]?중등|교원자격|학교보건|국립)/;
const lawLike = (name: string) => LAW_SUFFIX.test(normName(name)) || /법\s*시행/.test(name) || NATIONAL.test(normName(name));

// ── 대조 ──
export function runChecks(regs: Regulation[]): Finding[] {
  const out = new Out();
  const idx = buildIndex(regs);
  for (const r of regs) {
    checkRefs(r, idx, out);
    checkDelegation(r, idx, out);
    checkParent(r, idx, out);
    checkAnnex(r, out);
    checkNumbering(r, out);
    checkPlain(r, out);
    checkAmendMarks(r, out);
  }
  checkDefinitions(regs, out);
  checkSameMatter(regs, idx, out);
  checkMarkStyle(regs, out);
  return out.list;
}

function checkRefs(r: Regulation, idx: Index, out: Out) {
  const end = bodyEnd(r);
  // 묶음에 없는 규정·이름 표기 다름은 이름마다 한 항목으로 모은다(자리는 여럿)
  const missing = new Map<string, { name: string; spans: Span[]; article: string }>();
  const misnamed = new Map<string, { name: string; target: Regulation; spans: Span[]; article: string }>();
  for (let i = 0; i < end; i++) {
    const text = r.lines[i].text;
    const here = articleAt(r, i);
    // 조문 머리(「제4조 삭제」의 제4조)는 인용이 아니다
    const headEnd = here?.start === i ? (HEAD.exec(text)?.[0].length ?? 0) : 0;
    for (const found of findRefs(text)) {
      if (found.at < headEnd || found.foreign) continue;
      let ref = found;
      if (ref.cands) {
        // 긴 후보부터 묶음과 맞춰 본다 — 「~에 관한 규정」의 머리를 놓치지 않으려고
        const hit = ref.cands.find((c) => idx.find(c.name));
        if (!hit) continue;
        ref = ref.bare ? { ...ref, name: hit.name } : { ...ref, name: hit.name, length: ref.at + ref.length - hit.at, at: hit.at, nameAt: hit.at, nameLength: hit.name.length };
      }
      let target: Regulation | null = r;
      if (ref.name !== null) {
        if (lawLike(ref.name)) continue; // 법령 대조는 2단계
        target = idx.find(ref.name);
        if (!target) {
          // 낫표 없는 이름은 경계가 불확실하다 — 못 찾으면 말하지 않는다. 과목명·책 이름(꼬리말 없음)도 뺀다
          if (!ref.bracketed || ref.bare || !REG_SUFFIX.test(normName(ref.name))) continue;
          const k = normName(ref.name);
          const m = missing.get(k) ?? { name: ref.name, spans: [], article: articleLabel(here) };
          m.spans.push({ line: i, at: ref.nameAt, length: ref.nameLength });
          missing.set(k, m);
          continue;
        }
        // 띄어쓰기·가운뎃점만 다른 표기 — 기관 이름 머리를 뺀 줄임(「정관」)은 그대로 둔다
        const spaced = (s: string) => s.replace(/\s+/g, ' ').trim();
        if (ref.bracketed && !ref.bare && target !== r && normName(ref.name) === normName(target.name) && spaced(ref.name) !== spaced(target.name)) {
          const k = spaced(ref.name);
          const m = misnamed.get(k) ?? { name: ref.name, target, spans: [], article: articleLabel(here) };
          m.spans.push({ line: i, at: ref.nameAt, length: ref.nameLength });
          misnamed.set(k, m);
        }
      }
      if (!ref.no) continue;
      const span = { line: i, at: ref.at, length: ref.length };
      const quote = text.slice(ref.at, ref.at + ref.length);
      const a = articleByNo(target, ref.no);
      if (a && a === here) continue; // 조문이 자기 번호를 적은 것 — 인용이 아니다
      const where = target === r ? '이 규정' : `「${target.name}」`;
      if (!a) {
        const last = target.articles.at(-1);
        // 앞말이 이름처럼 보이면(「사립학교법 시행형 제13조의2」) 다른 법령·규정 인용일 수 있다고 함께 적는다
        const lead = target === r ? text.slice(Math.max(0, ref.at - 16), ref.at).match(/([가-힣]{2,}(?:\s[가-힣]{2,})?)\s*$/)?.[1] : undefined;
        out.add({
          kind: 'article-ref', reg: r.name, article: articleLabel(here), spans: [span], before: quote, after: null,
          message: `${where}에 ${ref.no}가 없습니다${last ? `(마지막 조문 ${last.no})` : ''}. 조문 번호가 바뀌었는지 확인하세요.`
            + (lead && !/(?:은|는|이|가|을|를|에|의|와|과|로|및|따라|따른|의하여|의한|준용하여)$/.test(lead) ? ` 「${lead}」의 조문을 가리킨다면 그 이름이 맞는지 확인하세요.` : ''),
          other: last ? { reg: target.name, article: articleLabel(last), text: articleText(target, last) } : null,
        });
        continue;
      }
      if (a.deleted) {
        out.add({
          kind: 'deleted-ref', reg: r.name, article: articleLabel(here), spans: [span], before: quote, after: null,
          message: `${where} ${a.no}는 삭제된 조문입니다. 인용을 고치거나 지울지 확인하세요.`,
          other: { reg: target.name, article: articleLabel(a), text: articleText(target, a) },
        });
        continue;
      }
      if (ref.para && ref.para > 1 && !a.paras.includes(ref.para)) {
        out.add({
          kind: 'para-ref', reg: r.name, article: articleLabel(here), spans: [span], before: quote, after: null,
          message: `${where} ${a.no}에 제${ref.para}항이 없습니다${a.paras.length ? `(항 ${a.paras.length}개)` : '(항으로 나뉘지 않음)'}.`,
          other: { reg: target.name, article: articleLabel(a), text: articleText(target, a) },
        });
      }
    }
  }
  for (const m of missing.values()) {
    const near = idx.regs.map((x) => ({ x, s: similarity(x.name, m.name) })).filter((c) => c.s >= 0.8).sort((a, b) => b.s - a.s);
    const unique = near.length === 1 || (near.length > 1 && near[0].s - near[1].s >= 0.1);
    const n = m.spans.length > 1 ? ` 이 규정에서 ${m.spans.length}곳.` : '';
    out.add({
      kind: 'reg-ref', reg: r.name, article: m.spans.length > 1 ? '' : m.article, spans: m.spans, before: m.name, after: unique ? near[0].x.name : null,
      message: unique
        ? `「${m.name}」은 올린 묶음에 없습니다. 이름이 비슷한 「${near[0].x.name}」을 가리키는지 확인하세요.${n}`
        : `「${m.name}」은 올린 묶음에 없습니다. 기관 규정이면 빠진 파일인지, 폐지·개칭됐는지 확인하세요. 법령(대통령령·부령)이면 「해당 없음」으로 두세요.${n}`,
      other: unique ? { reg: near[0].x.name, article: '', text: near[0].x.name } : null,
    });
  }
  for (const m of misnamed.values()) {
    out.add({
      kind: 'reg-name', reg: r.name, article: m.spans.length > 1 ? '' : m.article, spans: m.spans, before: m.name, after: m.target.name,
      message: `규정 이름을 「${m.name}」으로 적었습니다. 규정의 이름은 「${m.target.name}」입니다.${m.spans.length > 1 ? ` 이 규정에서 ${m.spans.length}곳.` : ''}`,
      other: { reg: m.target.name, article: '', text: m.target.name },
    });
  }
}

// 「직원 보수 규정으로 정한다」·「별도의 세칙으로 정한다」 — 이름이 있는 위임만 본다
const DELEGATE = /(「[^」]{2,60}」|(?:[가-힣·ㆍ]+\s?){1,6}?(?:규정|세칙|지침|내규|요령))\s*(?:으로|로|에서)\s*(?:따로\s*|별도로\s*)?정한다/g;

function checkDelegation(r: Regulation, idx: Index, out: Out) {
  const end = bodyEnd(r);
  for (let i = 0; i < end; i++) {
    const text = r.lines[i].text;
    for (const m of text.matchAll(DELEGATE)) {
      const name = m[1].replace(/[「」]/g, '').trim();
      if (/^(?:별도의?|따로|이|본|해당|관련|각|소관|다른|내부|기관|관계)\s?/.test(name) && !m[1].startsWith('「')) continue;
      if (lawLike(name) || idx.find(name)) continue;
      if (!m[1].startsWith('「') && name.split(/\s/).length > 3) continue;
      const at = m.index! + (m[1].startsWith('「') ? 1 : 0);
      out.add({
        kind: 'delegation', reg: r.name, article: articleLabel(articleAt(r, i)), spans: [{ line: i, at, length: name.length }],
        before: name, after: null,
        message: `「${name}」에 정하도록 위임했는데 올린 묶음에 그 규정이 없습니다. 제정되었는지, 이름이 다른지 확인하세요.`,
        other: null,
      });
    }
  }
}

function checkParent(r: Regulation, idx: Index, out: Out) {
  const m = r.name.match(/^(.+?)\s*(?:시행\s*세칙|시행\s*규칙|운영\s*세칙|시행\s*내규)$/);
  if (!m) return;
  const parent = m[1].trim();
  if (idx.find(parent) || idx.regs.some((x) => x !== r && bareName(x.name) === bareName(parent))) return;
  out.add({
    kind: 'parent', reg: r.name, article: '', spans: [{ line: 0, at: 0, length: 0 }], before: r.name, after: null,
    message: `「${r.name}」의 상위 규정 「${parent}」이 올린 묶음에 없습니다. 상위 규정을 함께 올리면 세칙과 맞춰 봅니다.`,
    other: null,
  });
}

const ANNEX_REF = /(「[^」]{1,60}」\s*)?별\s*([표지])\s*(?:제\s*)?(\d+)\s*(?:호)?\s*(?:서식)?/g;

function checkAnnex(r: Regulation, out: Out) {
  const end = bodyEnd(r);
  const used = new Set<string>();
  // 같은 번호가 둘이면(옛 별표 삭제 + 새 별표) 살아 있는 쪽을 본다
  const have = new Map<string, (typeof r.annexes)[number]>();
  for (const a of r.annexes) if (!have.has(a.key) || have.get(a.key)!.deleted) have.set(a.key, a);
  for (let i = 0; i < end; i++) {
    const text = r.lines[i].text;
    for (const m of text.matchAll(ANNEX_REF)) {
      if (m[1]) continue; // 다른 규정의 별표
      // 「교원업적평가규정 별표1-2」·「「학칙」 제3조제1항 관련 별표 3」 — 앞에 다른 규정 이름이 있으면 그 규정의 별표다
      const before = text.slice(Math.max(0, m.index! - 30), m.index!);
      if (/(?:규정|세칙|규칙|학칙|정관|지침|내규)\s*$/.test(before) || /「[^」]+」\s*(?:제\s*\d+\s*조[^「」]{0,12}관련\s*)?$/.test(before)) continue;
      const key = `별${m[2]}${Number(m[3])}`;
      used.add(key);
      const a = have.get(key);
      const label = m[2] === '표' ? `별표 ${m[3]}` : `별지 제${m[3]}호서식`;
      if (a && !a.deleted) continue;
      const at = m.index!;
      out.add({
        kind: 'annex-missing', reg: r.name, article: articleLabel(articleAt(r, i)), spans: [{ line: i, at, length: m[0].trimEnd().length }],
        before: m[0].trim(), after: null,
        message: a?.deleted
          ? `본문이 ${label}를 부르는데 그 별표·서식은 삭제됐습니다.`
          : r.annexes.length
            ? `본문이 ${label}를 부르는데 이 규정에 실린 별표·서식에 없습니다.`
            : `본문이 ${label}를 부르는데 이 파일에 별표·서식이 없습니다. 따로 관리하는 파일이면 「해당 없음」으로 두세요.`,
        other: null,
      });
    }
  }
  for (const a of r.annexes) {
    if (a.deleted || used.has(a.key)) continue;
    out.add({
      kind: 'annex-unused', reg: r.name, article: '', spans: [{ line: a.line, at: 0, length: 0 }], before: a.label, after: null,
      message: `${a.label}가 규정에 실려 있지만 본문 어디에서도 부르지 않습니다. 근거 조문을 넣거나 지울지 확인하세요.`,
      other: null,
    });
  }
}

function checkNumbering(r: Regulation, out: Out) {
  let prev = 0;
  const seen = new Set<string>();
  for (const a of r.articles) {
    const [n, sub] = noKey(a.no);
    if (seen.has(a.no)) {
      out.add({ kind: 'numbering', reg: r.name, article: articleLabel(a), spans: [{ line: a.start, at: 0, length: 0 }], before: a.no, after: null,
        message: `${a.no}가 두 번 나옵니다. 번호를 바로잡아야 합니다.`, other: null });
    } else if (!sub && prev && n > prev + 1) {
      const missing = prev + 2 === n ? `제${prev + 1}조` : `제${prev + 1}조~제${n - 1}조`;
      out.add({ kind: 'numbering', reg: r.name, article: articleLabel(a), spans: [{ line: a.start, at: 0, length: 0 }], before: missing, after: null,
        message: `${missing}가 없습니다. 삭제한 조문이면 「${missing} 삭제」로 번호를 남기는 것이 정비 기준입니다.`, other: null });
    }
    seen.add(a.no);
    if (!sub) prev = Math.max(prev, n);
    // 항: ① 다음이 ③ 처럼 빠진 번호
    const ps = a.paras;
    for (let k = 1; k < ps.length; k++) {
      if (ps[k] > ps[k - 1] + 1) {
        out.add({ kind: 'para-numbering', reg: r.name, article: articleLabel(a), spans: [{ line: a.start, at: 0, length: 0 }],
          before: `${ps[k - 1]}→${ps[k]}`, after: null,
          message: `${a.no}의 항 번호가 제${ps[k - 1]}항 다음에 제${ps[k]}항으로 건너뜁니다.`, other: { reg: r.name, article: articleLabel(a), text: articleText(r, a) } });
        break;
      }
    }
    for (const g of a.glyphs) {
      out.add({ kind: 'para-glyph', reg: r.name, article: articleLabel(a), spans: [{ line: g.line, at: g.at, length: 1 }],
        before: g.char, after: CIRCLED[g.n - 1],
        message: `${a.no}의 제${g.n}항 번호를 모양만 같은 다른 글자 「${g.char}」로 적었습니다. 「${CIRCLED[g.n - 1]}」로 바꿉니다(검색·자동 번호에서 빠집니다).`, other: null });
    }
  }
}

function checkPlain(r: Regulation, out: Out) {
  const end = bodyEnd(r);
  // 규칙끼리 같은 글자를 겹쳐 고치지 않게 줄마다 쓴 자리를 적어 둔다(「및 기타」를 먼저 잡으면 「기타」는 건너뛴다)
  const taken = new Map<number, [number, number][]>();
  const free = (line: number, a: number, b: number) => !(taken.get(line) ?? []).some(([x, y]) => a < y && x < b);
  for (const rule of PLAIN_RULES) {
    const re = new RegExp(rule.from, 'g');
    const spans: Span[] = [];
    let first = '';
    let after = '';
    for (let i = 0; i < end; i++) {
      for (const m of r.lines[i].text.matchAll(re)) {
        if (!free(i, m.index!, m.index! + m[0].length)) continue;
        taken.set(i, [...(taken.get(i) ?? []), [m.index!, m.index! + m[0].length]]);
        const to = rule.to.replace(/\$(\d)/g, (_, n: string) => m[Number(n)] ?? '');
        spans.push({ line: i, at: m.index!, length: m[0].length, to });
        if (!first) { first = m[0]; after = to; }
      }
    }
    if (!spans.length) continue;
    out.add({
      kind: 'plain', reg: r.name, article: '', spans, before: first.trim(), after: after.trim(),
      message: `${rule.label} — 이 규정 본문에 ${spans.length}곳. 반영하면 모두 바꿉니다.`,
      other: null,
    });
  }
}

// [2015.0130개정] 처럼 날짜가 깨진 개정 표시
const MARK_DATE = /[[<](?:(?:개정|신설|삭제|전문개정|본조신설)\s*)?((?:19|20)[0-9][0-9.\s]*[0-9])\.?\s*(?:개정|신설|삭제|전문개정)?[\]>,]/g;

function checkAmendMarks(r: Regulation, out: Out) {
  for (let i = 0; i < r.lines.length; i++) {
    const text = r.lines[i].text;
    for (const m of text.matchAll(MARK_DATE)) {
      // 한 표시에 날짜가 여럿일 수 있다 — 「<개정 2021.3.31. 2021.7.14.>」
      let from = m.index! + m[0].indexOf(m[1]);
      for (const piece of m[1].split(/(?<=\.)\s+(?=(?:19|20)\d{2})|,\s*/)) {
        const at = text.indexOf(piece, from);
        from = at + piece.length;
        if (/^(?:19|20)\d{2}\.\d{1,2}\.\d{1,2}\.?$/.test(piece.replace(/\s/g, ''))) continue;
        out.add({
          kind: 'amend-mark', reg: r.name, article: articleLabel(articleAt(r, i)), spans: [{ line: i, at, length: piece.length }],
          before: piece, after: null,
          message: `개정 표시의 날짜 「${piece}」가 「YYYY.M.D.」 모양이 아닙니다. 개정 연혁에서 날짜를 확인해 고치세요.`,
          other: null,
        });
      }
    }
  }
}

/** 기관 안에서 개정 표시 형식이 섞였는지 — 규정마다 한 항목 */
export type MarkStyle = 'angle' | 'bracket-tail' | 'bracket-head';
export function markStyles(r: Regulation): Record<MarkStyle, number> {
  const c: Record<MarkStyle, number> = { angle: 0, 'bracket-tail': 0, 'bracket-head': 0 };
  for (const l of r.lines) {
    c.angle += (l.text.match(/<(?:개정|신설|삭제|본조신설|전문개정)\s*\d{4}/g) ?? []).length;
    c['bracket-tail'] += (l.text.match(/\[\d{4}[.\d\s]*\.?\s*(?:개정|신설|삭제)\]/g) ?? []).length;
    c['bracket-head'] += (l.text.match(/\[(?:개정|신설|삭제|본조신설|전문개정)\s*\d{4}/g) ?? []).length;
  }
  return c;
}
export const MARK_LABEL: Record<MarkStyle, string> = { angle: '<개정 2023. 9. 1.>', 'bracket-tail': '[2023.9.1.개정]', 'bracket-head': '[개정 2023.9.1.]' };

function checkMarkStyle(regs: Regulation[], out: Out) {
  // 기준은 법령 표기 방식(<개정 2023. 9. 1.>)이다. 기관에서 많이 쓴 옛 모양([2013.12.20.개정])을 기준으로 삼으면 옛 표기로 되돌리게 된다
  for (const r of regs) {
    const c = markStyles(r);
    const others = (['bracket-tail', 'bracket-head'] as MarkStyle[]).filter((k) => c[k] > 0);
    if (!others.length) continue;
    out.add({
      kind: 'amend-mark', reg: r.name, article: '', spans: [{ line: 0, at: 0, length: 0 }], before: others.map((k) => MARK_LABEL[k]).join(', '), after: null,
      message: `개정 표시를 ${others.map((k) => `${MARK_LABEL[k]} 모양으로 ${c[k]}곳`).join(', ')} 적었습니다${c.angle ? `(법령 표기 방식 ${MARK_LABEL.angle} 모양 ${c.angle}곳과 섞임)` : ''}. 정비할 때 법령 표기 방식으로 맞출지 정하세요.`,
      other: null,
    });
  }
}

// 「“직원”이란 ~을 말한다」 — 정의 조문의 용어
const DEF = /[“"']([^”"']{1,20})[”"']\s*(?:이)?란\s*(.+?)(?:을|를)?\s*말한다/;

function checkDefinitions(regs: Regulation[], out: Out) {
  const defs = new Map<string, { reg: Regulation; a: Article; term: string; body: string; line: number; at: number }[]>();
  for (const r of regs) {
    for (const a of r.articles) {
      if (!/정의|용어/.test(a.title)) continue;
      for (let i = a.start; i <= a.end; i++) {
        const t = r.lines[i].text;
        const m = t.match(DEF);
        if (!m) continue;
        const key = normName(m[1]);
        const list = defs.get(key) ?? [];
        list.push({ reg: r, a, term: m[1], body: m[2], line: i, at: m.index! });
        defs.set(key, list);
      }
    }
  }
  for (const list of defs.values()) {
    const kinds = new Set(list.map((d) => normName(d.body).replace(/[.,]/g, '')));
    if (kinds.size < 2 || new Set(list.map((d) => d.reg)).size < 2) continue;
    for (const d of list) {
      const o = list.find((x) => x.reg !== d.reg && normName(x.body) !== normName(d.body));
      if (!o) continue;
      out.add({
        kind: 'definition', reg: d.reg.name, article: articleLabel(d.a), spans: [{ line: d.line, at: d.at, length: d.term.length + 2 }],
        before: `“${d.term}”`, after: null,
        message: `「${d.term}」을 「${o.reg.name}」과 다르게 정의했습니다. 적용 대상이 달라 일부러 다르게 둔 것인지 확인하세요.`,
        other: { reg: o.reg.name, article: articleLabel(o.a), text: o.reg.lines[o.line].text.trim() },
      });
    }
  }
}

// 규정 ↔ 그 시행세칙: 제목이 같은 조문의 숫자 기준이 다르면 확인할 곳
const NUMS = /\d+(?:\.\d+)?\s*(?:일|개월|월|년|시간|분|명|%|퍼센트|원|만원|회|호봉|세)/g;

function checkSameMatter(regs: Regulation[], idx: Index, out: Out) {
  for (const child of regs) {
    const m = child.name.match(/^(.+?)\s*(?:시행\s*세칙|시행\s*규칙|운영\s*세칙|시행\s*내규)$/);
    const parent = m ? idx.find(m[1].trim()) : null;
    if (!parent || parent === child) continue;
    for (const a of child.articles) {
      if (!a.title || a.deleted) continue;
      const p = parent.articles.find((x) => x.title && normName(x.title) === normName(a.title) && !x.deleted);
      if (!p) continue;
      const nums = (r: Regulation, x: Article) => new Set((articleText(r, x).match(NUMS) ?? []).map((s) => s.replace(/\s/g, '')));
      const cn = nums(child, a), pn = nums(parent, p);
      if (!cn.size || !pn.size) continue;
      const onlyChild = [...cn].filter((s) => !pn.has(s));
      if (!onlyChild.length || [...pn].every((s) => cn.has(s))) continue;
      out.add({
        kind: 'same-matter', reg: child.name, article: articleLabel(a), spans: [{ line: a.start, at: 0, length: 0 }],
        before: onlyChild.join(', '), after: null,
        message: `같은 제목의 조문이 상위 규정 「${parent.name}」 ${p.no}에도 있는데 숫자 기준이 다릅니다(세칙: ${[...cn].join(', ')} / 규정: ${[...pn].join(', ')}).`,
        other: { reg: parent.name, article: articleLabel(p), text: articleText(parent, p) },
      });
    }
  }
}
