// 정밀 점검 — 연속된 조문 몇 개를 한 번에 판단한다(묶음 판단). 묶음을 동시에 보내고, 여러 회차의 합집합을 낸다.
// 기준 구현은 scripts/work_rules_c/batch_judge.py 다. 프롬프트는 prompts.ts(= batch_system.md 사본).
import type { ArticlePair } from './articles';
import type { Drop } from './quantities';
import { BATCH_SYSTEM } from './prompts';

export type Result = '문제없음' | '현행 수정 필요' | '시행 예정' | '회사 선택' | '추가 확인';
export type Disadvantage = '해당' | '해당 없음' | '확인 필요' | '비교 불가';
export const DISADVANTAGES: Disadvantage[] = ['해당', '해당 없음', '확인 필요', '비교 불가'];
/** 종전 규칙 없이 점검한 행의 불이익변경 칸 — 「해당 없음」(대조해 보니 불리하지 않다)과 다른 상태다 */
export const NO_BASELINE = '비교 불가 — 종전 규칙 미제공';
/** 묶음 하나에 넣는 조문 수와 회차 수 — judgeAll 기본값이고, 화면 진행 문구도 이 값을 쓴다 */
export const BATCH_SIZE = 8;
export const BATCH_RUNS = 2;
export const groupCount = (articles: number) => Math.ceil(articles / BATCH_SIZE);

export interface Finding {
  no: string;
  result: Result;
  disadvantage: Disadvantage;
  reason: string;
  basis: string;
  ops_note: string;
  proposed_text: string;
  incomplete?: boolean;
  unanswered?: boolean;
  conflict?: boolean;
}

/** 법령 기준 대조 한 건 — rules-check.ts 의 Verdict 를 조문에 붙인 것 */
export interface RuleHit {
  topic: string;
  lawArticle: string;
  effective: string; // YYYYMMDD
  status: '반영됨' | '미반영' | '누락';
  source?: Evidence;
}

export interface Evidence {
  law: string; article: string; effective: string; text: string; url: string;
}

export interface Accounting { attempts: number; responsesWithUsage: number }

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/** 묶음 하나를 묻는다 — 답(조문별) 또는 실패 사유 문자열. signal 이 끊기면 그 자리에서 실패로 돌려준다 */
export type Ask = (body: string, signal?: AbortSignal) => Promise<Finding[] | string>;

// 실패 사유는 화면 「개정 사유」 칸에 그대로 보이므로 사람이 읽는 말로 바꾼다
const WHY: Record<string, string> = {
  TimeoutError: '응답 시간 초과', AbortError: '응답 시간 초과', http_429: 'AI 요청 혼잡', http_529: 'AI 요청 혼잡',
  refusal: 'AI 응답 거절', max_tokens: '응답이 잘림', parse_failed: '응답 해석 실패', SyntaxError: '응답 해석 실패',
};
const why = (code: string) => WHY[code] ?? (code.startsWith('http_5') ? 'AI 서버 오류' : '점검 오류');

export const RESULTS: Result[] = ['문제없음', '현행 수정 필요', '시행 예정', '회사 선택', '추가 확인'];
const RESULT_RANK: Record<Result, number> = { '현행 수정 필요': 0, '시행 예정': 1, '회사 선택': 2, '추가 확인': 3, 문제없음: 4 };
// 비교 불가는 해당 없음보다 무겁다 — 대조하지 못한 것이 「불리하지 않다」로 합쳐지면 안 된다
const DISADV_RANK: Record<Disadvantage, number> = { 해당: 0, '확인 필요': 1, '비교 불가': 2, '해당 없음': 3 };

export const BATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['no', 'result', 'disadvantage', 'reason', 'basis', 'ops_note', 'proposed_text'],
        properties: {
          no: { type: 'string' },
          result: { type: 'string', enum: RESULTS },
          disadvantage: { type: 'string', enum: DISADVANTAGES },
          reason: { type: 'string' },
          basis: { type: 'string' },
          ops_note: { type: 'string' },
          proposed_text: { type: 'string' },
        },
      },
    },
  },
} as const;

export function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function forceEscalate(drops: Drop[], hits: RuleHit[]): boolean {
  return drops.length > 0 || hits.some((h) => h.status !== '반영됨');
}

function payload(p: ArticlePair, drops: Drop[], hits: RuleHit[]) {
  return {
    조문: p.no,
    종전: p.old?.body ?? '',
    개정안: p.new?.body ?? '',
    '수치 하락': drops.map((d) => ({ 단위: d.unit, 종전: d.oldMax, 개정안: d.newMax })),
    '관련 법령 기준': hits.map((h) => ({
      법령조문: h.lawArticle, 원문: h.source ?? null, 원문상태: h.source ? '저장소 공식자료 연결(최신성·적용 확인 필요)' : '원문 없음 — 추가 확인',
      항목: h.topic, 상태: h.status, 시행일: `${h.effective.slice(0, 4)}-${h.effective.slice(4, 6)}-${h.effective.slice(6, 8)}`,
    })),
  };
}

