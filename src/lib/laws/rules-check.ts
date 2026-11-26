// 「내 취업규칙 점검」 — scripts/laws/rules_impact.py 와 같은 판정을 브라우저에서 한다(본문은 서버로 보내지 않는다).
// keywords 문단이 없으면 누락, 있으면 같은 조문 덩어리에서 stale 이 남았거나 ok 가 빠지면 미반영, 아니면 반영됨.

export interface RuleSpec {
  lawId: string;
  law: string;
  article: string;
  effective: string;
  topic: string;
  art93: string;
  required: boolean;
  /** 절차·인용 정비형 — 법보다 좁은 옛 문구가 남았을 때만 필수 */
  requiredIfStale?: boolean;
  keywords: string[];
  /** 「어느 조문인가」를 고르는 말. 있으면 이 말이 든 조문만 후보가 된다.
   *  keywords 는 본문에서 대조할 말이라 「휴직을 신청」처럼 넓어질 수 있는데,
   *  그게 일반 휴직 조항을 끌어오던 것이 2026-10-13 에 잡힌 결함이다.
   *  없는 규칙은 종전대로 전부 후보 — 하위호환을 지킨다. */
  anchor?: string[];
  ok: string[];
  stale: string[];
  point: string;
  clause: string;
  mst: string | null;
}

export type Status = '반영됨' | '미반영' | '누락';

export interface Verdict {
  rule: RuleSpec;
  status: Status;
  where: string | null;
  stale: string[];
  missing: string[];
  /** ok 낱말은 다 있으나 그 낱말 뒤에 부정(…하지 않는다 등)이 붙은 문장 — 낱말 대조로는 반영 여부를 알 수 없다(2026-11-25) */
  negated?: boolean;
}

const ART = /^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(\([^)]*\)|【[^】]*】|\[[^\]]*\])?/;
const norm = (s: string) => s.replace(/ㆍ/g, '·').replace(/\s+/g, ' ').trim();
const has = (text: string, needle: string) => norm(text).replace(/\s/g, '').includes(norm(needle).replace(/\s/g, ''));
const reference = /제\s*\d+\s*조(?:\s*의\s*\d+)?(?:에|를)\s*(?:따른다|참조|준용)/;
/** Only explicit article titles are strong anchor evidence. */
function titleOf(article: string | null): string {
  return article?.match(/(?:\(([^)]*)\)|【([^】]*)】|\[([^\]]*)\])/)?.slice(1).find(Boolean) ?? '';
}

interface Para {
  article: string | null;
  text: string;
}

export function paragraphs(text: string): Para[] {
  const out: Para[] = [];
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = norm(raw);
    if (!line) continue;
    const m = line.match(ART);
    const reference = m && !m[2] && /^\s*(?:및|의|에|를|과|에서|까지)/.test(line.slice(m[0].length));
    if (m && !reference) current = (m[1].replace(/\s/g, '') + (m[2] ?? '')).trim();
    out.push({ article: current, text: line });
  }
  return out;
}

/** anchor 가 든 조문의 줄만 남긴다. anchor 가 없으면 그대로 돌려준다. */
export function anchored(rule: RuleSpec, paras: Para[]): Para[] {
  if (!rule.anchor?.length) return paras;
  const titled = new Set(paras.filter((p) => rule.anchor!.some((a) => has(titleOf(p.article), a))).map(p => p.article));
  // A cross-reference in general leave must not compete with the named scheme.
  const arts = titled.size ? titled : new Set(paras.filter(p => {
    const body = p.text.replace(ART, '');
    return !reference.test(body) && rule.anchor!.some(a => has(body, a));
  }).map(p => p.article));
  return arts.size ? paras.filter((p) => arts.has(p.article)) : [];
}

