// Browser-independent SSR smoke test. Both processes stay in this invocation.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const output = 'test-results/layout/http';
const routes = ['/blog/news-20261003-01', '/cases/layout-case', '/interpretations/layout-interpretation', '/decisions/layout-decision', '/decisions', '/blog', '/contact', '/subsidy', '/tools/contract-check', '/stats'];
await mkdir(output, { recursive: true });
const child = spawn(process.execPath, ['tests/layout/start-local.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', chunk => { log += chunk; });
child.stderr.on('data', chunk => { log += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Fixture launcher exited ${child.exitCode}: ${log}`);
    try {
      const health = await fetch('http://127.0.0.1:4320/health', { signal: AbortSignal.timeout(1000) });
      if ((await health.json()).fixture === 'layout') { ready = true; break; }
    } catch { /* The owned fixture is still starting. */ }
    await delay(250);
  }
  assert.ok(ready, 'Owned synthetic fixture started');
  const report = [];
  for (const route of routes) {
    let response;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (child.exitCode !== null) throw new Error(`Fixture launcher exited ${child.exitCode}`);
      try { response = await fetch(`http://127.0.0.1:3124${route}`, { signal: AbortSignal.timeout(120_000) }); break; }
      catch (error) { if (attempt === 29) throw error; await delay(500); }
    }
    assert.equal(response.status, 200, route);
    const html = await response.text();
    if (route.includes('/news-') || /\/(cases|interpretations|decisions)\/layout-/.test(route)) {
      for (const probe of ['한글 측정 문단', '전각한글측정', 'Mixed layout']) assert.ok(html.includes(probe), `${route}: ${probe}`);
    }
    const filename = `${route.slice(1).replaceAll('/', '-')}.html`;
    await writeFile(`${output}/${filename}`, html);
    report.push({ route, status: response.status, bytes: Buffer.byteLength(html), artifact: filename });
    console.log(`${response.status} ${route} (${Buffer.byteLength(html)} bytes)`);
  }
  await writeFile(`${output}/report.json`, JSON.stringify({ kind: 'HTTP SSR only; no browser geometry or visual validation', routes: report }, null, 2));
} finally {
  child.kill('SIGTERM');
  await writeFile(`${output}/server.log`, log);
}
