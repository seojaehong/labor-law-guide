import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSsr, safeCss, snapshotHtml } from './static-snapshot.mjs';

test('preserves rendered text/geometry while stripping executable and outbound markup', () => {
  const result = inspectSsr('<html><head><link rel="stylesheet" href="/_next/static/css/app/layout.css"><script src="https://example.invalid/x.js"></script></head><body><main class="reading-main" style="width:38em"><p>한글 측정 문단</p><a href="https://example.invalid">link</a><form action="/api/contact"><input name="hello"><button onclick="fetch(1)">Send</button></form><img src="https://example.invalid/image"><script>SECRET_PAYLOAD</script><iframe src="https://example.invalid"></iframe></main></body></html>');
  assert.ok(result.body.includes('한글 측정 문단')); assert.ok(result.body.includes('width:38em'));
  assert.ok(!/SECRET_PAYLOAD|<script|<iframe|onclick|action=|src=|href=/i.test(result.body));
  assert.deepEqual(result.css, ['/_next/static/css/app/layout.css']);
});
test('refuses unresolved streamed suspense instead of guessing browser state', () => {
  assert.throws(() => inspectSsr('<body><template id="B:0"></template><div hidden id="S:0">content</div></body>'), /Suspense/);
});
test('materializes literal React stream placements without evaluating scripts', () => {
  const input = '<body><main><!--$?--><template id="B:0"></template><p>loading</p><!--/$--></main><div hidden id="S:0"><p>before</p><template id="P:1"></template></div><div hidden id="S:1"><p>한글 측정 문단</p></div><script>throw new Error("MUST NEVER EXECUTE");$RS("S:1","P:1");$RC("B:0","S:0")</script></body>';
  const result = inspectSsr(input);
  assert.equal(result.body, '<main><p>before</p><p>한글 측정 문단</p></main>');
  assert.equal(result.report.streamPlacements, 2);
});
test('preserves streamed table-cell placement in its real table context', () => {
  const result = inspectSsr('<body><table><tbody><tr><template id="P:2"></template></tr></tbody></table><table hidden><tbody><tr id="S:2"><td>wide cell</td></tr></tbody></table><script>$RS("S:2","P:2")</script></body>');
  assert.ok(result.body.includes('<table><tbody><tr><td>wide cell</td></tr></tbody></table>'));
  assert.ok(!result.body.includes('template')); assert.equal(result.report.streamPlacements, 1);
});
test('blocks CSS network resources and removes source map directives', () => {
  assert.throws(() => safeCss('@import "https://example.invalid";'), /import/);
  assert.throws(() => safeCss('x{background:url(https://example.invalid/x)}'), /resource/);
  assert.equal(safeCss('a{color:red}/*# sourceMappingURL=remote */'), 'a{color:red}');
  assert.ok(safeCss('a{background:url("data:image/svg+xml,a")}'));
});
test('snapshot explicitly blocks scripts, connections and form submissions', () => {
  const html = snapshotHtml({ body: '<p>synthetic</p>', stylesheets: ['../../assets/x.css'], title: 'Test', label: 'after' });
  assert.ok(html.includes("script-src 'none'")); assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'")); assert.ok(html.includes('data-qa-synthetic="true"'));
});
test('only inert same-document anchor fragments survive; base and outbound targets are removed', () => {
  const result = inspectSsr('<body><base href="https://example.invalid/"><a href="#note-1">note</a><a href="https://example.invalid/#note-1">remote</a><a href="//example.invalid/">remote</a><a href="javascript:alert(1)">script</a><a href="/elsewhere#note-1">route</a><li id="note-1">note text</li></body>');
  assert.ok(result.body.includes('href="#note-1"'));
  assert.equal((result.body.match(/href=/g) || []).length, 1);
  assert.doesNotMatch(result.body, /<base|https:|javascript:|\/elsewhere/);
});
test('footnote audit reports ref/backref and label identity before sanitization', () => {
  const result = inspectSsr('<body><p><a id="fnref-note" href="#fn-note" data-footnote-ref aria-describedby="footnote-label">1</a></p><h2 id="footnote-label">Footnotes</h2><li id="fn-note"><a href="#fnref-note" data-footnote-backref>↩</a></li></body>');
  assert.equal(result.report.footnotes.links.length, 2);
  assert.ok(result.report.footnotes.links.every(link => link.targetExists && link.descriptionTargetsExist));
  assert.deepEqual(result.report.footnotes.labelIds, ['footnote-label']);
});
