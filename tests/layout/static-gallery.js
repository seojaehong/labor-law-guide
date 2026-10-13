/* Only this controlled QA script executes. Captured application frames run no JS. */
'use strict';
const $ = id => document.getElementById(id);
const controls = ['route', 'width', 'theme', 'version', 'textsize', 'fixturemode'].map($);
const frames = ['before', 'after'].map($);
let manifest, latest, sequence = 0, busy = false;
// One normal cache-fresh navigation per failed static asset after the approved header revision.
const failedFrameUrls = new Set();
const frameHeaderRevision = '5a8a115';
const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function measureDocument(frame, route, fixtureMode) {
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  const rectOf = element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  };
  const root = (route.scope && doc.querySelector(route.scope)) || doc.querySelector('main') || doc.body;
  const style = win.getComputedStyle(root);
  const measures = ['한글 측정 문단', '전각한글측정', 'Mixed layout'].map(prefix => {
    const paragraph = [...root.querySelectorAll('p')].find(element => element.textContent.trim().startsWith(prefix));
    if (!paragraph) return { prefix, missing: true, excludedFromMeasurement: true,
      reason: fixtureMode === 'ordinary' && prefix === '전각한글측정' ? 'Artificial fullwidth ruler intentionally omitted from ordinary content' : 'Probe not present on this route' };
    if (!paragraph.getClientRects().length || win.getComputedStyle(paragraph).display === 'none')
      return { prefix, missing: false, hidden: true, excludedFromMeasurement: true, reason: 'Hidden probes are not measured as zero CPL' };
    const style = win.getComputedStyle(paragraph);
    const lines = [];
    const walker = doc.createTreeWalker(paragraph, win.NodeFilter.SHOW_TEXT);
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    let node;
    while ((node = walker.nextNode())) {
      for (const { segment, index } of segmenter.segment(node.textContent || '')) {
        const range = doc.createRange(); range.setStart(node, index); range.setEnd(node, index + segment.length);
        const rect = [...range.getClientRects()].find(rect => rect.width > 0 && rect.height > 0);
        if (!rect) continue;
        let line = lines.find(line => Math.abs(line.top - rect.top) < 2);
        if (!line) { line = { top: rect.top, text: '', characters: 0, nonspace: 0, hangul: 0, left: rect.left, right: rect.right }; lines.push(line); }
        line.text += segment; line.characters++;
        if (!/^\s+$/u.test(segment)) line.nonspace++;
        if (/\p{Script=Hangul}/u.test(segment)) line.hangul++;
        line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right);
      }
    }
    lines.sort((a, b) => a.top - b.top);
    const complete = lines.slice(0, -1);
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;
    return { prefix, missing: false, rect: rectOf(paragraph), fontFamily: style.fontFamily,
      fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), letterSpacing: style.letterSpacing,
      color: style.color, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap,
      lineCount: lines.length, medianCharactersPerCompleteLine: median(complete.map(line => line.characters)),
      medianHangulPerCompleteLine: median(complete.map(line => line.hangul)), medianNonspacePerCompleteLine: median(complete.map(line => line.nonspace)),
      clientWidth: paragraph.clientWidth, scrollWidth: paragraph.scrollWidth, lines };
  });
  const main = doc.querySelector('.reading-main') || doc.querySelector('article') || root;
  const sidebar = doc.querySelector('.reading-sidebar') || doc.querySelector('aside');
  const fonts = [...doc.fonts].map(font => ({ family: font.family, status: font.status, weight: font.weight }));
  return { version: frame.id, route: route.path, fixtureMode,
    snapshotFile: route.snapshots?.[fixtureMode]?.[frame.id] || `${frame.id}/${route.file}`,
    captureRevision: manifest.captureRevision || manifest.afterSourceSha256.slice(0, 16),
    ordinarySupplement: fixtureMode === 'ordinary' && Boolean(route.scope),
    staticSsrOnly: true, synthetic: true,
    viewport: { width: win.innerWidth, height: win.innerHeight }, theme: doc.documentElement.classList.contains('dark') ? 'dark' : 'light',
    rootTextSize: win.getComputedStyle(doc.documentElement).fontSize,
    document: { clientWidth: doc.documentElement.clientWidth, scrollWidth: doc.documentElement.scrollWidth },
    root: { ...rectOf(root), clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, fontSize: style.fontSize },
    main: rectOf(main), sidebar: sidebar ? rectOf(sidebar) : null,
    fontStatus: doc.fonts.status, fontFaces: fonts, primaryFontAvailable: doc.fonts.check('18px "Pretendard Variable"', '한글水'),
    primaryFontLoaded: fonts.some(font => font.family.replaceAll(/["']/g, '') === 'Pretendard Variable' && font.status === 'loaded'),
    footnotes: { references: root.querySelectorAll('[data-footnote-ref]').length, backReferences: root.querySelectorAll('[data-footnote-backref]').length, definitions: root.querySelectorAll('[data-footnotes]').length, sameDocumentNavigationEnabled: fixtureMode === 'ordinary' && frame.id === 'after', outboundNavigationDisabled: true },
    measures, tableScrollers: [...root.querySelectorAll('.reading-table-scroll')].map(element => ({ ...rectOf(element),
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: win.getComputedStyle(element).overflowX,
      role: element.getAttribute('role'), tabindex: element.getAttribute('tabindex') })) };
}

async function loadFrame(frame, route, width, theme, textsize, fixtureMode) {
  frame.width = width;
  frame.height = 1000;
  const asset = new URL(route.snapshots?.[fixtureMode]?.[frame.id] || `${frame.id}/${route.file}`, location.href);
  if (asset.origin !== location.origin) throw new Error('Snapshot must remain same-origin');
  const key = asset.href;
  const freshUrl = () => {
    const url = new URL(key);
    url.searchParams.set('__qa_header_revision', frameHeaderRevision);
    return url.href;
  };
  const navigate = url => new Promise((resolve, reject) => {
    frame.onload = resolve; frame.onerror = reject; frame.src = url;
  });
  const desired = failedFrameUrls.has(key) ? freshUrl() : key;
  if (frame.src !== desired) await navigate(desired);
  let doc = frame.contentDocument;
  if (!doc?.documentElement?.dataset.qaSynthetic && !failedFrameUrls.has(key)) {
    failedFrameUrls.add(key);
    // Same protected resource, unchanged sandbox/auth. Never substitute an origin,
    // remove a protection, retry indefinitely, or accept a non-synthetic document.
    await navigate(freshUrl());
    doc = frame.contentDocument;
  }
  if (!doc?.documentElement?.dataset.qaSynthetic) throw new Error('Frame is not a verified synthetic snapshot after one cache-fresh retry');
  doc.documentElement.dataset.qaFixtureMode = fixtureMode;
  doc.documentElement.classList.toggle('dark', theme === 'dark');
  doc.documentElement.style.fontSize = textsize + '%';
  // Parent event cancellation is only an extra guard; frame CSP also forbids form
  // submission, and the sanitizer removed links/request attributes and scripts.
  doc.addEventListener('submit', event => event.preventDefault(), true);
  doc.addEventListener('click', event => {
    const target = event.target.closest('a,button');
    if (!target) return;
    const href = target.getAttribute('href') || '';
    const linkTarget = target.getAttribute('target');
    const sameDocumentFootnote = frame.id === 'after' && doc.documentElement.dataset.qaFixtureMode === 'ordinary'
      && target.tagName === 'A' && /^#[A-Za-z0-9_.:-]+$/.test(href)
      && (!linkTarget || linkTarget === '_self') && doc.getElementById(href.slice(1));
    if (!sameDocumentFootnote) event.preventDefault();
  }, true);
  await doc.fonts.load('18px "Pretendard Variable"', '한글水');
  await doc.fonts.ready; await settle();
  // Keep a fixed, known viewport height. The iframe scrolls normally so sticky
  // rails are representative; auto-full-height frames would change sticky logic.
  return measureDocument(frame, route, fixtureMode);
}
function showResult(result) { latest = result; $('metrics').textContent = JSON.stringify(result, null, 2); $('download').disabled = false; }
function setBusy(value) { busy = value; for (const control of [...controls, $('measure'), $('matrix')]) control.disabled = value || (control.id === 'fixturemode' && !(manifest?.fixtureModes || []).includes('ordinary')); }
async function render() {
  if (!manifest || busy) return;
  setBusy(true);
  const current = ++sequence, route = manifest.routes.find(route => route.key === $('route').value);
  // Hidden iframes return zero geometry, so measure both before applying the
  // display-only version filter.
  for (const frame of frames) frame.closest('.sample').hidden = false;
  $('status').textContent = 'Loading local fonts and measuring actual text rectangles…';
  try {
    const values = await Promise.all(frames.map(frame => loadFrame(frame, route, Number($('width').value), $('theme').value, $('textsize').value, $('fixturemode').value)));
    if (current !== sequence) return;
    for (const frame of frames) frame.closest('.sample').hidden = $('version').value !== 'both' && $('version').value !== frame.id;
    showResult({ kind: 'Actual browser DOM Range, static SSR only', capturedAt: new Date().toISOString(), fixtureMode: $('fixturemode').value, values });
    $('status').textContent = values.every(value => value.primaryFontLoaded) ? `Measured ${$('fixturemode').value} content · ${route.path} at ${$('width').value}px, ${$('theme').value}. Local Pretendard loaded in both frames.` : 'Measurement incomplete: bundled Pretendard did not load.';
  } catch (error) { $('status').textContent = `Blocked: ${error.message}. Serve the directory through an authorized same-origin HTTP host; file:// cannot provide reliable iframe measurements.`; }
  finally { setBusy(false); }
}
async function runMatrix() {
  setBusy(true); const values = [];
  const fixtureMode = $('fixturemode').value;
  $('version').value = 'both'; $('textsize').value = '100';
  for (const frame of frames) frame.closest('.sample').hidden = false;
  try {
    for (const route of manifest.routes) for (const width of manifest.widths) for (const theme of ['light', 'dark']) {
      $('route').value = route.key; $('width').value = String(width); $('theme').value = theme;
      $('status').textContent = `Measuring ${fixtureMode} · ${route.path} · ${width}px · ${theme} (${values.length / 2 + 1}/${manifest.routes.length * 10})…`;
      values.push(...await Promise.all(frames.map(frame => loadFrame(frame, route, width, theme, '100', fixtureMode))));
      showResult({ kind: 'Full matrix in progress; static SSR only', fixtureMode, values });
    }
    showResult({ kind: 'Complete static SSR browser geometry matrix', capturedAt: new Date().toISOString(), fixtureMode, manifest, values });
    $('status').textContent = `Completed ${fixtureMode}: ${values.length} frame measurements. Download JSON; browser screenshots are a separate step.`;
  } catch (error) { showResult({ kind: 'Incomplete matrix', fixtureMode, error: error.message, values }); $('status').textContent = `Stopped: ${error.message}`; }
  finally { setBusy(false); }
}
for (const control of controls) control.addEventListener('change', render);
$('measure').addEventListener('click', render); $('matrix').addEventListener('click', runMatrix);
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `layout-${latest.fixtureMode || 'stress'}-rendered-measurements.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
fetch('manifest.json').then(response => { if (!response.ok) throw new Error('Manifest not found'); return response.json(); }).then(value => {
  manifest = value;
  $('fixturemode').disabled = !(manifest.fixtureModes || []).includes('ordinary');
  for (const route of manifest.routes) { const option = document.createElement('option'); option.value = route.key; option.textContent = route.title; $('route').append(option); }
  $('provenance').textContent = `Before ${manifest.baselineCommit.slice(0, 12)} · After working source ${manifest.afterSourceSha256.slice(0, 12)} · Built ${manifest.generatedAt}. Original stress BEFORE is immutable. Ordinary content uses separately rendered, matched synthetic fixtures. No browser measurements were fabricated during generation.`;
  render();
}).catch(error => { $('status').textContent = error.message; });