export function judge(rule: RuleSpec, paras: Para[]): Verdict {
  // anchor 가 있으면 **그 말이 든 조문**만 후보다(2026-10-13).
  // 조문 단위로 거르는 이유: paragraphs() 는 줄 단위라 제도명이 조문 제목 줄에만 있고
  // 정작 대조할 문구는 다른 줄에 있는 일이 흔하다. 줄 단위로 거르면 맞는 조문이 통째로 빠진다.
  const scoped = anchored(rule, paras);
  const hits = scoped.filter((p) => rule.keywords.some((k) => has(p.text, k)));
  if (!hits.length) return { rule, status: '누락', where: null, stale: [], missing: rule.ok };
  const arts = [...new Set(hits.map((h) => h.article))];
  let best: Omit<Verdict, 'rule' | 'status'> & { score: number } | null = null;
  for (const a of arts) {
    const block = (a ? paras.filter((p) => p.article === a) : hits).map((p) => p.text).join(' ');
    const stale = rule.stale.filter((s) => has(block, s));
    const missing = rule.ok.filter((o) => !has(block, o));
    const score = stale.length * 10 + missing.length;
    if (!best || score < best.score) best = { where: a, stale, missing, score };
  }
  const b = best!;
  const effective = rule.requiredIfStale && b.stale.length ? { ...rule, required: true } : rule;
  if (b.score === 0 && negatedOk(rule, paras.filter((p) => p.article === b.where))) {
    return { rule: effective, status: '미반영', where: b.where, stale: [], missing: [], negated: true };
  }
  return { rule: effective, status: b.score === 0 ? '반영됨' : '미반영', where: b.where, stale: b.stale, missing: b.missing };
}

/** 부정문으로 내린 항목 옆에 붙는 말(웹·MCP 같은 글) */
export const NEGATED_NOTE = '해당 문구가 부정문(…하지 않는다 등)으로 보여 원문 확인이 필요합니다';
/** 내보내기(docx·xlsx·표 복사) 칸에 붙이는 짧은 말 */
export const NEGATED_SHORT = '부정문 — 원문 확인 필요';

// ── 부정문(2026-11-25, G4 검수 2026-11-26 고침) ──
// ok 낱말이 든 **절**의 끝 서술어만 본다. 문장 끝까지 보면 「허용하며, 이를 이유로 불리한 처우를 하지 아니한다」의
// 뒤 절 부정이 ok 낱말에 걸려 반영된 조문이 미반영으로 떨어졌다(G4 I22 — merge-base 판은 반영됨).
// 파이썬 쌍둥이 scripts/laws/rules_impact.py 가 같은 규칙을 쓴다 — 바꾸면 둘 다 바꾸고 laws-matcher-parity 를 돌린다.
const flat = (s: string) => norm(s).replace(/\s/g, '');
/** 문법 부정(어디서든)과 어휘 부정(절 끝 서술어 자리에서만: 불허·불가·금지·제외·「안 함」 — ¬ 은 띄어 쓴 「안」) */
const NEG_TOKEN = /지않|지아니|수없|못하|못한|못함|아니[한함된됨]|¬[함한됨된]|불허|불가(?!피)|금지|제외/g;
const LEXICAL = /^(?:불허|불가|금지|제외|¬)/;
/** 부정 뜻의 말 — 여기에 붙은 부정은 보장 문구다(거부할 수 없다·불리한 처우를 하지 아니한다·차별을 금지한다) */
const DOUBLE = /거부|거절|반려|불허|불리|불이익|차별|해고|징계|제한|방해|간섭|강요|박탈|감액|삭감|금지|성희롱|괴롭힘|폭행|폭언/g;
const POSITIVE = /허용|인정|부여|사용|신청|승인|지급/;
/** 조건·양보 연결 — 이 뒤가 그 절의 주 서술어다(「…신청하면 회사는 이를 거부할 수 없다」) */
const SUB = /경우(?:에는|에도|라도)?|때(?!문)(?:에는|에도)?|더라도|[어아여해]도|(?<=[하되이으라시])면/g;
/** 조건이 붙은 「…하지 아니할 수 있다」는 법정 예외 단서다(표준 제43조③) */
const COND = /경우|때(?!문)|불구하고/;
const ITEM = /^(?:[①-⑳]|\d+[.)]|[가-하][.)]|제\s*\d+\s*조|[-·•※○□▪*])/;
const TERMINAL = /(?:[.。:;)\]】]|다|함|음|임|됨|것)$/;

