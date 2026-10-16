import 'server-only';
import { createHash } from 'node:crypto';
import manifest from './public-law-manifest.json';

/** This separate path never accepts FAQ, case text or an arbitrary provider prompt.
 * Exact hashes bind name, article, title and complete body to published repository
 * law JSON and dated official snapshots. Unknown/modified text fails closed.
 * Historical public text may match: this proves publicity, NOT legal currency.
 */
type Law = { law_name: string; article_label: string; article_title: string | null; body: string | null };
const PUBLIC_TEXT: Readonly<Record<string, string>> = manifest;
const MAX_CANDIDATES = 32;
const MAX_REQUEST_BYTES = 32_000;
// UTF-8 byte count is a conservative token upper bound, not a tokenizer estimate.
const MAX_REQUEST_TOKENS_UPPER_BOUND = 32_000;
const MAX_RESPONSE_BYTES = 16_384;
const TIMEOUT_MS = 2500;
const MIN_PROBABILITY = 0.12;
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// Match across the entire input, emit only these literal, public legal concepts.
// This is deliberately not toLexQuery: that helper can preserve personal text.
const TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/근로기준법/, '근로기준법'], [/산업안전보건법|산안법/, '산업안전보건법'],
  [/노조법|노동조합/, '노동조합 노동관계조정법'], [/퇴직금|퇴직급여/, '퇴직급여 퇴직금'],
  [/평균임금/, '평균임금'], [/통상임금/, '통상임금'], [/연차|유급휴가/, '연차 유급휴가'],
  [/주휴|유급휴일/, '유급휴일'], [/체불|금품청산/, '임금 지급 금품 청산'],
  [/최저임금|최저시급/, '최저임금'], [/해고/, '해고'], [/예고/, '해고 예고'],
  [/부당해고/, '해고 제한 구제신청'], [/정리해고/, '경영상 이유 해고'],
  [/이행강제금/, '이행강제금'], [/괴롭힘/, '직장 내 괴롭힘'],
  [/성희롱/, '직장 내 성희롱'], [/신고|조사/, '신고 조사 조치'],
  [/벌칙|처벌/, '벌칙'], [/안전|보건/, '안전조치 보건조치'],
  [/배우자.*출산|출산.*배우자/, '배우자 출산휴가'], [/출산휴가|출산전후/, '출산전후휴가'],
  [/육아휴직/, '육아휴직'], [/근로시간|52시간/, '근로시간 연장 근로 제한'],
  [/연장근로|야간|가산수당/, '연장 야간 휴일 근로 가산임금'],
  [/근로계약|근로조건/, '근로조건 명시'], [/단시간|시간단축/, '단시간 근로시간 단축'],
  [/수습/, '수습'], [/취업규칙/, '취업규칙'],
  [/임금/, '임금 지급'], [/전액|통화/, '직접 전액 통화'],
  [/매월|정해진 날|일정한 날짜/, '매월 임금 지급'], [/금품|청산/, '금품 청산'],
  [/합의|기일|특별한 사정/, '당사자 합의 지급 기일 연장'],
  [/산재|요양/, '산업재해 요양 승인 신청 절차'],
];

export function publicLawConcepts(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 20_000) return '';
  return TERMS.filter(([pattern]) => pattern.test(raw)).map(([, literal]) => literal).join(' / ');
}

function verifiedCriterion(row: Law): string | null {
  if (typeof row?.law_name !== 'string' || typeof row.article_label !== 'string' ||
      (row.article_title !== null && typeof row.article_title !== 'string') ||
      typeof row.body !== 'string' || row.body.length > MAX_REQUEST_BYTES) return null;
  const body = row.body.replace(/\s+/g, ' ').trim();
  const fields = [row.law_name, row.article_label, row.article_title || '', body];
  const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const id = PUBLIC_TEXT[hash];
  if (!id || !/^\d{6}$/.test(id)) return null;
  return JSON.stringify({ lawId: id, lawName: fields[0], article: fields[1], title: fields[2], body });
}

/** Operates only on a criterion already verified against the COMPLETE public
 * body. Never summarize, synthesize legal text, or cut a sentence mid-clause.
 * A selected principle keeps immediately following exception/qualification text.
 * An enumerated condition is kept with the rest of its numbered paragraph.
 */
