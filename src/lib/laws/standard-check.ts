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
  /** 명칭 변경형 — 짝지은 조문 밖에 남은 옛 명칭(stale)도 문서 전체에서 찾는다 */
  everywhere?: boolean;
  /** 상시 점검 — 기간과 무관하게 늘 본다(오래전 개정인데 실제 규칙에 자주 남는 것: 휴일근로 8시간 초과 가산 등) */
  always?: boolean;
}

export interface Art93Item {
  no: string;
  label: string;
  keywords: string[];
}

const flat = (s: string) => s.replace(/[\sㆍ·]/g, '');

/** 근로기준법 제93조 각 호 1차 점검 — 키워드가 하나도 없는 호. 키워드 없는 호(13호)는 보지 않는다 */
export function missingArt93(text: string, items: Art93Item[]): Art93Item[] {
  const t = flat(text);
  return items.filter((i) => i.keywords.length && !i.keywords.some((k) => t.includes(flat(k))));
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
    let line = raw.trim();
    if (!line) continue;
    // PDF 추출은 장 제목·쪽 머리 글자를 조문 머리와 한 줄에 붙인다(「제1장 총 칙 제1조(목적)」 「박 현 제12조(출장)」, 공공기관 규칙 시험)
    const lead = line.match(/^(?:제\s*\d+\s*장[^제]{0,15}|[^제]{1,6})\s+(?=제\s*\d+\s*조(?:\s*의\s*\d+)?\s*[(【[])/);
    if (lead) line = line.slice(lead[0].length);
    const m = line.match(ART);
    if (m) {
      out.push({ no: m[1].replace(/\s/g, ''), title: (m[2] ?? m[3] ?? m[4] ?? '').trim(), text: line });
    } else if (out.length) {
      out[out.length - 1].text += '\n' + line;
    }
  }
  return out;
}

const bigrams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
/** 제목 글자쌍 겹침(0~1) — 「보호」 한 낱말로 동점이 된 조문을 가른다(2023 표준판 「피해자의 보호」 → 임산부의 보호 오짝, 2026-10-05) */
function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}

/** 제목 조각으로는 너무 흔한 낱말 — 「시용기간」이 「휴직사유 및 기간」에 붙었다(2026-10-05 실제 회사 규칙 7건 시험) */
const GENERIC = new Set(['기간', '계산', '지급', '사용', '교육', '보호', '조치', '금지', '기준', '방법', '절차', '운영', '구성', '기능', '의무', '제한', '사항', '등의', '단축의', '사용형태', '근로시간']);

function score(std: StdArticle, u: UserArticle): number {
  const st = squash(std.title);
  const ut = squash(u.title);
  if (ut && st === ut) return 100;
  if (ut && ut.length >= 2 && (st.includes(ut) || ut.includes(st))) return 80;
  const kw = std.keywords.map(squash).filter((k) => k.length >= 2 && !GENERIC.has(k));
  if (ut && kw.some((k) => ut.includes(k))) return 60 + Math.round(dice(st, ut) * 10);
  const head = squash(u.text.slice(0, 160));
  if (kw.some((k) => head.includes(k))) return 30;
  return 0;
}

/** 표준 조문 id → 짝지은 내 조문들.
 *  내 조문마다 점수가 가장 높은 표준 조문(동점이면 모두)에만 붙인다. 표준 조문 쪽에서 문턱 이상을 전부 모으면
 *  「휴게」「지급」 같은 두 글자 조각 때문에 한 조문이 열 곳에 붙는다(2026-10-05 실데이터 자기시험 58건 실패) */
