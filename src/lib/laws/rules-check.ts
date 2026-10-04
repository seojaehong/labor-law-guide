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
  keywords: string[];
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
}

const ART = /^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(\([^)]*\))?/;
const norm = (s: string) => s.replace(/ㆍ/g, '·').replace(/\s+/g, ' ').trim();
const has = (text: string, needle: string) => text.replace(/\s/g, '').includes(norm(needle).replace(/\s/g, ''));

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
    if (m) current = (m[1].replace(/\s/g, '') + (m[2] ?? '')).trim();
    out.push({ article: current, text: line });
  }
  return out;
}

export function judge(rule: RuleSpec, paras: Para[]): Verdict {
  const hits = paras.filter((p) => rule.keywords.some((k) => has(p.text, k)));
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
  return { rule, status: b.score === 0 ? '반영됨' : '미반영', where: b.where, stale: b.stale, missing: b.missing };
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
