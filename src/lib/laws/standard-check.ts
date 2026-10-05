// 취업규칙 기간 점검(A) — 표준취업규칙 2026 조문을 뼈대로 판정한다. 본문은 브라우저 밖으로 나가지 않는다.
// ① 내 조문을 표준 조문에 짝짓고 ② 기간 [최종 개정일, 기준일] 안에 시행되는 개정 중 그 표준 조문에 걸리는 것을 모은다.
// 매핑(RuleSpec)이 있으면 짝지은 내 조문 안에서만 judge 한다 — 문서 전체를 키워드로 훑는 B(checkRules)와 다른 점이다.
import type { LawEvent } from './format';
import { judge, paragraphs, type RuleSpec, type Verdict } from './rules-check';

export interface StdLawRef {
  lawId: string | null;
  law: string;
  article: string;
}

export interface StdArticle {
  id: string;
  no: string;
  title: string;
  chapter: string | null;
  kind: '필수' | '선택';
  text: string;
  laws: StdLawRef[];
  keywords: string[];
  status: 'auto' | 'checked';
}

export interface StdRule extends RuleSpec {
  /** 이 매핑이 걸리는 표준 조문 id */
  std?: string[];
}

export interface UserArticle {
  no: string;
  title: string;
  text: string;
}

/** 표준취업규칙 2026 배포(2026.2.) — 이 날 이전에 시행된 개정은 표준 문안이 이미 반영하고 있다 */
export const STD_ASOF = '20260201';

const ART = /^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*(?:\(([^)]*)\)|【([^】]*)】|\[([^\]]*)\])?/;
const squash = (s: string) => s.replace(/[\s·ㆍ.,()]/g, '');

/** 「제N조(제목)」 덩어리로 나눈다. 조문 머리가 없는 앞부분은 버린다 */
export function splitArticles(text: string): UserArticle[] {
  const out: UserArticle[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(ART);
    if (m) {
      out.push({ no: m[1].replace(/\s/g, ''), title: (m[2] ?? m[3] ?? m[4] ?? '').trim(), text: line });
    } else if (out.length) {
      out[out.length - 1].text += '\n' + line;
    }
  }
  return out;
}

function score(std: StdArticle, u: UserArticle): number {
  const st = squash(std.title);
  const ut = squash(u.title);
  if (ut && st === ut) return 100;
  if (ut && ut.length >= 2 && (st.includes(ut) || ut.includes(st))) return 80;
  const kw = std.keywords.map(squash).filter((k) => k.length >= 2);
  if (ut && kw.some((k) => ut.includes(k))) return 60;
  const head = squash(u.text.slice(0, 160));
  if (kw.some((k) => head.includes(k))) return 30;
  return 0;
}

/** 표준 조문 id → 짝지은 내 조문들.
 *  내 조문마다 점수가 가장 높은 표준 조문(동점이면 모두)에만 붙인다. 표준 조문 쪽에서 문턱 이상을 전부 모으면
 *  「휴게」「지급」 같은 두 글자 조각 때문에 한 조문이 열 곳에 붙는다(2026-10-05 실데이터 자기시험 58건 실패) */
export function matchArticles(user: UserArticle[], std: StdArticle[]): Map<string, UserArticle[]> {
  const out = new Map<string, UserArticle[]>();
  for (const u of user) {
    const scored = std.map((s) => ({ s, sc: score(s, u) }));
    const top = Math.max(0, ...scored.map((x) => x.sc));
    if (!top) continue;
    for (const { s } of scored.filter((x) => x.sc === top)) out.set(s.id, [...(out.get(s.id) ?? []), u]);
  }
  // 제목으로 짝지은 조문이 있는 표준 조문에서는 본문 낱말로만 붙은 조문(30점)을 뗀다
  for (const s of std) {
    const got = out.get(s.id);
    if (got && got.some((u) => score(s, u) >= 60)) out.set(s.id, got.filter((u) => score(s, u) >= 60));
  }
  return out;
}

/** 최종 개정일 다음 날부터 기준일까지 시행되는 개정. 날짜는 YYYYMMDD */
export function eventsInPeriod(events: LawEvent[], from: string, to: string): LawEvent[] {
  return events.filter((e) => e.date > from && e.date <= to);
}