export function body(group: ArticlePair[], drops: Map<string, Drop[]>, hits: Map<string, RuleHit[]>, headcount: string, focus = '', since = '', asOf = ''): string {
  return JSON.stringify({
    '법령 대조 시작일': since, '점검 기준일': asOf,
    '사업장 상시 인원': headcount, // 위원회 정족수·재심 인원을 규모로 보라고 했으니 규모를 준다
    '점검 요청': focus, // 사용자가 보고 싶거나 넣고 싶다고 적은 내용
    조문들: group.map((p) => payload(p, drops.get(p.no) ?? [], hits.get(p.no) ?? [])),
    '반드시 살필 조문': group
      .filter((p) => p.new === null || forceEscalate(drops.get(p.no) ?? [], hits.get(p.no) ?? []))
      .map((p) => p.no),
  });
}

/** 여러 회차의 답을 하나로 — 한 번이라도 지적되면 남기고, 결과·불이익변경은 더 무거운 쪽을 쓴다. */
export function merge(found: Finding[]): Finding {
  const flagged = found.filter((f) => f.result !== '문제없음');
  const pool = flagged.length ? flagged : found;
  const best = pool.reduce((a, f) => (RESULT_RANK[f.result] < RESULT_RANK[a.result] ? f : a));
  const worst = found.reduce((a, f) => (DISADV_RANK[f.disadvantage] < DISADV_RANK[a] ? f.disadvantage : a), found[0].disadvantage);
  const incomplete = found.some((f) => f.incomplete);
  const conflict = new Set(found.filter((f) => !f.incomplete).map((f) => `${f.result}/${f.disadvantage}`)).size > 1;
  const notes = [...new Set(found.map((f) => f.ops_note).filter(Boolean))];
  if (incomplete) notes.push('검토 미완료 — 일부 회차 실패 또는 조문 응답 누락: ' + [...new Set(found.filter((f) => f.incomplete).map((f) => f.reason))].join(' / '));
  if (conflict) notes.push('회차 의견 충돌 — ' + found.filter((f) => !f.incomplete).map((f) => `${f.result}/${f.disadvantage}: ${f.reason}${f.basis ? ` · AI 인용(미검증): ${f.basis}` : ''}`).join(' ↔ '));
  return { ...best, disadvantage: incomplete && worst === '해당 없음' ? '확인 필요' : worst,
    ...(incomplete ? { incomplete: true, unanswered: found.every((f) => f.incomplete) } : {}), ...(conflict ? { conflict: true } : {}), ops_note: notes.join(' · ') };
}

export const FAILED_PREFIX = '판단 실패: ';

export function failed(no: string, code: string): Finding {
  return { no, result: '추가 확인', disadvantage: '확인 필요', incomplete: true, reason: FAILED_PREFIX + why(code), basis: '', ops_note: '', proposed_text: '' };
}

async function pool<T, R>(items: T[], workers: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, run));
  return out;
}

/** 문제없음이 아닌 조문만 돌려준다. 회차가 여럿이면 한 번이라도 지적된 조문을 남긴다(합집합).
 *  어느 회차도 답하지 않은 조문은 한 번 더 묻고, 그래도 없으면 「추가 확인」. */
