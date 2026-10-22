// 정밀 점검 파이프라인 — 조문 분할·짝짓기 → 수치 하락·법령 기준(결정적) → 묶음 판단(모델) → 대조표(comparison.v1).
// 기준 구현은 scripts/work_rules_c/run.py(pipeline, 묶음 판단 경로)와 report.py 다.
import { todayKST } from '../format';
import { checkRules, type RuleSpec } from '../rules-check';
import { duplicated, pairArticles, splitArticles, type ArticlePair } from './articles';
import { forceEscalate, judgeAll, type Ask, type Finding, type RuleHit, type Evidence } from './judge';
import { quantityDrops, type Drop } from './quantities';

export const COLUMNS = ['조문', '현행', '개정안', '개정 사유', '근거·시행일', '불이익변경', '점검 결과', '운영 메모', '제안 문안'] as const;
export type Row = Record<(typeof COLUMNS)[number], string> & { review?: { incomplete?: boolean; conflict?: boolean; citationLinked?: boolean; sourceMissing?: boolean; asOf?: string; since?: string } };
export const NEW_BUCKET = '(신설 필요)';

// 확률 숫자는 산출물에 쓰지 않는다(NOW.md). 모델이 쓴 판단 글(개정 사유·운영 메모)에서만 지운다.
// 「건강진단」「고충상담」「노동위원회 판정」 같은 법령 용어는 바꾸지 않는다 — 직무 표방 어휘는 프롬프트가 막는다
const PROB = /(?:확률|정확도)\s*[:은는이가]?\s*\d+(?:\.\d+)?\s*%?|가능성\s*[:은는이가]?\s*\d+(?:\.\d+)?\s*%/g;
export const MAX_ARTICLES = 300; // 취업규칙 한 벌은 60~120조다 — 넘으면 호출 수·비용 상한이 깨진다

export function clean(text: string): string {
  return text.replace(PROB, '').replace(/\s{2,}/g, ' ').trim();
}