/** 개정 이벤트가 걸리는 표준 조문 — 바뀐 조문(lawId+조문)을 인용한 표준 조문 */
export function stdForEvent(e: LawEvent, std: StdArticle[]): { std: StdArticle; articles: string[] }[] {
  const out: { std: StdArticle; articles: string[] }[] = [];
  for (const s of std) {
    const arts = e.changes
      .map((c) => c.article)
      .filter((a) => s.laws.some((l) => l.lawId === e.lawId && l.article === a));
    if (arts.length) out.push({ std: s, articles: [...new Set(arts)] });
  }
  return out;
}

export type ItemStatus = '고칠 것' | '조문 추가' | '반영됨' | '선택' | '법령 확인';

export interface PeriodItem {
  std: StdArticle;
  user: UserArticle[];
  events: { event: LawEvent; articles: string[] }[];
  verdicts: Verdict[];
  status: ItemStatus;
  /** 바꿀 문안 — 매핑 문안, 없으면 표준 문안(배포 전 시행분), 없으면 null */
  proposal: string | null;
  proposalFrom: '매핑' | '표준취업규칙' | null;
}

export interface PeriodResult {
  items: PeriodItem[];
  /** 짝이 없는 [필수] 표준 조문 — 본문을 넣었을 때만 */
  missingRequired: StdArticle[];
  matched: Map<string, UserArticle[]>;
}

const RANK: Record<ItemStatus, number> = { '고칠 것': 0, '조문 추가': 1, '법령 확인': 2, 선택: 3, 반영됨: 4 };

export function periodCheck(opts: {
  text: string;
  std: StdArticle[];
  events: LawEvent[];
  rules: StdRule[];
  from: string;
  to: string;
}): PeriodResult {
  const { text, std, from, to } = opts;
  const user = splitArticles(text);
  const hasText = user.length > 0;
  const matched = matchArticles(user, std);
  const byStd = new Map<string, PeriodItem>();
  const item = (s: StdArticle) => {
    let it = byStd.get(s.id);
    if (!it) {
      it = { std: s, user: matched.get(s.id) ?? [], events: [], verdicts: [], status: '법령 확인', proposal: null, proposalFrom: null };
      byStd.set(s.id, it);
    }
    return it;
  };

  for (const e of eventsInPeriod(opts.events, from, to)) {
    for (const { std: s, articles } of stdForEvent(e, std)) item(s).events.push({ event: e, articles });
  }
  const stdById = new Map(std.map((s) => [s.id, s]));
  for (const r of opts.rules) {
    if (r.effective <= from || r.effective > to) continue;
    for (const id of r.std ?? []) {
      const s = stdById.get(id);
      if (!s) continue;
      const it = item(s);
      // 짝지은 조문이 없으면 문서 전체에서 찾는다(B 방식) — 제목이 다른 조문 안에 들어 있는 경우
      // (2019년 표준판은 배우자 출산휴가를 「경조사 휴가」 조문 안에 둔다. 2026-10-05 A/B 대조)
      const paras = paragraphs(it.user.length ? it.user.map((u) => u.text).join('\n') : text);
      it.verdicts.push(hasText ? judge(r, paras) : { rule: r, status: '누락', where: null, stale: [], missing: r.ok });
    }
  }

  for (const it of byStd.values()) {
    const vs = it.verdicts;
    const ruleClause = vs.map((v) => v.rule.clause).filter(Boolean).join('\n\n');
    const preStd = it.events.some((x) => x.event.date <= STD_ASOF);
    if (ruleClause) [it.proposal, it.proposalFrom] = [ruleClause, '매핑'];
    else if (preStd) [it.proposal, it.proposalFrom] = [it.std.text, '표준취업규칙'];
    if (!hasText) it.status = vs.length ? (vs.some((v) => v.rule.required) ? '고칠 것' : '선택') : '법령 확인';
    else if (vs.length) {
      const open = vs.filter((v) => v.status !== '반영됨');
      if (!open.length) it.status = '반영됨';
      else if (!open.some((v) => v.rule.required)) it.status = '선택';
      else it.status = it.user.length || open.some((v) => v.where) ? '고칠 것' : '조문 추가';
    } else it.status = it.user.length ? '법령 확인' : it.std.kind === '필수' ? '조문 추가' : '법령 확인';
  }

  const items = [...byStd.values()].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || a.std.no.localeCompare(b.std.no, 'ko', { numeric: true }),
  );
  const missingRequired = hasText ? std.filter((s) => s.kind === '필수' && !matched.has(s.id)) : [];
  return { items, missingRequired, matched };
}
