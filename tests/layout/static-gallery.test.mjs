import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./static-gallery.js', import.meta.url), 'utf8');
function controller() {
  const context = vm.createContext({
    document: { getElementById: id => ({ id }) },
    location: { href: 'https://qa.example.test/__layout-review/', origin: 'https://qa.example.test' },
    requestAnimationFrame: callback => callback(), URL, Intl, setTimeout,
  });
  vm.runInContext(source.slice(0, source.indexOf("for (const control of controls) control.addEventListener('change'")), context);
  return context;
}
const rect = { x: 0, y: 0, width: 600, height: 100, right: 600, bottom: 100 };
function documentStub({ hiddenProbe = false } = {}) {
  const paragraph = { textContent: '전각한글측정', getClientRects: () => [], getBoundingClientRect: () => rect };
  const root = { getBoundingClientRect: () => rect, querySelectorAll: query => query === 'p' && hiddenProbe ? [paragraph] : [], clientWidth: 600, scrollWidth: 600 };
  const fonts = []; fonts.check = () => true; fonts.status = 'loaded'; fonts.load = async () => {}; fonts.ready = Promise.resolve();
  return { documentElement: { dataset: { qaSynthetic: 'true' }, style: {}, classList: { contains: () => false, toggle: () => {} }, clientWidth: 1440, scrollWidth: 1440 }, body: root, querySelector: query => query === 'aside' || query === '.reading-sidebar' ? null : root, fonts, addEventListener: () => {} };
}
test('ordinary measurements label the missing stress ruler instead of reporting 0 CPL', () => {
  const context = controller();
  context.doc = documentStub();
  context.frame = { id: 'after', contentDocument: context.doc, contentWindow: { innerWidth: 1440, innerHeight: 1000, getComputedStyle: () => ({ fontSize: '18px' }) } };
  vm.runInContext("manifest = { captureRevision: 'revision' }; result = measureDocument(frame, { path: '/blog/x', scope: 'main', snapshots: { ordinary: { after: 'ordinary-after/pages/blog-new.html' } } }, 'ordinary');", context);
  const ruler = context.result.measures.find(item => item.prefix === '전각한글측정');
  assert.equal(context.result.fixtureMode, 'ordinary');
  assert.equal(context.result.snapshotFile, 'ordinary-after/pages/blog-new.html');
  assert.equal(ruler.excludedFromMeasurement, true);
  assert.match(ruler.reason, /intentionally omitted/);
  assert.equal(ruler.medianCharactersPerCompleteLine, undefined);
});
test('hidden probes are explicitly excluded and cannot become false zero measurements', () => {
  const context = controller();
  context.doc = documentStub({ hiddenProbe: true });
  context.frame = { id: 'before', contentDocument: context.doc, contentWindow: { innerWidth: 1440, innerHeight: 1000, getComputedStyle: () => ({ fontSize: '18px' }) } };
  vm.runInContext("manifest = { captureRevision: 'revision' }; result = measureDocument(frame, { path: '/cases/x', file: 'pages/case.html' }, 'ordinary');", context);
  const ruler = context.result.measures.find(item => item.prefix === '전각한글측정');
  assert.equal(ruler.hidden, true); assert.equal(ruler.excludedFromMeasurement, true);
  assert.equal(ruler.medianCharactersPerCompleteLine, undefined);
});
test('content-addressed mode selection retains one bounded same-origin cache-fresh retry', async () => {
  const context = controller(), urls = [];
  const doc = documentStub();
  const frame = { id: 'after', contentDocument: null };
  let value = '';
  Object.defineProperty(frame, 'src', { get: () => value, set: url => { value = url; urls.push(url); frame.contentDocument = urls.length === 2 ? doc : null; queueMicrotask(() => frame.onload()); } });
  context.frame = frame;
  vm.runInContext('measureDocument = (frame, route, fixtureMode) => ({ fixtureMode });', context);
  const result = await vm.runInContext("loadFrame(frame, { snapshots: { ordinary: { after: 'ordinary-after/pages/blog-abcd.html' } } }, 1440, 'light', '100', 'ordinary')", context);
  assert.equal(result.fixtureMode, 'ordinary');
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => new URL(url).origin === 'https://qa.example.test'));
  assert.match(urls[0], /ordinary-after\/pages\/blog-abcd.html$/);
  assert.match(urls[1], /__qa_header_revision=5a8a115/);
});
test('failed protected frames stop after the one retry', async () => {
  const context = controller(), urls = [];
  const frame = { id: 'after', contentDocument: null };
  let value = '';
  Object.defineProperty(frame, 'src', { get: () => value, set: url => { value = url; urls.push(url); queueMicrotask(() => frame.onload()); } });
  context.frame = frame;
  await assert.rejects(vm.runInContext("loadFrame(frame, { file: 'pages/blog.html' }, 1440, 'light', '100', 'stress')", context), /one cache-fresh retry/);
  assert.equal(urls.length, 2);
});
test('only ordinary AFTER same-document fragments with existing targets can navigate', async () => {
  const context = controller();
  vm.runInContext('measureDocument = () => ({});', context);
  for (const [version, mode, href, target, exists, allowed] of [
    ['after', 'ordinary', '#fn-note', null, true, true],
    ['before', 'ordinary', '#fn-note', null, true, false],
    ['after', 'stress', '#fn-note', null, true, false],
    ['after', 'ordinary', '#fn-note', '_blank', true, false],
    ['after', 'ordinary', '#missing', null, false, false],
    ['after', 'ordinary', 'https://example.invalid/', null, true, false],
    ['after', 'ordinary', '/elsewhere#fn-note', null, true, false],
  ]) {
    const listeners = {}, doc = documentStub();
    doc.addEventListener = (event, listener) => { listeners[event] = listener; };
    doc.getElementById = () => exists ? {} : null;
    const frame = { id: version, contentDocument: doc };
    let url = '';
    Object.defineProperty(frame, 'src', { get: () => url, set: value => { url = value; queueMicrotask(() => frame.onload()); } });
    context.frame = frame; context.mode = mode;
    await vm.runInContext("loadFrame(frame, { file: 'pages/blog.html' }, 1440, 'light', '100', mode)", context);
    let prevented = false;
    const anchor = { tagName: 'A', getAttribute: key => key === 'href' ? href : key === 'target' ? target : null };
    listeners.click({ target: { closest: () => anchor }, preventDefault: () => { prevented = true; } });
    assert.equal(!prevented, allowed, `${version} ${mode} ${href} ${target}`);
    let submitPrevented = false;
    listeners.submit({ preventDefault: () => { submitPrevented = true; } });
    assert.equal(submitPrevented, true);
  }
});
