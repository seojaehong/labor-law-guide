import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

const guard = path.resolve('scripts/testing/offline-network.cjs');
function run(code: string) {
  return spawnSync(process.execPath, ['--require', guard, '-e', code], { encoding: 'utf8' });
}
it('offline harness rejects unmocked remote fetch before sending', () => {
  const result = run("fetch('https://api.openai.com/v1/embeddings').catch(e => console.log(e.message))");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('OFFLINE_FETCH_BLOCKED:api.openai.com');
});
it('offline harness blocks direct sockets as well as fetch', () => {
  const result = run("try { require('node:net').connect({host:'api.anthropic.com',port:443}); } catch(e) { console.log(e.message); }");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('OFFLINE_NETWORK_BLOCKED:api.anthropic.com');
});
it('synthetic read responses are empty and never use a real DB', () => {
  const result = run("fetch('https://offline-supabase.invalid/rest/v1/cases').then(r=>r.text()).then(console.log)");
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('[]');
});
it('synthetic DB mutations are blocked', () => {
  const result = run("fetch('https://offline-supabase.invalid/rest/v1/cases',{method:'POST',body:'{}'}).catch(e=>console.log(e.message))");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('OFFLINE_DB_WRITE_BLOCKED');
});