export async function judgeAll(
  pairs: ArticlePair[], drops: Map<string, Drop[]>, hits: Map<string, RuleHit[]>,
  opts: { ask: Ask; size?: number; runs?: number; workers?: number; headcount?: string; focus?: string; since?: string; asOf?: string; signal?: AbortSignal },
): Promise<Map<string, Finding>> {
  const { ask, size = BATCH_SIZE, runs = BATCH_RUNS, workers = 8, headcount = '', focus = '', since = '', asOf = '', signal } = opts;
  const hasOld = pairs.some((p) => p.old !== null);
  const groups = chunks(pairs, size);
  const jobs = Array.from({ length: runs }, (_, k) => groups.map((_, gi) => [k, gi] as const)).flat();
  const got = await pool(jobs, workers, ([, gi]) => ask(body(groups[gi], drops, hits, headcount, focus, since, asOf), signal));
  const found = groups.map((group, gi) => {
    const m = new Map<string, Finding[]>();
    for (const [i, j] of jobs.entries()) {
      if (j[1] !== gi) continue;
      const a = got[i];
      for (const p of group) {
        const answers = typeof a === 'string' ? [] : a.filter((f) => f.no === p.no);
        const f = answers.length === 1 ? answers[0] : failed(p.no, typeof a === 'string' ? a : 'parse_failed');
        m.set(p.no, [...(m.get(p.no) ?? []), f]);
      }
    }
    const fails = jobs.flatMap((j, i) => (j[1] === gi && typeof got[i] === 'string' ? [got[i] as string] : []));
    return { group, m, code: fails[0] ?? '묶음 답에서 빠짐' };
  });
  // 어느 회차도 답하지 않은 조문만 한 번 더 묻는다 — 묶음별로 동시에, 같은 시간 상한 안에서
  const retry = signal?.aborted ? [] : found.filter((g) => g.group.some((p) => !g.m.get(p.no)?.some((f) => !f.incomplete))); // 시간이 다 됐으면 재질문하지 않는다
  const again = await pool(retry, workers, (g) => ask(body(g.group.filter((p) => !g.m.get(p.no)?.some((f) => !f.incomplete)), drops, hits, headcount, focus, since, asOf), signal));
  retry.forEach((g, i) => {
    const a = again[i];
    for (const p of g.group.filter((p) => !g.m.get(p.no)?.some((f) => !f.incomplete))) {
      const answers = typeof a === 'string' ? [] : a.filter((f) => f.no === p.no);
      const f = answers.length === 1 ? answers[0] : failed(p.no, typeof a === 'string' ? a : 'parse_failed');
      g.m.set(p.no, [...(g.m.get(p.no) ?? []), f]);
    }
  });
  const out = new Map<string, Finding>();
  for (const { group, m, code } of found) {
    for (const p of group) {
      const fs = m.get(p.no);
      if (!fs) out.set(p.no, failed(p.no, code));
      else {
        const f = merge(fs);
        if (f.result !== '문제없음' || f.conflict || f.incomplete || f.disadvantage === '해당' || f.disadvantage === '확인 필요' || (hasOld && f.disadvantage === '비교 불가')) out.set(p.no, f);
      }
    }
  }
  return out;
}

export function validFinding(f: unknown): f is Finding {
  if (!f || typeof f !== 'object') return false;
  const v = f as Record<string, unknown>;
  return Object.keys(v).every((k) => ['no', 'result', 'disadvantage', 'reason', 'basis', 'ops_note', 'proposed_text'].includes(k)) && RESULTS.includes(v.result as Result) && DISADVANTAGES.includes(v.disadvantage as Disadvantage)
    && ['no', 'reason', 'basis', 'ops_note', 'proposed_text'].every((k) => typeof v[k] === 'string');
}

const PRICE = { input: 2.0, output: 10.0, cacheRead: 0.1 }; // claude-sonnet-5-5, 백만 토큰당 달러

export function usd(u: Usage): number {
  return (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + u.cache_read_input_tokens * PRICE.cacheRead
    + u.cache_creation_input_tokens * PRICE.input * 1.25) / 1e6;
}

/** Anthropic Messages API 로 묻는 Ask. 사용량은 usage 에 더한다. 본문·응답을 로그에 남기지 않는다. */
export function anthropicAsk(opts: {
  apiKey: string; model?: string; effort?: string; timeoutMs?: number; usage: Usage; accounting?: Accounting; fetchImpl?: typeof fetch;
}): Ask {
  const { apiKey, model = 'claude-sonnet-5-5', effort = 'medium', timeoutMs = 120_000, usage, fetchImpl = fetch } = opts;
  const request = (content: string, signal?: AbortSignal) => {
    if (opts.accounting) opts.accounting.attempts++;
    return fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 16000,
      output_config: { effort, format: { type: 'json_schema', schema: BATCH_SCHEMA } },
      system: [{ type: 'text', text: BATCH_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    }),
    // 호출마다의 상한과 요청 전체의 상한 중 먼저 오는 쪽에서 끊는다
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
  };
  const read = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (data.usage && ['input_tokens', 'output_tokens'].every((k) => Number.isFinite(data.usage[k]) && data.usage[k] >= 0) && opts.accounting) opts.accounting.responsesWithUsage++;
    for (const k of Object.keys(usage) as (keyof Usage)[]) {
      const n = Number(data.usage?.[k] ?? 0);
      if (Number.isFinite(n) && n >= 0) usage[k] += n;
    }
    return data;
  };
  return async (content, signal) => {
    try {
      let res = await request(content, signal);
      let data = await read(res);
      if ((res.status === 429 || res.status === 529) && !signal?.aborted) { // 동시에 여러 묶음을 보내므로 혼잡이면 한 번만 쉬었다 다시
        await new Promise((r) => setTimeout(r, 2000));
        res = await request(content, signal);
        data = await read(res);
      }
      if (!res.ok) return `http_${res.status}`;

      if (data.stop_reason === 'refusal' || data.stop_reason === 'max_tokens') return data.stop_reason;
      const text = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed?.findings) && parsed.findings.every(validFinding) ? (parsed.findings as Finding[]) : 'parse_failed';
    } catch (e) {
      return e instanceof Error ? e.name : 'error';
    }
  };
}
