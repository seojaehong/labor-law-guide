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

export type Status = '반영됨' | '미반영' | '누락' | '검토 필요';

export interface Verdict {
  rule: RuleSpec;
  status: Status;
  where: string | null;
  stale: string[];
  missing: string[];
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

export function hasRuleEvidence(rule: RuleSpec): boolean {
  const date = rule.effective;
  const iso = typeof date === 'string' ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : '';
  return !!rule.law?.trim() && /^(?:제\d+조(?:의\d+)?|별표(?:\s*\d+)?|본문)$/.test(rule.article ?? '') &&
    !!rule.lawId?.trim() && /^\d{8}$/.test(date ?? '') &&
    !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso;
}

export function judge(rule: RuleSpec, paras: Para[]): Verdict {
  if (!hasRuleEvidence(rule)) return { rule, status: '검토 필요', where: null, stale: [], missing: [] };
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
  // A newer-looking block cannot hide contradictory old wording elsewhere in the same scheme.
  const conflicting = rule.stale.filter(s => scoped.some(p => has(p.text, s)));
  if (b.score === 0 && conflicting.length) return { rule, status: '검토 필요', where: b.where, stale: conflicting, missing: [] };
  const effective = rule.requiredIfStale && b.stale.length ? { ...rule, required: true } : rule;
  return { rule: effective, status: b.score === 0 ? '반영됨' : '미반영', where: b.where, stale: b.stale, missing: b.missing };
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