/** 조문 줄들을 절로 나눈다. 서술어로 끝나지 않은 줄은 다음 줄과 잇는다(줄바꿈 하나로 결론이 바뀌지 않게). 괄호 안은 뺀다 */
function clausesOf(lines: string[]): string[] {
  let text = '';
  lines.forEach((l, i) => {
    text += i === 0 ? l : (TERMINAL.test(lines[i - 1]) || ITEM.test(l) ? '\n' : ' ') + l;
  });
  for (let k = 0; k < 2; k++) text = text.replace(/\([^()]*\)|（[^（）]*）/g, '');
  return text
    .replace(/(^|\s)안\s*(?=[함한됨된])/g, '$1¬')
    .split(/[.。;\n]|(?<=[며되고])\s*,|(?<=[하되이으]며)\s/)
    .map(flat)
    .filter(Boolean);
}

/** 관형형 부정(「사용하지 않은 기간」)은 뒤 이름씨를 꾸밀 뿐 서술어가 아니다. 「…않는 것으로 한다」는 서술어다 */
function attributive(t: string, after: string): boolean {
  let rest: string | null = null;
  if (/[한된]$/.test(t)) rest = after.startsWith('다') ? null : after;
  else {
    const m = after.match(/^(?:[은는](?!다)|한(?!다)|하는|할)/);
    if (m) rest = after.slice(m[0].length);
  }
  return rest !== null && !rest.startsWith('것');
}

/** 절 c 에서 w 에 걸린 서술어가 부정인가 */
function clauseNegated(c: string, w: string): boolean {
  const at = c.indexOf(w);
  if (at < 0) return false;
  const wEnd = at + w.length;
  let from = wEnd;
  for (const m of c.matchAll(SUB)) if (m.index! >= wEnd) from = Math.max(from, m.index! + m[0].length);
  for (const m of c.matchAll(NEG_TOKEN)) {
    const i = m.index!;
    if (i < from) continue;
    const t = m[0];
    const after = c.slice(i + t.length);
    if (LEXICAL.test(t)) {
      if (!/^[가-힣]{0,3}$/.test(after)) continue; // 서술어 자리가 아니다(휴게시간을 제외하고 …)
    } else if (/^지(?:않|아니)$/.test(t) && /^(?:을|할)수있/.test(after)) {
      if (COND.test(c.slice(0, i))) continue; // 조건이 붙은 예외 단서
    } else if (attributive(t, after)) continue;
    let double = false;
    for (const d of c.slice(from, i).matchAll(DOUBLE)) {
      const gap = c.slice(from + d.index! + d[0].length, i);
      if (gap.length <= 6 && !POSITIVE.test(gap)) double = true;
    }
    if (!double) return true;
  }
  return false;
}

/**
 * ok 낱말이 든 절마다 그 서술어가 부정인데 표준 문안(clause)의 같은 낱말은 부정이 아닌가.
 * 「불리한 처우를 하지 아니한다」처럼 표준 문안 자체가 부정형인 금지 조항은 그대로 둔다.
 * 규칙의 ok·keywords 자체가 부정을 품으면 보지 않는다.
 */
function negatedOk(rule: RuleSpec, paras: Para[]): boolean {
  if (!rule.ok.length || [...rule.ok, ...rule.keywords].some((w) => new RegExp(NEG_TOKEN.source).test(flat(w)))) return false;
  const mine = clausesOf(paras.map((p) => p.text));
  const std = clausesOf((rule.clause ?? '').split(/\r?\n/).map(norm).filter(Boolean));
  return rule.ok.some((o) => {
    const w = flat(o);
    const hit = mine.filter((c) => c.includes(w));
    return hit.length > 0 && hit.every((c) => clauseNegated(c, w)) && !std.some((c) => clauseNegated(c, w));
  });
}

export function checkRules(text: string, rules: RuleSpec[]): Verdict[] {
  const paras = paragraphs(text);
  return rules
    .map((r) => judge(r, paras))
    .sort((x, y) => rank(x) - rank(y) || x.rule.effective.localeCompare(y.rule.effective));
}

/** 고칠 것(필수 미반영·누락) → 선택 → 반영됨 */
function rank(v: Verdict): number {
  if (v.status === '반영됨') return 3;
  return v.rule.required ? 1 : 2;
}
