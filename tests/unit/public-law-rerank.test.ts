import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('server-only', () => ({}));
import { preparePublicLawRequest, publicLawConcepts, rerankPublicLaws } from '@/lib/chat/context/public-law-rerank';
import { buildLawsContext } from '@/lib/chat/context/laws';
import { toLexQuery } from '@/lib/chat/context/lex-query';
import law from '../../public/data/laws/001872.json';
import official from '../../data/public-law-rerank/official-articles.json';

const changes = law.steps.flatMap((step) => step.changes);
const eligible = changes.filter((change) => /^제[1-9]\d*조(?:의[1-9]\d*)?$/.test(change.article) && change.after && change.after.length > 130 && change.after.length < 1200);
const rows = eligible.slice(0, 4).map((change) => ({
  law_name: law.name, article_label: change.article, article_title: change.title,
  body: change.after, effective_date: '2026-01-01', score: 1, matched: 1, law_kind: '법률',
}));
const send = vi.fn();
const response = (pick: unknown) => new Response(JSON.stringify({ answers: { pick } }));
const success = (count = rows.length, index = 2) => ({ probabilities: Object.fromEntries([
  ['none', 0], ...Array.from({ length: count }, (_, i) => [String(i + 1), i === index ? 1 : 0]),
]) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', send);
  vi.stubEnv('TYPESAFE_API_KEY', 'fixture-placeholder');
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'true');
  vi.stubEnv('TYPESAFE_JEV_ON', 'false'); vi.stubEnv('TYPESAFE_JEV_CHAT_ON', 'false');
  vi.stubEnv('JEV_ON', 'true');
  send.mockImplementation(async () => response(success()));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('promotes one verified public row, preserves every original row and makes exactly one bounded call', async () => {
  expect(rows).toHaveLength(4);
  const result = await rerankPublicLaws('연차', rows);
  expect(result).toEqual([rows[2], rows[0], rows[1], rows[3]]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
  expect(send.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' });
  expect(send.mock.calls[0][1].signal.aborted).toBe(true);
});
it.each(['flag-missing', 'flag-false', 'key-missing', 'irrelevant', 'empty', 'single'])('%s makes zero calls', async (mode) => {
  if (mode.startsWith('flag')) vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', mode === 'flag-false' ? 'false' : '');
  if (mode === 'key-missing') vi.stubEnv('TYPESAFE_API_KEY', '');
  const input = mode === 'empty' ? [] : mode === 'single' ? rows.slice(0, 1) : rows;
  expect(await rerankPublicLaws(mode === 'irrelevant' ? 'weather football' : '연차', input)).toBe(input);
  expect(send).not.toHaveBeenCalled();
});
it('never forwards canary names, contacts, dialogue or arbitrary extra fields', async () => {
  const privateRows = rows.map((r) => ({ ...r, question: 'FAQ_PRIVATE_CANARY', answer: 'CASE_PRIVATE_CANARY', email: 'row@private.invalid' }));
  await rerankPublicLaws('PRIVATE_PERSON_CANARY private@invalid.test 010-9876-5432 대화 비밀 연차', privateRows);
  const payload = send.mock.calls[0][1].body;
  for (const canary of ['PRIVATE_PERSON_CANARY', 'private@invalid.test', '010-9876-5432', '대화 비밀', 'FAQ_PRIVATE_CANARY', 'CASE_PRIVATE_CANARY', 'row@private.invalid']) expect(payload).not.toContain(canary);
  expect(JSON.parse(payload).state).toBe('공개 법령 검색 개념: 연차 유급휴가');
});
it.each(['body', 'law_name', 'article_label', 'article_title'])('modified/unverified public %s fails closed before transport', async (field) => {
  const input = [{ ...rows[0], [field]: 'PRIVATE_CANARY' }, ...rows.slice(1)];
  expect(await rerankPublicLaws('연차', input)).toBe(input); expect(send).not.toHaveBeenCalled();
});
it('FAQ and case objects cannot enter the public-law transport even with global/chat flags enabled', async () => {
  vi.stubEnv('TYPESAFE_JEV_ON', 'true'); vi.stubEnv('TYPESAFE_JEV_CHAT_ON', 'true');
  const input = [{ question: 'FAQ_CANARY', answer: 'CASE_CANARY' }, { question: 'FAQ2' }];
  // Runtime boundary is deliberately tested with untyped third-party input.
  expect(await rerankPublicLaws('연차', input as unknown as typeof rows)).toBe(input); expect(send).not.toHaveBeenCalled();
});
it('independent first-five-token regression: local lexical loss remains, public concept extraction sees the suffix', async () => {
  const query = '첫번째 두번째 세번째 네번째 다섯번째 연차';
  expect(toLexQuery(query)).not.toContain('연차');
  expect(publicLawConcepts(query)).toBe('연차 유급휴가');
  await rerankPublicLaws(query, rows);
  expect(JSON.parse(send.mock.calls[0][1].body).state).toContain('연차');
});
it('independent 120-character regression: complete verified body including the tail is transmitted', async () => {
  await rerankPublicLaws('연차', rows);
  const criterion = JSON.parse(JSON.parse(send.mock.calls[0][1].body).questions.pick.criteria['1']);
  const complete = rows[0].body.replace(/\s+/g, ' ').trim();
  expect(complete.length).toBeGreaterThan(120);
  expect(criterion.body).toBe(complete); expect(criterion.body).toContain(complete.slice(-40));
});
it('independent rank-33 regression: 33rd row is preserved but is not presented or recoverable by reranking', async () => {
  const short = changes.filter((c) => /^제[1-9]\d*조(?:의[1-9]\d*)?$/.test(c.article) && c.after).sort((a, b) => a.after.length - b.after.length)[0];
  const input = Array.from({ length: 33 }, (_, i) => ({ ...rows[0], article_label: short.article, article_title: short.title, body: short.after, ordinal: i + 1 }));
  send.mockImplementation(async () => response(success(32, 31)));
  const result = await rerankPublicLaws('연차', input);
  expect(result).toHaveLength(33); expect(result[0]).toBe(input[31]); expect(result[32]).toBe(input[32]);
  expect(Object.keys(JSON.parse(send.mock.calls[0][1].body).questions.pick.criteria)).toHaveLength(33);
  expect(JSON.parse(send.mock.calls[0][1].body).questions.pick.criteria['33']).toBeUndefined();
});
it.each([
  { choice: 'none', ...success() }, { probabilities: { none: 1, '1': 0, '2': 0, '3': 0, '4': 0 } },
  { probabilities: { none: 0, '1': 0.5, '2': 0.5, '3': 0, '4': 0 } },
  { probabilities: { '3': 1 } }, { choice: '3', confidence: 1 },
  { probabilities: { none: 0, '01': 1, '2': 0, '3': 0, '4': 0 } },
  { probabilities: { none: 0, '1': 0, '2': 0, '3': 2, '4': 0 } },
  { probabilities: { none: 0, '1': 0, '2': 0, '3': -1, '4': 0 } },
  { probabilities: { none: 0, '1': 0, '2': 0, '3': '1', '4': 0 } },
  { probabilities: { none: 0, '1': 0, '2': 0, '3': null, '4': 0 } },
  { choice: '33', ...success() }, { choice: '2', ...success() },
  { confidence: -1, ...success() }, { probabilities: [] }, {},
])('none/ties/partial/malformed probabilities safely preserve original order: %j', async (pick) => {
  send.mockImplementation(async () => response(pick));
  expect(await rerankPublicLaws('연차', rows)).toBe(rows); expect(send).toHaveBeenCalledTimes(1);
});
it.each(['http', 'throw', 'invalid-json', 'oversize-header', 'oversize-stream', 'invalid-utf8'])('%s fails safely without retries or sensitive logs', async (mode) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  send.mockImplementation(async () => {
    if (mode === 'throw') throw Error('PRIVATE_PROVIDER_CANARY');
    if (mode === 'http') return new Response('PRIVATE_PROVIDER_CANARY', { status: 429 });
    if (mode === 'oversize-header') return new Response('{}', { headers: { 'content-length': '16385' } });
    if (mode === 'oversize-stream') return new Response('x'.repeat(16385));
    if (mode === 'invalid-utf8') return new Response(new Uint8Array([0xff]));
    return new Response('PRIVATE_PROVIDER_CANARY');
  });
  expect(await rerankPublicLaws('연차', rows)).toBe(rows); expect(send).toHaveBeenCalledTimes(1);
  expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
it.each(['fetch', 'body'])('stalled %s reaches whole-operation timeout, aborts and releases timer', async (stage) => {
  vi.useFakeTimers();
  send.mockImplementation(stage === 'fetch' ? () => new Promise(() => {}) : async () => new Response(new ReadableStream({ pull: () => new Promise(() => {}) })));
  const pending = rerankPublicLaws('연차', rows);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toBe(rows); expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1].signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it('request byte/token upper bound is checked before any call; no body truncation or partial request', async () => {
  const source = JSON.parse(readFileSync('public/data/laws/002249.json', 'utf8')) as typeof law;
  const long = source.steps.flatMap((step) => step.changes).filter((c) => c.article === '제145조').sort((a, b) => b.after.length - a.after.length)[0];
  const input = Array.from({ length: 32 }, () => ({ ...rows[0], law_name: source.name, article_label: long.article, article_title: long.title, body: long.after }));
  expect(await rerankPublicLaws('연차', input)).toBe(input); expect(send).not.toHaveBeenCalled();
});
it('buildLawsContext integration keeps RPC60/final3 and does not call legacy reranker', async () => {
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  const result = await buildLawsContext({ rpc } as unknown as SupabaseClient, 'PRIVATE_NAME 연차');
  expect(rpc.mock.calls).toHaveLength(1);
  expect(vi.mocked(rpc).mock.calls[0]).toBeDefined();
  expect(result.rows).toBe(3); expect(result.status).toBe('ok');
  expect(result.ctx.indexOf(rows[2].body.replace(/\s+/g, ' ').trim())).toBeGreaterThan(-1);
  expect(send).toHaveBeenCalledTimes(1);
  const source = readFileSync('src/lib/chat/context/laws.ts', 'utf8');
  expect(source).not.toContain("from './jev'"); expect(source).toContain('max_results: RETRIEVE_K');
});
it('buildLawsContext default-off and none preserve the same first-three context', async () => {
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', '');
  const baseline = await buildLawsContext({ rpc } as unknown as SupabaseClient, '연차');
  expect(send).not.toHaveBeenCalled();
  vi.stubEnv('TYPESAFE_JEV_PUBLIC_LAWS_ON', 'true');
  send.mockImplementation(async () => response({ choice: 'none' }));
  expect(await buildLawsContext({ rpc } as unknown as SupabaseClient, '연차')).toEqual(baseline);
});

// Synthetic transport coverage only. This does not estimate live RPC corpus matches.
it('measures deterministic public-fixture budget coverage and fail-closed mismatch coverage', async () => {
  const pool: typeof rows = [];
  const seen = new Set<string>();
  for (const file of readdirSync('public/data/laws').sort()) {
    if (!/^\d{6}\.json$/.test(file)) continue;
    const entry = JSON.parse(readFileSync(`public/data/laws/${file}`, 'utf8')) as typeof law;
    for (const step of entry.steps) for (const change of step.changes) {
      if (!/^제[1-9]\d*조(?:의[1-9]\d*)?$/.test(change.article)) continue;
      for (const body of [change.before, change.after]) {
        if (typeof body !== 'string' || !body.trim()) continue;
        const key = JSON.stringify([entry.name, change.article, change.title || '', body.replace(/\s+/g, ' ').trim()]);
        if (seen.has(key)) continue;
        seen.add(key);
        pool.push({ ...rows[0], law_name: entry.name, article_label: change.article, article_title: change.title || '', body });
      }
    }
  }
  expect(pool).toHaveLength(2397);
  let seed = 614138;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const report: Array<Record<string, number>> = [];
  for (const count of [4, 8, 16, 32]) {
    let called = 0;
    for (let trial = 0; trial < 100; trial++) {
      const candidates = Array.from({ length: count }, () => pool[Math.floor(random() * pool.length)]);
      send.mockClear(); send.mockImplementation(async () => response({ choice: 'none' }));
      expect(await rerankPublicLaws('연차', candidates)).toBe(candidates);
      called += send.mock.calls.length;
    }
    report.push({ candidates: count, trials: 100, eligibleCalls: called, budgetSkipped: 100 - called });
  }
  const short = [...pool].sort((a, b) => a.body.length - b.body.length).slice(0, 32);
  send.mockClear(); await rerankPublicLaws('연차', short);
  expect(send).toHaveBeenCalledTimes(1);
  const shortestBytes = Buffer.byteLength(send.mock.calls[0][1].body);
  for (let position = 0; position < 32; position++) {
    const candidates = short.map((row, i) => i === position ? { ...row, body: row.body + ' UNVERIFIED_CANARY' } : row);
    send.mockClear(); expect(await rerankPublicLaws('연차', candidates)).toBe(candidates);
    expect(send).not.toHaveBeenCalled();
  }
  console.log('SYNTHETIC_TRANSPORT_COVERAGE', JSON.stringify({ seed: 614138, publicVariants: pool.length, report, shortest32Bytes: shortestBytes, oneMismatchTrials: 32, oneMismatchSkipped: 32, liveCoverage: 'not measured' }));
});

it('public provenance is not a currency check: effective date does not change eligibility or transmitted fields', async () => {
  const historical = rows.map((row) => ({ ...row, effective_date: '1900-01-01' }));
  await rerankPublicLaws('연차', historical);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1].body).not.toContain('1900-01-01');
  expect(JSON.parse(JSON.parse(send.mock.calls[0][1].body).questions.pick.criteria['1'])).not.toHaveProperty('effective_date');
});

const officialRows = official.articles.map((article) => ({ ...rows[0], law_name: article.lawName, article_label: article.article, article_title: article.title, body: article.body, effective_date: article.effectiveDate }));
const seven = [
  ['해고 예고를 적어도 30일 전에 해야 한다는 직접 근거 조문은?', '제26조', '적어도 30일 전에'],
  ['해고 29일 전에만 예고한 경우 통상임금 30일분 지급 원칙의 직접 근거 조문은?', '제26조', '30일분 이상의 통상임금'],
  ['임금을 근로자에게 직접 전액 통화로 지급하는 원칙의 직접 근거 조문은?', '제43조', '통화(通貨)로 직접 근로자에게 그 전액'],
  ['매월 1회 이상 정해진 날에 임금을 지급하는 원칙의 직접 근거 조문은?', '제43조', '매월 1회 이상 일정한 날짜'],
  ['퇴직 후 14일 이내에 임금과 금품을 청산하는 직접 근거 조문은?', '제36조', '14일 이내에'],
  ['퇴직 금품 청산에서 특별한 사정이 있을 때 당사자 합의로 지급 기일을 연장하는 직접 근거 조문은?', '제36조', '당사자 사이의 합의에 의하여 기일을 연장'],
  ['산재 요양 승인 신청 절차를 직접 규정하는 근거가 이 후보들에 있는가?', 'none', ''],
];
it.each(seven)('offline public-source excerpt retains the expected evidence: %s', (query, gold, clue) => {
  // These are newly verified official texts, NOT the user's original API payload.
  // Force the bounded excerpt path with 29 additional verified public candidates.
  const input = [...officialRows, ...Array.from({ length: 29 }, () => rows[0])];
  const payload = preparePublicLawRequest(query, input);
  expect(payload).not.toBeNull(); expect(Buffer.byteLength(payload!)).toBeLessThanOrEqual(32000);
  const criteria = JSON.parse(payload!).questions.pick.criteria;
  expect(Object.keys(criteria)).toHaveLength(33);
  expect(criteria.none).toBeDefined();
  const candidates = officialRows.map((_, i) => JSON.parse(criteria[String(i + 1)]));
  expect(candidates.every((c) => c.excerpt === true)).toBe(true);
  if (gold === 'none') {
    for (const candidate of candidates) expect(candidate.body).not.toMatch(/요양|승인 신청/);
  } else {
    const selected = candidates.find((c) => c.article === gold)!;
    expect(selected.body).toContain(clue);
    expect(selected.body).toContain('다만');
    if (gold === '제26조') {
      expect(selected.body).toContain('3개월 미만');
      expect(selected.body).toContain('천재ㆍ사변');
      expect(selected.body).toContain('고용노동부령으로 정하는 사유');
    }
    if (clue.includes('매월')) expect(selected.body).toContain('그러하지 아니하다');
  }
  expect(send).not.toHaveBeenCalled();
});
it('verifies entire public text before excerpting; a private suffix cannot hide outside the selected excerpt', () => {
  const input = [...officialRows, ...Array.from({ length: 29 }, () => rows[0])];
  input[0] = { ...input[0], body: input[0].body + ' PRIVATE_SUFFIX_CANARY' };
  expect(preparePublicLawRequest('해고 예고', input)).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it.each(['before', 'after'] as const)('numbered-item match retains governing effect and basis or skips: public 000128 article 10 %s', (version) => {
  const source = JSON.parse(readFileSync('public/data/laws/000128.json', 'utf8')) as typeof law;
  const article = source.steps.flatMap((step) => step.changes).find((change) => change.article === '제10조')!;
  const row = { ...rows[0], law_name: source.name, article_label: article.article, article_title: article.title, body: article[version] };
  // The formerly misleading item-only excerpt fitted; preserving the governing
  // rule for all 32 copies must instead exceed the fixed budget and abstain.
  expect(preparePublicLawRequest('임금', Array.from({ length: 32 }, () => row))).toBeNull();
  const mixed = preparePublicLawRequest('임금', [row, ...Array.from({ length: 31 }, () => rows[0])]);
  expect(mixed).not.toBeNull();
  if (mixed !== null) {
    const criterion = JSON.parse(JSON.parse(mixed).questions.pick.criteria['1']);
    expect(criterion.body).toContain('부담금을 경감할 수 있다');
    expect(criterion.body).toContain('그 경감기준은 고용노동부장관이 위원회의 심의를 거쳐 정한다');
    expect(criterion.body).toContain('퇴직금을 미리 정산하여 지급한 사업주');
  }
  expect(send).not.toHaveBeenCalled();
});
