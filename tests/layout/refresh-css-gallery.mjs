/** LOCAL ONLY. Refresh compiled CSS while preserving all previous snapshots/assets.
 * Usage: node tests/layout/refresh-css-gallery.mjs OLD_GALLERY OLD_CAPTURE_SOURCE NEW_GALLERY
 * OLD_CAPTURE_SOURCE must hash to the previous manifest's afterSourceSha256.
 * No browser, deployment, application API, credentials or external request is used. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir, realpath, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createFixtureServer } from './fixture-server.mjs';
import { ordinaryTables } from './ordinary-fixture-data.mjs';
import { inspectSsr, safeCss } from './static-snapshot.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url)), repo = resolve(scriptDir, '../..');
assert.equal(process.argv.length, 5, 'Pass old gallery, verified old source and new output directory');
const [previous, oldSource, output] = process.argv.slice(2).map(path => resolve(path));
const sourcePaths = ['src', 'public', 'package.json', 'package-lock.json', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(root, roots = ['']) {
  const files = {};
  async function visit(relative) {
    if ((await stat(join(root, relative))).isDirectory()) {
      for (const item of (await readdir(join(root, relative))).sort()) await visit(join(relative, item));
    } else files[relative] = await readFile(join(root, relative));
  }
  for (const path of roots) await visit(path);
  return files;
}
function treeHash(files) {
  const digest = createHash('sha256');
  for (const [path, bytes] of Object.entries(files)) digest.update(path + '\0').update(bytes).update('\0');
  return digest.digest('hex');
}
const oldManifestBytes = await readFile(join(previous, 'manifest.json'));
const oldManifest = JSON.parse(oldManifestBytes);
const previousFiles = await inventory(previous);
const oldFiles = await inventory(oldSource, sourcePaths), newFiles = await inventory(repo, sourcePaths);
assert.equal(treeHash(oldFiles), oldManifest.afterSourceSha256, 'Old source must exactly match captured source');
assert.deepEqual(Object.keys(newFiles), Object.keys(oldFiles), 'No rendered source file may be added or removed');
const changedSource = Object.keys(newFiles).filter(path => !newFiles[path].equals(oldFiles[path]));
assert.deepEqual(changedSource, ['src/app/globals.css'], 'CSS-only refresh cannot reuse bodies after a markup/source change');
assert.equal(hash(await readFile(join(scriptDir, 'fixture-data.mjs'))), oldManifest.fixtureSha256);
assert.equal(hash(await readFile(join(scriptDir, 'ordinary-fixture-data.mjs'))), oldManifest.ordinaryFixtureSha256);
for (const capture of oldManifest.captures) {
  assert.equal(hash(previousFiles[capture.file]), capture.htmlSha256, `Existing HTML hash: ${capture.file}`);
  assert.equal(previousFiles[capture.file].length, capture.htmlBytes);
  for (const sheet of capture.stylesheets) await stat(resolve(previous, dirname(capture.file), sheet));
}
try { assert.equal((await readdir(output)).length, 0, 'Output must be new or empty'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
assert.ok(output !== previous && output !== repo && !output.startsWith(repo + '/src/'));
await mkdir(output, { recursive: true });
await cp(previous, output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'labor-layout-css-'));
const source = join(temporary, 'after'); await mkdir(source);
for (const path of sourcePaths) await cp(join(repo, path), join(source, path), { recursive: true, dereference: false });
assert.equal(treeHash(await inventory(source, sourcePaths)), treeHash(newFiles), 'Copied source must remain stable');
const modules = await realpath(join(repo, 'node_modules'));
await symlink(modules, join(source, 'node_modules'), 'dir');
assert.equal(hash(await readFile(join(modules, 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2'))), oldManifest.font.sha256);
const guard = join(temporary, 'local-network-only.cjs');
await writeFile(guard, `const check = value => {
  let host;
  if (typeof value === 'string' || value instanceof URL) host = new URL(value).hostname;
  else host = value?.hostname || value?.host || 'localhost';
  host = String(host).replace(/:\\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) throw new Error('Static QA blocked non-loopback request');
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, ...rest) => { check(typeof input === 'object' && input.url ? input.url : input); return originalFetch(input, ...rest); };
for (const scheme of ['http', 'https']) { const api = require('node:' + scheme); for (const method of ['request', 'get']) { const original = api[method]; api[method] = function (input, ...rest) { check(input); return original.call(this, input, ...rest); }; } }
`);
execFileSync(process.execPath, ['--check', guard]);
const fixture = createFixtureServer(ordinaryTables);
await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve); });
const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'development', NODE_OPTIONS: `--require=${guard}`, NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-layout-fixture-only' };
const child = spawn(process.execPath, [join(modules, 'next/dist/bin/next'), 'dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], { cwd: source, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
async function get(path) {
  const url = new URL(path, origin); assert.equal(url.origin, origin); assert.ok(!url.pathname.startsWith('/api'));
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`CSS capture server exited: ${log.slice(-3000)}`);
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Twitterbot StaticLayoutQA/1.0' }, redirect: 'error', signal: AbortSignal.timeout(180_000) });
      assert.equal(response.status, 200, path); return await response.text();
    } catch (error) { if (error.code === 'ERR_ASSERTION' || attempt === 59) throw error; await delay(500); }
  }
}
const sheets = [], compilation = [];
let sampledBodyIdentical = false;
try {
  const route = '/blog/news-20261003-01';
  const raw = await get(route); await writeFile(join(temporary, 'ordinary-blog.raw.html'), raw);
  const extracted = inspectSsr(raw);
  const previousBlog = oldManifest.captures.find(item => item.route === route && item.label === 'ordinary-after');
  const originalBody = previousFiles[previousBlog.file].toString().match(/<body>([\s\S]*)<\/body>/)[1];
  assert.equal(extracted.body, originalBody, 'Sampled actual SSR body must also be byte-identical');
  sampledBodyIdentical = true;
  for (const path of extracted.css) {
    if (/^https?:/.test(path)) { assert.ok(path.startsWith('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@')); continue; }
    assert.ok(path.startsWith('/_next/static/css/'));
    const rawCss = await get(path), css = safeCss(rawCss), sha256 = hash(css);
    const file = `assets/${sha256.slice(0, 20)}.css`;
    await writeFile(join(output, file), css);
    sheets.push(`../../${file}`);
    compilation.push({ sourcePath: path, rawSha256: hash(rawCss), safeSha256: sha256, file, bytes: Buffer.byteLength(css) });
  }
  assert.equal(sheets.length, 1, 'This narrowly scoped refresh expects one globals stylesheet');
} finally {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
  fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
  await writeFile(join(temporary, 'server.log'), log);
}
const afterSourceSha256 = treeHash(newFiles), captureRevision = afterSourceSha256.slice(0, 16);
const replacements = new Map(), bodyChecks = [];
const captures = [];
for (const oldCapture of oldManifest.captures) {
  if (!['after', 'ordinary-after'].includes(oldCapture.label)) { captures.push(oldCapture); continue; }
  assert.equal(oldCapture.stylesheets.length, sheets.length);
  const oldHtml = previousFiles[oldCapture.file].toString();
  let html = oldHtml;
  for (let index = 0; index < sheets.length; index++) {
    const from = `<link rel="stylesheet" href="${oldCapture.stylesheets[index]}">`;
    const to = `<link rel="stylesheet" href="${sheets[index]}">`;
    assert.equal(html.split(from).length, 2, 'Replace only one verified stylesheet reference');
    html = html.replace(from, to);
  }
  assert.equal(html.match(/<body>([\s\S]*)<\/body>/)[1], oldHtml.match(/<body>([\s\S]*)<\/body>/)[1]);
  const sha256 = hash(html), route = oldManifest.routes.find(route => route.path === oldCapture.route);
  const file = `${oldCapture.label}/pages/${route.key}-${sha256.slice(0, 12)}.html`;
  assert.notEqual(file, oldCapture.file, 'AFTER references must be content-addressed and fresh');
  await writeFile(join(output, file), html);
  replacements.set(oldCapture.file, file);
  captures.push({ ...oldCapture, file, htmlSha256: sha256, htmlBytes: Buffer.byteLength(html), stylesheets: sheets });
  bodyChecks.push({ previousFile: oldCapture.file, file, bodySha256: hash(html.match(/<body>([\s\S]*)<\/body>/)[1]), byteIdenticalExceptStylesheetUrls: true });
}
const routes = structuredClone(oldManifest.routes);
for (const route of routes) for (const mode of Object.values(route.snapshots)) {
  if (replacements.has(mode.after)) mode.after = replacements.get(mode.after);
}
const provenancePath = `provenance/previous-manifest-${oldManifest.captureRevision}.json`;
await writeFile(join(output, provenancePath), oldManifestBytes);
const manifest = { ...oldManifest, generatedAt: new Date().toISOString(), captureRevision, afterSourceSha256, routes, captures,
  cssOnlyRefresh: { previousRevision: oldManifest.captureRevision, previousManifest: provenancePath, previousManifestSha256: hash(oldManifestBytes),
    changedSource, allPreviousSnapshotAndAssetFilesPreserved: true, allAfterBodyMarkupByteIdentical: true,
    compiledFromActualNext: true, sampledCurrentSsrBodyIdentical: sampledBodyIdentical,
    integrity: 'provenance/footnote-offset-integrity.json' } };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const originalReadme = previousFiles['README.txt'].toString();
await writeFile(join(output, 'README.txt'), `LOCAL ONLY CSS-REFRESHED SYNTHETIC LAYOUT QA\n\nPrevious revision: ${oldManifest.captureRevision}\nCurrent revision: ${captureRevision}\nSource digest: ${afterSourceSha256}\n\nOnly globals.css changed. Fresh actual Next-compiled CSS is captured using a loopback-only ordinary fixture; every prior snapshot and asset is preserved. All eleven AFTER bodies, IDs, content and security markup are byte-identical, with only their stylesheet URLs changed in newly content-addressed HTML. Both BEFORE sets are immutable. See manifest.json and provenance/footnote-offset-integrity.json.\n\nThis refresh does not execute a browser or claim new screenshots, geometry or successful sticky-header navigation. Authorized browser QA is still required for the new scroll offsets. No remote API, real provider key or .env file was used. No upload or publication was performed.\n\nPREVIOUS CAPTURE README (historical provenance)\n${originalReadme}`);
const preserved = [];
for (const [file, bytes] of Object.entries(previousFiles)) {
  if (file === 'manifest.json' || file === 'README.txt') continue;
  assert.ok((await readFile(join(output, file))).equals(bytes), `Previous file must remain byte-identical: ${file}`);
  preserved.push({ file, sha256: hash(bytes), bytes: bytes.length });
}
for (const capture of captures) {
  assert.equal(hash(await readFile(join(output, capture.file))), capture.htmlSha256);
  for (const sheet of capture.stylesheets) await stat(resolve(output, dirname(capture.file), sheet));
}
for (const route of routes) for (const mode of Object.values(route.snapshots)) for (const file of Object.values(mode)) await stat(join(output, file));
assert.equal(treeHash(await inventory(repo, sourcePaths)), afterSourceSha256, 'Production source must not change during capture');
const integrity = { generatedAt: new Date().toISOString(), captureRevision, afterSourceSha256,
  previousRevision: oldManifest.captureRevision, oldSourceVerifiedAgainstManifest: true, changedSource,
  compilation, previousManifest: provenancePath, previousManifestSha256: hash(oldManifestBytes),
  sourceCss: { previousSha256: hash(oldFiles['src/app/globals.css']), currentSha256: hash(newFiles['src/app/globals.css']) },
  sampledCurrentSsrBodyIdentical: sampledBodyIdentical, afterBodies: bodyChecks, preservedFiles: preserved,
  allHtmlHashesVerified: true, allStylesheetsAndModeRoutesExist: true,
  preservedBeforeSnapshots: captures.filter(item => ['before', 'ordinary-before'].includes(item.label)).length,
  fontUnchanged: true, newBrowserValidation: 'Not run; authorized browser QA required',
  safety: { externalRequests: false, applicationApiRequests: false, providerKeysOrEnvCopied: false, browserLaunched: false, published: false } };
await writeFile(join(output, 'provenance/footnote-offset-integrity.json'), JSON.stringify(integrity, null, 2));
console.log(JSON.stringify({ output, captureRevision, afterSourceSha256, compilation, newAfterSnapshots: bodyChecks.length, preservedFiles: preserved.length, previousBeforeSnapshots: integrity.preservedBeforeSnapshots, allAfterBodiesIdentical: true, sampledCurrentSsrBodyIdentical: sampledBodyIdentical, temporary }, null, 2));
