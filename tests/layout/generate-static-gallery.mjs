/** LOCAL ONLY. Creates an inert gallery; never uploads, publishes, or runs a browser.
 * Usage: node tests/layout/generate-static-gallery.mjs [output-directory]
 * Both fixture and SSR servers live within this single invocation. */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir, realpath, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createFixtureServer } from './fixture-server.mjs';
import { inspectSsr, safeCss, snapshotHtml } from './static-snapshot.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptDir, '../..');
const output = resolve(process.argv[2] || '/workspace/shared/layout-preview');
const baseline = '3be9fb3';
const sourcePaths = ['src', 'public', 'package.json', 'package-lock.json', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json'];
const routes = [
  { key: 'blog', title: 'Blog detail', path: '/blog/news-20261003-01', scope: '.blog-content' },
  { key: 'decision', title: 'Decision detail', path: '/decisions/layout-decision', scope: '#decision-summary' },
  { key: 'decisions', title: 'Decisions list', path: '/decisions', scope: null },
  { key: 'case', title: 'Case detail', path: '/cases/layout-case', scope: 'article' },
  { key: 'interpretation', title: 'Interpretation detail', path: '/interpretations/layout-interpretation', scope: 'article' },
  { key: 'contact', title: 'Contact tool shell', path: '/contact', scope: null },
  { key: 'subsidy', title: 'Subsidy tool shell', path: '/subsidy', scope: null },
].map(route => ({ ...route, file: `pages/${route.key}.html` }));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baselineCommit = execFileSync('git', ['rev-parse', baseline], { cwd: repo, encoding: 'utf8' }).trim();
if (output === repo || output.startsWith(repo + '/src/')) throw new Error('Output must not replace source');
try {
  const existing = await readdir(output);
  if (existing.length) throw new Error(`Output directory is not empty: ${output}. Use a new directory; existing captures are never deleted.`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(join(output, 'assets'), { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'labor-layout-static-'));
console.log(`Private capture workspace: ${temporary}`);
const before = join(temporary, 'before');
const after = join(temporary, 'after');
await mkdir(before); await mkdir(after);
const archive = execFileSync('git', ['archive', '--format=tar', baselineCommit, ...sourcePaths], { cwd: repo, maxBuffer: 50 * 1024 * 1024 });
execFileSync('tar', ['-xf', '-', '-C', before], { input: archive });
for (const path of sourcePaths) await cp(join(repo, path), join(after, path), { recursive: true, dereference: false });
const modules = await realpath(join(repo, 'node_modules'));
for (const root of [before, after]) await symlink(modules, join(root, 'node_modules'), 'dir');

async function treeDigest(root) {
  const digest = createHash('sha256');
  async function visit(relative) {
    const full = join(root, relative), info = await stat(full);
    if (info.isDirectory()) for (const entry of (await readdir(full)).sort()) await visit(join(relative, entry));
    else { digest.update(relative + '\0'); digest.update(await readFile(full)); digest.update('\0'); }
  }
  for (const path of sourcePaths) await visit(path);
  return digest.digest('hex');
}
const beforeSourceSha256 = await treeDigest(before);
const afterSourceSha256 = await treeDigest(after);
const font = await readFile(join(modules, 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2'));
await writeFile(join(output, 'assets/PretendardVariable.woff2'), font);
await writeFile(join(output, 'assets/qa-font.css'), '@font-face{font-family:"Pretendard Variable";font-style:normal;font-weight:45 920;font-display:swap;src:url("PretendardVariable.woff2") format("woff2")}\n');

// Defense in depth: source copied without .env files and children receive no
// provider credentials. Only loopback fetch/http/https requests are allowed.
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
const fixture = createFixtureServer();
await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve); });
const fixturePort = fixture.address().port;
const captures = [];
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function capture(label, root) {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: 'development', NODE_OPTIONS: `--require=${guard}`, NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-layout-fixture-only' };
  const child = spawn(process.execPath, [join(modules, 'next/dist/bin/next'), 'dev', '--webpack', '-p', String(port), '-H', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
  const get = async path => {
    const url = new URL(path, origin); assert.equal(url.origin, origin, 'Only owned loopback origin may be fetched');
    assert.ok(!url.pathname.startsWith('/api'), 'No API route may be requested');
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error(`${label} SSR exited ${child.exitCode}: ${log.slice(-3000)}`);
      try {
        // Next's HTML-limited-bot mode waits for all SSR Suspense content. A
        // Googlebot UA is DOM-capable and would still receive streamed scripts.
        const response = await fetch(url, { headers: { 'user-agent': 'Twitterbot StaticLayoutQA/1.0' }, redirect: 'error', signal: AbortSignal.timeout(180_000) });
        assert.equal(response.status, 200, `${label} ${path}`); return await response.text();
      } catch (error) { if (error.code === 'ERR_ASSERTION' || attempt === 59) throw error; await delay(500); }
    }
  };
  try {
    await mkdir(join(output, label, 'pages'), { recursive: true });
    for (const route of routes) {
      const raw = await get(route.path);
      await writeFile(join(temporary, `${label}-${route.key}.raw.html`), raw);
      const extracted = inspectSsr(raw);
      if (route.scope) for (const probe of ['한글 측정 문단', '전각한글측정', 'Mixed layout'])
        assert.ok(extracted.body.includes(probe), `${label} ${route.path}: body contains ${probe}`);
      const stylesheets = [];
      for (const cssPath of extracted.css) {
        if (/^https?:/.test(cssPath)) {
          assert.ok(cssPath.startsWith('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@'), 'Only known external font sheet may be replaced');
          continue; // Bundled local font replaces known production CDN font.
        }
        assert.ok(cssPath.startsWith('/_next/static/css/'), 'Stylesheet must be generated Next CSS');
        const css = safeCss(await get(cssPath)), filename = `${hash(css).slice(0, 20)}.css`;
        await writeFile(join(output, 'assets', filename), css);
        stylesheets.push(`../../assets/${filename}`);
      }
      assert.ok(stylesheets.length, 'Real application CSS captured');
      const html = snapshotHtml({ ...extracted, stylesheets, title: `${label}: ${route.title}`, label });
      assert.ok(!/<script\b/i.test(html), 'No application script survives');
      assert.ok(!/\b(?:src|href|action)=["']https?:/i.test(html), 'No remote resource/navigation attributes survive');
      await writeFile(join(output, label, route.file), html);
      captures.push({ label, route: route.path, file: `${label}/${route.file}`, htmlSha256: hash(html), htmlBytes: Buffer.byteLength(html), stylesheets, sanitization: extracted.report });
      console.log(`Captured ${label} ${route.path}: ${Buffer.byteLength(html)} inert HTML bytes`);
    }
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    await writeFile(join(temporary, `${label}-server.log`), log);
  }
}
try { await capture('before', before); await capture('after', after); }
finally { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
for (const [source, target] of [['static-gallery.html', 'index.html'], ['static-gallery.css', 'gallery.css'], ['static-gallery.js', 'gallery.js']])
  await cp(join(scriptDir, source), join(output, target));
const manifest = { kind: 'LOCAL ONLY synthetic static SSR gallery; not browser validation', generatedAt: new Date().toISOString(), baselineCommit,
  beforeSourceSha256, afterSourceSha256, fixtureSha256: hash(await readFile(join(scriptDir, 'fixture-data.mjs'))),
  font: { family: 'Pretendard Variable', source: 'installed pretendard package', sha256: hash(font), bytes: font.length },
  widths: [1440, 1280, 1024, 768, 390], themes: ['light', 'dark'], routes, captures,
  safety: { localOnly: true, publicationAuthorized: false, sourceScriptsRemoved: true, navigationDisabled: true, formsDisabled: true, apiRequests: false, providerCredentialsCopied: false },
  limitations: ['Static server-rendered HTML; no hydration or application interaction validation.', 'Before and after use identical synthetic database fixtures.', 'Contact/subsidy preserve checked-in public template text; they are not synthetic database records.', 'No browser geometry or screenshots exist until the gallery is opened and measured in an authorized browser.', 'Loopback-only development servers stopped after capture; raw SSR logs remain outside the gallery.'] };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(output, 'README.txt'), `LOCAL ONLY SYNTHETIC LAYOUT QA\n\nThis directory has NOT been uploaded or published. Publication needs separate authorization.\nServe through an approved same-origin static host to use index.html. All application JavaScript, metadata payloads, links, form actions and external resource loading have been removed. The gallery's own controlled JavaScript only switches local snapshots, measures DOM Range text lines, and saves local JSON.\n\nBefore: pristine git ${baselineCommit}\nAfter source digest: ${afterSourceSha256}\nRoutes: ${routes.length}; widths: 1440,1280,1024,768,390; themes: light,dark.\n\nNo browser execution, font rendering, geometry or screenshots was claimed by this generator. Static SSR cannot verify hydration, collapsed components, keyboard behavior or app submissions. Public checked-in contact/subsidy copy is retained only for layout context; the four reading documents and decisions database rows are synthetic.\n\nRetain manifest.json with any screenshot or exported measurement. The generator and sanitizer live in tests/layout.\n`);
console.log(`Local gallery ready: ${output}. ${captures.length} sanitized snapshots. No publication or browser validation performed.`);