export function matchArticles(user: UserArticle[], std: StdArticle[], opts: { weak?: boolean } = {}): Map<string, UserArticle[]> {
  const out = new Map<string, UserArticle[]>();
  for (const u of user) {
    const scored = std.map((s) => ({ s, sc: score(s, u) }));
    const top = Math.max(0, ...scored.map((x) => x.sc));
    if (!top) continue;
    for (const { s } of scored.filter((x) => x.sc === top)) out.set(s.id, [...(out.get(s.id) ?? []), u]);
  }
  if (opts.weak) return out;
  // 본문 낱말로만 붙은 짝(30점)은 판정 위치로 쓰지 않는다 — 「손해변상」「견책」이 육아휴직 사용형태에 붙었다.
  // 짝이 비면 periodCheck 가 문서 전체에서 매핑 키워드로 찾는다(B 방식). 「조문이 있나」(누락 점검)에는 weak 를 쓴다
  for (const s of std) {
    const got = out.get(s.id);
    if (!got) continue;
    const strong = got.filter((u) => score(s, u) >= 60);
    if (strong.length) out.set(s.id, strong);
    else out.delete(s.id);
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
  /** 근로기준법 제93조 필수기재 — 키워드가 하나도 없는 호(본문을 넣었을 때만) */
  missing93: Art93Item[];
  /** 최종 개정일 이전에 시행된 필수 개정 중 반영 안 된 것(옛 문구가 실제로 남은 조문이 있을 때만) */
  earlier: { std: StdArticle; verdict: Verdict }[];
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
  art93?: Art93Item[];
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
  const verdictOf = (r: StdRule, mine: UserArticle[]): Verdict => {
      // 짝지은 조문이 없으면 문서 전체에서 찾는다(B 방식) — 제목이 다른 조문 안에 들어 있는 경우
      // (2019년 표준판은 배우자 출산휴가를 「경조사 휴가」 조문 안에 둔다. 2026-10-05 A/B 대조)
      // 짝지은 조문 + 제목에 매핑 키워드가 든 조문(표준 「휴직사유」에 내 「휴직」만 짝지어지고 「육아휴직」 조문이 빠지던 것, 2026-10-05 강동 신고본)
      const titled = user.filter((u) => u.title && r.keywords.some((k) => flat(u.title).includes(flat(k))));
      const cand = [...new Set([...mine, ...titled])];
      const paras = paragraphs(cand.length ? cand.map((u) => u.text).join('\n') : text);
      let v: Verdict = hasText ? judge(r, paras) : { rule: r, status: '누락', where: null, stale: [], missing: r.ok };
      if (hasText && !r.ok.length && r.stale.length) {
        // 옛 문구만으로 판정하는 매핑 — judge 는 옛 문구 없는 다른 조문을 골라 「반영됨」으로 빠진다. 후보 어디에든 남아 있으면 미반영
        const hit = paras.filter((p) => r.stale.some((s) => flat(p.text).includes(flat(s))));
        v = hit.length
          ? { rule: r, status: '미반영', where: hit[0].article, stale: r.stale.filter((s) => hit.some((p) => flat(p.text).includes(flat(s)))), missing: [] }
          : { rule: r, status: '반영됨', where: null, stale: [], missing: [] };
      }
      if (hasText && r.everywhere) {
        // 옛 명칭이 다른 조문에 남아 있으면 그 조문도 고칠 곳이다(2025 표준판 제18조 휴직명령의 「배우자 출산휴가」)
        const all = paragraphs(text);
        const left = [...new Set(all.filter((p) => r.stale.some((s) => flat(p.text).includes(flat(s)))).map((p) => p.article).filter((a): a is string => !!a && a !== v.where))];
        if (left.length) v = { ...v, status: '미반영', where: [v.where, ...left].filter(Boolean).join(', '), stale: [...new Set([...v.stale, ...r.stale.filter((s) => all.some((p) => flat(p.text).includes(flat(s))))])] };
      }
      return v;
  };
  for (const r of opts.rules) {
    if (!r.always && (r.effective <= from || r.effective > to)) continue;
    for (const id of r.std ?? []) {
      const s = stdById.get(id);
      if (!s) continue;
      const it = item(s);
      it.verdicts.push(verdictOf(r, it.user));
    }
  }
  // 최종 개정일 이전에 시행됐는데 반영 안 된 필수 개정 — 기간만 보면 놓친다
  // (2026.6. 개정본인데 2025.2.23. 유산·사산휴가 개정이 그대로 남은 공공기관 규칙, 2026-10-05 시험)
  const earlier: { std: StdArticle; verdict: Verdict }[] = [];
  if (hasText) {
    for (const r of opts.rules) {
      if (r.always || !r.required || r.effective > from) continue;
      const s = stdById.get((r.std ?? [])[0] ?? '');
      if (!s) continue;
      const v = verdictOf(r, matched.get(s.id) ?? []);
      if (v.status !== '반영됨' && v.stale.length) earlier.push({ std: s, verdict: v });
    }
  }

  for (const it of byStd.values()) {
    const vs = it.verdicts;
    const ruleClause = vs.map((v) => v.rule.clause).filter(Boolean).join('\n\n');
    if (ruleClause) [it.proposal, it.proposalFrom] = [ruleClause, '매핑'];
    // Standard-only wording awaits legal review; show the source event without automatic proposal.
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
  const present = matchArticles(user, std, { weak: true });
  const missingRequired = hasText ? std.filter((s) => s.kind === '필수' && !present.has(s.id)) : [];
  return { items, missingRequired, missing93: hasText ? missingArt93(text, opts.art93 ?? []) : [], earlier, matched };
}
