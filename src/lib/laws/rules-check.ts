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

// 부정 어미 — ok 낱말 **뒤** 같은 문장 안에서만 본다. 단서(「다만, … 그러하지 아니하다」)는 마침표로 갈려 다른 문장이다.
const NEG = /(지않|지아니|아니한다|아니된다|수없|못한다|불허)/;
const flat = (s: string) => norm(s).replace(/\s/g, '');
const sentencesOf = (texts: string[]) => texts.flatMap((t) => t.split(/(?<=[.。])\s*/)).map(flat);
/** w 가 든 문장이 있고, 그 문장마다 w 뒤에 부정이 붙었는가 */
const negAfter = (sentences: string[], w: string) => {
  const hit = sentences.filter((s) => s.includes(w));
  return hit.length > 0 && hit.every((s) => NEG.test(s.slice(s.indexOf(w) + w.length)));
};

/**
 * ok 낱말 뒤에 부정이 붙었는데 표준 문안(clause)의 같은 낱말 뒤에는 부정이 없는가.
 * 「불리한 처우를 하지 아니한다」처럼 표준 문안 자체가 부정형인 금지 조항은 그대로 둔다.
 * 규칙의 ok·keywords 자체가 부정을 품으면 보지 않는다.
 */
function negatedOk(rule: RuleSpec, paras: Para[]): boolean {
  if (!rule.ok.length || [...rule.ok, ...rule.keywords].some((w) => NEG.test(flat(w)))) return false;
  const mine = sentencesOf(paras.map((p) => p.text));
  const std = sentencesOf([rule.clause ?? '']);
  return rule.ok.some((o) => {
    const w = flat(o);
    // 표준 문안에 w 뒤가 부정인 문장이 하나라도 있으면 부정형이 정상일 수 있다 — 보지 않는다
    return negAfter(mine, w) && !std.some((s) => s.includes(w) && NEG.test(s.slice(s.indexOf(w) + w.length)));
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