const dotted = (d: string) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.`;
const sourcesComplete = (hits: RuleHit[]) => hits.length > 0 && hits.every((h) => !!h.source);
const basisOf = (hits: RuleHit[]) => hits.map((h) => `${h.lawArticle} (${dotted(h.effective)} 시행)`).join('; ');

/** 법령 기준 대조 — 조문 하나를 한 줄로 넘긴다(본문 속 「제3조에 따라」 줄을 새 조문으로 읽지 않게). */
export function mapRules(articles: { no: string; title: string; body: string }[], since: string, rules: RuleSpec[], evidence = new Map<string, Evidence>()): Map<string, RuleHit[]> {
  const text = articles.map((a) => `${a.no}(${a.title}) ` + a.body.split(/\s+/).filter(Boolean).join(' ')).join('\n');
  const out = new Map<string, RuleHit[]>();
  const live = rules.filter((r) => r.effective >= since);
  for (const v of checkRules(text, live)) {
    const key = v.where ? (v.where.match(/제\d+조(?:의\d+)?/)?.[0] ?? v.where) : NEW_BUCKET;
    const hit: RuleHit = { topic: v.rule.topic, lawArticle: `${v.rule.law} ${v.rule.article}`, effective: v.rule.effective, status: v.status, source: evidence.get(`${v.rule.lawId}/${v.rule.article}/${v.rule.effective}`) };
    out.set(key, [...(out.get(key) ?? []), hit]);
  }
  return out;
}

/** 저장용 행 — 본문 보관에 동의하지 않았으면 조문 원문과 원문을 옮겨 적기 쉬운 칸(사유·메모·제안 문안)을 비우고
 *  조문 번호·점검 결과·불이익변경·근거만 남긴다. */
export function rowsForStore(rows: Row[], store: boolean): Row[] {
  return store ? rows : rows.map((r) => ({ ...r, 현행: '', 개정안: '', '개정 사유': '', '운영 메모': '', '제안 문안': '', '근거·시행일': r['근거·시행일'].split(/(?:^|; )AI 인용\(미검증\):/)[0] }));
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
  review: { unanswered: number; incomplete: number; conflicts: number; asOf: string; since: string };
}

export async function precisePipeline(input: PreciseInput, ruleSpecs: RuleSpec[],
  opts: { evidence?: Map<string, Evidence>; asOf?: string; ask: Ask; runs?: number; workers?: number; size?: number; signal?: AbortSignal }): Promise<PreciseResult> {
  const neu = splitArticles(input.rules);
  const old = input.old ? splitArticles(input.old) : [];
  if (!neu.some((a) => a.body.trim())) throw new Error('empty_rules');
  if (input.old && !old.some((a) => a.body.trim())) throw new Error('empty_old');
  const pairs = pairArticles(old, neu);
  if (pairs.length > MAX_ARTICLES) throw new Error('too_many_articles');
  const drops = new Map(pairs.map((p) => [p.no, quantityDrops(p)]));
  const hits = mapRules(neu, input.since, ruleSpecs, opts.evidence);
  const known = new Set(pairs.map((p) => p.no));
  for (const [k, hs] of [...hits]) { // 조문 짝이 없는 매핑은 버리지 않는다
    if (k !== NEW_BUCKET && !known.has(k)) {
      hits.set(NEW_BUCKET, [...(hits.get(NEW_BUCKET) ?? []), ...hs]);
      hits.delete(k);
    }
  }
  const judged = await judgeAll(pairs, drops, hits, { ...opts, since: input.since, asOf: opts.asOf ?? todayKST(), headcount: input.headcount ?? '' }); // opts.signal = 요청 전체 시간 상한
  const dups = duplicated(pairs.map((p) => p.no));
  const rows: Row[] = [];
  for (const p of pairs) {
    const d = drops.get(p.no) ?? [];
    const h = hits.get(p.no) ?? [];
    const hard = p.new === null || dups.has(p.no) || forceEscalate(d, h);
    if (!judged.has(p.no) && !hard && sourcesComplete(h)) continue;
    rows.push(row(p, d, h, judged.get(p.no) ?? null, dups.has(p.no)));
  }
  for (const h of hits.get(NEW_BUCKET) ?? []) {
    rows.push({ 조문: '신설 필요', 현행: '', 개정안: '', '개정 사유': h.topic, '근거·시행일': basisOf([h]),
      불이익변경: '해당 없음', '점검 결과': '추가 확인', '운영 메모': '', '제안 문안': '' });
  }
  return { rows: rows.map((r) => ({ ...r, review: { ...r.review, asOf: opts.asOf ?? todayKST(), since: input.since } })), articles: pairs.length, flagged: rows.length, review: { unanswered: [...judged.values()].filter((f) => f.unanswered).length, incomplete: [...judged.values()].filter((f) => f.incomplete).length, conflicts: [...judged.values()].filter((f) => f.conflict).length, asOf: opts.asOf ?? todayKST(), since: input.since } };
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
  const citedArticles = new Set<string>(j?.basis.replace(/\s+/g, '').match(/제\d+조(?:의\d+)?/g) ?? []);
  const citationLinked = !!j?.basis && h.some((x) => x.source && j.basis.includes(x.source.law)
    && citedArticles.has(x.source.article.replace(/\s+/g, '')));
  if (citationLinked) memo.push('AI 인용의 법령명·조문 식별자 일치 — 법률 적용과 인용 내용은 미검증');
  if (j?.basis && !citationLinked) memo.push('AI 인용을 제공 원문 식별자와 연결하지 못함 — 추가 확인');
  if (j?.basis) memo.push('AI 인용 미검증 — 법령 원문·시행일·적용 여부 추가 확인');
  if (!sourcesComplete(h)) memo.push('연결된 법령 원문 없음 또는 일부 누락 — 추가 확인');
  if (j && !sourcesComplete(h)) memo.push(`AI 의견(미검증): ${j.result}`);
  const result = dup && (!j || j.result === '추가 확인') ? '현행 수정 필요' : j && j.result !== '문제없음' && citationLinked && sourcesComplete(h) ? j.result : '추가 확인';
  return {
    review: { incomplete: !!j?.incomplete, conflict: !!j?.conflict, citationLinked, sourceMissing: !sourcesComplete(h) },
    조문: p.no,
    현행: p.old?.body ?? '',
    개정안: p.new?.body ?? '',
    '개정 사유': j ? clean(j.reason) : '',
    '근거·시행일': [basisOf(h), ...h.filter((x) => x.source).map((x) => `${x.source!.law} ${x.source!.article} · 저장소 원문 연결(최신성·적용 확인 필요) ${x.source!.url}`), j?.basis ? `AI 인용(미검증): ${j.basis}` : ''].filter(Boolean).join('; '),
    불이익변경: disadvantage,
    '점검 결과': result,
    '운영 메모': memo.filter(Boolean).join(' · '),
    '제안 문안': j ? j.proposed_text : '', // 조문 문안은 손대지 않는다 — 법령 용어가 깨진다
  };
}