function excerptCriterion(verified: string, concepts: string): string | null {
  const article = JSON.parse(verified) as { lawId: string; lawName: string; article: string; title: string; body: string };
  const sentences = article.body.split(/(?<=다\.)\s+/);
  const words = [...new Set(concepts.split(/[\s/]+/).filter((word) => word.length >= 2))];
  const score = (sentence: string) => words.reduce((total, word) => total + (sentence.includes(word) ? 1 : 0), 0);
  let best = 0;
  for (let i = 1; i < sentences.length; i++) if (score(sentences[i]) > score(sentences[best])) best = i;
  const introduction = /다음 각 (?:호|목)|각 (?:호|목)의 어느 하나/;
  const paragraphStart = /^(?:<[^>]*>\s*)*[①-⑳]/;
  // A matching numbered item is not a standalone rule. Walk back to its
  // governing introduction within the same paragraph, retaining intervening
  // legal effect/qualification sentences. Ambiguous structure keeps FULL text.
  const withoutAmendments = sentences[best].replace(/<[^>]*>/g, '');
  if (/(?:^|\s)(?:[1-9]\d*\.|[가-힣]\.)\s*/.test(withoutAmendments)) {
    let anchor = -1;
    for (let i = best; i >= 0; i--) {
      if (introduction.test(sentences[i])) { anchor = i; break; }
      if (paragraphStart.test(sentences[i])) break;
    }
    if (anchor < 0) return verified;
    best = anchor;
  }
  // If a qualification is the best match, include its preceding principle too.
  const qualification = (text: string) => /^(?:<[^>]*>\s*)*(?:다만|그러나|이 경우|단,)/.test(text);
  while (best > 0 && qualification(sentences[best])) best--;
  let end = best + 1;
  while (end < sentences.length && qualification(sentences[end])) end++;
  // Do not detach an enumerated test from the conditions it introduces.
  if (introduction.test(sentences.slice(best, end).join(' '))) {
    while (end < sentences.length && !paragraphStart.test(sentences[end])) end++;
  }
  const excerpt = sentences.slice(best, end).join(' ');
  if (!excerpt || !article.body.includes(excerpt)) return null;
  return JSON.stringify({
    ...article, body: excerpt,
    excerpt: true,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  if (!response.ok || !response.body) throw Error('response');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw Error('response-size');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw Error('response-size');
      chunks.push(chunk.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    // Do not await cancel: a hostile/hung stream must not prolong our deadline.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(merged));
}

function selectedIndex(body: unknown, count: number): number | null {
  if (!record(body) || !record(body.answers) || !record(body.answers.pick)) return null;
  const answer = body.answers.pick;
  const expected = ['none', ...Array.from({ length: count }, (_, i) => String(i + 1))];
  if (answer.choice !== undefined && (typeof answer.choice !== 'string' || !expected.includes(answer.choice))) return null;
  if (answer.confidence !== undefined && (typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)) return null;
  if (answer.choice === 'none' || !record(answer.probabilities)) return null;
  const probabilities = answer.probabilities;
  // Partial scores, aliases (01), unknown IDs and ties are abstentions.
  if (Object.keys(probabilities).length !== expected.length || !expected.every((id) => Object.hasOwn(probabilities, id))) return null;
  const values = expected.map((id) => probabilities[id]);
  if (!values.every((p): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)) return null;
  if (Math.abs(values.reduce((sum, p) => sum + p, 0) - 1) > 0.02) return null;
  const top = Math.max(...values);
  const winners = values.flatMap((p, i) => Math.abs(p - top) < 1e-9 ? [i] : []);
  if (top < MIN_PROBABILITY || winners.length !== 1 || winners[0] === 0) return null;
  const winner = expected[winners[0]];
  if (answer.choice !== undefined && answer.choice !== winner) return null;
  return Number(winner) - 1;
}

/** Pure, no-network request preparation. Full public provenance is verified
 * before any excerpt is selected; useful for offline fixture audits. */
export function preparePublicLawRequest(raw: string, rows: Law[]): string | null {
  if (rows.length < 2) return null;
  const concepts = publicLawConcepts(raw);
  if (!concepts) return null;
  const candidates = rows.slice(0, MAX_CANDIDATES);
  const criteria: Record<string, string> = { none: '어느 조문도 직접 답하지 않음' };
  for (let i = 0; i < candidates.length; i++) {
    const criterion = verifiedCriterion(candidates[i]);
    if (!criterion) return null;
    criteria[String(i + 1)] = criterion;
  }
  const serialize = (choices: Record<string, string>) => JSON.stringify({
    model: 'jev-1.13.0', state: `공개 법령 검색 개념: ${concepts}`,
    questions: { pick: { type: 'choice', question: '제시된 공개 본문에 직접 근거가 확인되는 조문을 고르세요. 발췌의 생략 내용을 추측하지 마세요. 없거나 불충분하면 none.', criteria: choices } },
  });
  const withinBudget = (value: string) => {
    const bytes = new TextEncoder().encode(value).byteLength;
    return bytes <= MAX_REQUEST_BYTES && bytes <= MAX_REQUEST_TOKENS_UPPER_BOUND;
  };
  let payload = serialize(criteria);
  if (!withinBudget(payload)) {
    // All full texts have been verified before selecting any excerpt. Keep every
    // candidate; never solve the budget problem by shrinking the candidate pool.
    const excerpts: Record<string, string> = { none: criteria.none };
    for (let i = 0; i < candidates.length; i++) {
      const excerpt = excerptCriterion(criteria[String(i + 1)], concepts);
      if (!excerpt) return null;
      excerpts[String(i + 1)] = excerpt;
    }
    payload = serialize(excerpts);
    if (!withinBudget(payload)) return null;
  }
  return payload;
}

/** At most one call; return every original row, with at most one promoted row.
 * The caller alone applies its existing final-N limit. None never removes results.
 * Public-only flag is independent of the legacy free-text/FAQ feature flags.
 */
export async function rerankPublicLaws<T extends Law>(raw: string, rows: T[]): Promise<T[]> {
  if (process.env.TYPESAFE_JEV_PUBLIC_LAWS_ON !== 'true' || !process.env.TYPESAFE_API_KEY || rows.length < 2) return rows;
  const payload = preparePublicLawRequest(raw, rows);
  if (!payload) return rows;
  const candidates = rows.slice(0, MAX_CANDIDATES);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = async () => {
      const response = await fetch(ENDPOINT, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      return selectedIndex(await boundedJson(response, controller.signal), candidates.length);
    };
    const index = await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error('timeout')); }, TIMEOUT_MS);
    })]);
    if (index === null || index === 0) return rows;
    return [rows[index], ...rows.filter((_, i) => i !== index)];
  } catch {
    // Deliberately omit provider bodies, query, rows, error.message and key.
    return rows;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
