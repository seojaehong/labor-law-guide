import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ordinaryTables, ordinaryMarkdown, ordinaryQuote, ordinaryFootnote } from './ordinary-fixture-data.mjs';
import { tables } from './fixture-data.mjs';
import { createFixtureServer } from './fixture-server.mjs';

test('original stress fixture is byte-identical to original capture provenance', async () => {
  const bytes = await readFile(new URL('./fixture-data.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '5307d265ef2efc4fec42bb73a685ad74f78b9190ee301dfe2557b0fc8ff13911');
});
test('ordinary fixtures retain ordinary probes and omit artificial stressors', () => {
  for (const name of ['blog_articles', 'cases', 'molab_interpretations', 'nlrc_decisions']) {
    const row = ordinaryTables[name][0];
    const text = JSON.stringify(row);
    assert.match(text, /한글 측정 문단/); assert.match(text, /Mixed layout/);
    assert.doesNotMatch(text, /전각한글측정|readable-layout-|ABCDEFGHIJ|LONG_CODE_TOKEN_|min-width:60rem|긴 문자열과 표/);
    assert.equal(row.id, tables[name][0].id);
  }
  assert.match(tables.blog_articles[0].content, /전각한글측정/);
});
test('ordinary Markdown has a short quote, normal table, and real GFM footnote syntax', () => {
  assert.ok(ordinaryMarkdown.includes(`> ${ordinaryQuote}`));
  assert.ok(ordinaryMarkdown.includes('[^layout-note]'));
  assert.ok(ordinaryMarkdown.includes(`[^layout-note]: ${ordinaryFootnote}`));
  assert.match(ordinaryMarkdown, /\| 근로조건 \|/);
});
test('fixture server explicitly selects ordinary data without changing stress defaults', async () => {
  const server = createFixtureServer(ordinaryTables);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/rest/v1/blog_articles?slug=eq.news-20261003-01`);
    const rows = await response.json();
    assert.equal(rows[0].content, ordinaryMarkdown);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
