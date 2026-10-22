// 정밀 점검 파이프라인 — 조문 분할·짝짓기 → 수치 하락·법령 기준(결정적) → 묶음 판단(모델) → 대조표(comparison.v1).
// 기준 구현은 scripts/work_rules_c/run.py(pipeline, 묶음 판단 경로)와 report.py 다.
import { checkRules, type RuleSpec } from '../rules-check';
import { duplicated, pairArticles, splitArticles, type ArticlePair } from './articles';
import { forceEscalate, judgeAll, type Ask, type Finding, type RuleHit } from './judge';
import { quantityDrops, type Drop } from './quantities';

export const COLUMNS = ['조문', '현행', '개정안', '개정 사유', '근거·시행일', '불이익변경', '점검 결과', '운영 메모', '제안 문안'] as const;
export type Row = Record<(typeof COLUMNS)[number], string>;
export const NEW_BUCKET = '(신설 필요)';

// 산출물에 못 쓰는 말(NOW.md — 직무 표방·확률 숫자 금지). 모델이 쓴 글에서 바꾸거나 지운다
const REPLACE: [string, string][] = [['판정', '점검 결과'], ['자문', '검토'], ['상담', '문의'], ['진단', '점검']];
const PROB = /(?:확률|가능성|정확도)\s*[:은는이가]?\s*\d+(?:\.\d+)?\s*%?|(?:확률|정확도)/g;

export function clean(text: string): string {
  let t = text;
  for (const [a, b] of REPLACE) t = t.split(a).join(b);
  return t.replace(PROB, '').replace(/\s{2,}/g, ' ').trim();
}

const dotted = (d: string) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.`;
const basisOf = (hits: RuleHit[]) => hits.map((h) => `${h.lawArticle} (${dotted(h.effective)} 시행)`).join('; ');

/** 법령 기준 대조 — 조문 하나를 한 줄로 넘긴다(본문 속 「제3조에 따라」 줄을 새 조문으로 읽지 않게). */
export function mapRules(articles: { no: string; title: string; body: string }[], since: string, rules: RuleSpec[]): Map<string, RuleHit[]> {
  const text = articles.map((a) => `${a.no}(${a.title}) ` + a.body.split(/\s+/).filter(Boolean).join(' ')).join('\n');
  const out = new Map<string, RuleHit[]>();
  const live = rules.filter((r) => r.effective >= since);
  for (const v of checkRules(text, live)) {
    const key = v.where ? (v.where.match(/제\d+조(?:의\d+)?/)?.[0] ?? v.where) : NEW_BUCKET;
    const hit: RuleHit = { topic: v.rule.topic, lawArticle: v.rule.article, effective: v.rule.effective, status: v.status };
    out.set(key, [...(out.get(key) ?? []), hit]);
  }
  return out;
}

/** 저장용 행 — 본문 보관에 동의하지 않았으면 조문 원문(현행·개정안)을 비우고 점검 결과만 남긴다. */
export function rowsForStore(rows: Row[], store: boolean): Row[] {
  return store ? rows : rows.map((r) => ({ ...r, 현행: '', 개정안: '' }));
}

export interface PreciseInput {
  rules: string; // 개정안(또는 현행) 본문
  old?: string | null; // 종전 본문 — 없으면 단일 문서 점검
  since: string; // YYYYMMDD — 이 날 이후 시행 법령만 대조
  headcount?: string;
}

export interface PreciseResult {
  rows: Row[];
  articles: number;
  flagged: number;
}

export async function precisePipeline(input: PreciseInput, ruleSpecs: RuleSpec[],
  opts: { ask: Ask; runs?: number; workers?: number; size?: number }): Promise<PreciseResult> {
  const neu = splitArticles(input.rules);
  const old = input.old ? splitArticles(input.old) : [];
  if (!neu.some((a) => a.body.trim())) throw new Error('empty_rules');
  if (input.old && !old.some((a) => a.body.trim())) throw new Error('empty_old');
  const pairs = pairArticles(old, neu);
  const drops = new Map(pairs.map((p) => [p.no, quantityDrops(p)]));
  const hits = mapRules(neu, input.since, ruleSpecs);
  const known = new Set(pairs.map((p) => p.no));
  for (const [k, hs] of [...hits]) { // 조문 짝이 없는 매핑은 버리지 않는다
    if (k !== NEW_BUCKET && !known.has(k)) {
      hits.set(NEW_BUCKET, [...(hits.get(NEW_BUCKET) ?? []), ...hs]);
      hits.delete(k);
    }
  }
  const judged = await judgeAll(pairs, drops, hits, { ...opts, headcount: input.headcount ?? '' });
  const dups = duplicated(pairs.map((p) => p.no));
  const rows: Row[] = [];
  for (const p of pairs) {
    const d = drops.get(p.no) ?? [];
    const h = hits.get(p.no) ?? [];
    const hard = p.new === null || dups.has(p.no) || forceEscalate(d, h);
    if (!judged.has(p.no) && !hard) continue;
    rows.push(row(p, d, h, judged.get(p.no) ?? null, dups.has(p.no)));
  }
  for (const h of hits.get(NEW_BUCKET) ?? []) {
    rows.push({ 조문: '신설 필요', 현행: '', 개정안: '', '개정 사유': h.topic, '근거·시행일': basisOf([h]),
      불이익변경: '해당 없음', '점검 결과': '추가 확인', '운영 메모': '', '제안 문안': '' });
  }
  return { rows, articles: pairs.length, flagged: rows.length };
}

function row(p: ArticlePair, d: Drop[], h: RuleHit[], j: Finding | null, dup: boolean): Row {
  const hard = d.length > 0 || p.status === '삭제'; // 기계 신호 — 판단이 「해당 없음」으로 지우지 못한다
  let disadvantage = j ? j.disadvantage : hard ? '확인 필요' : '해당 없음';
  if (hard && disadvantage === '해당 없음') disadvantage = '확인 필요';
  const memo = j?.ops_note ? [clean(j.ops_note)] : [];
  if (d.length) memo.push('수치 하락: ' + d.map((x) => `${x.oldMax}${x.unit} → ${x.newMax}${x.unit}`).join(', '));
  if (dup) memo.push('조문 번호 중복 — 같은 번호의 조문이 둘 이상이다');
  if (p.status === '삭제') memo.push('조문 삭제');
  else if (p.oldNo && p.oldNo !== p.no) memo.push(`종전 ${p.oldNo}에서 옮김`);
  const result = dup && (!j || j.result === '추가 확인') ? '현행 수정 필요' : j ? j.result : '추가 확인';
  return {
    조문: p.no,
    현행: p.old?.body ?? '',
    개정안: p.new?.body ?? '',
    '개정 사유': j ? clean(j.reason) : '',
    '근거·시행일': j?.basis ? clean(j.basis) : basisOf(h),
    불이익변경: disadvantage,
    '점검 결과': result,
    '운영 메모': memo.filter(Boolean).join(' · '),
    '제안 문안': j ? clean(j.proposed_text) : '',
  };
}
