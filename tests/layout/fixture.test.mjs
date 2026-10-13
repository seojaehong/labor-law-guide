import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createFixtureServer, selectRows } from './fixture-server.mjs';
import { articles, cases, interpretations, decisions, fullwidthParagraph } from './fixture-data.mjs';

const server = createFixtureServer();
let base;
before(async () => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await once(server, 'close'); });

test('all synthetic detail records contain long Hangul and mixed probes', () => {
  for (const value of [articles[0].content, cases[0].summary, interpretations[0].inquiry_summary, decisions[0].holding_points]) {
    for (const probe of ['한글 측정 문단', '전각한글측정', 'Mixed layout']) assert.ok(value.includes(probe));
  }
  assert.match(fullwidthParagraph, /^[가-힣]{300,}$/);
  assert.ok(decisions[0].holding_points.includes('① 확인 사항'));
});
test('filters distinguish exact detail from related records', () => {
  assert.equal(selectRows(articles, new URLSearchParams('slug=eq.news-20261003-01')).rows.length, 1);
  const related = selectRows(articles, new URLSearchParams('slug=neq.news-20261003-01&limit=3'));
  assert.equal(related.rows.length, 3); assert.equal(related.count, 7);
  assert.ok(related.rows.every(row => row.slug !== 'news-20261003-01'));
});
test('single-object PostgREST response matches expected details', async () => {
  const response = await fetch(`${base}/rest/v1/blog_articles?slug=eq.news-20261003-01`, { headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).slug, 'news-20261003-01');
});
test('missing single record returns safe PostgREST not-found response', async () => {
  const response = await fetch(`${base}/rest/v1/cases?id=eq.missing`, { headers: { accept: 'application/vnd.pgrst.object+json' } });
  assert.equal(response.status, 406); assert.equal((await response.json()).code, 'PGRST116');
});
test('HEAD count and pagination agree', async () => {
  const response = await fetch(`${base}/rest/v1/nlrc_decisions?reason_category=cs.%7Bno_dismissal%7D&limit=20`, { method: 'HEAD' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-range'), '0-19/25');
  assert.equal(await response.text(), '');
});
test('only read-only search RPCs are accepted', async () => {
  const response = await fetch(`${base}/rest/v1/rpc/search_nlrc`, { method: 'POST', body: JSON.stringify({ page_offset: 20, result_limit: 20 }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).length, 5);
  assert.equal((await fetch(`${base}/rest/v1/rpc/arbitrary_mutation`, { method: 'POST', body: '{}' })).status, 404);
});
test('all mutation methods fail closed', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await fetch(`${base}/rest/v1/blog_articles`, { method, body: '{}' })).status, 405);
});
test('unknown tables and app API paths fail closed', async () => {
  for (const path of ['/rest/v1/not_a_table', '/api/chat', '/api/sanction', '/api/ask']) assert.equal((await fetch(base + path)).status, 404);
});
