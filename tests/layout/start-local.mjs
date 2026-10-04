// Safe launcher: never loads repo .env files or inherits provider credentials.
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createFixtureServer, FIXTURE_PORT } from './fixture-server.mjs';
const unsafeEnvFiles = readdirSync(process.cwd()).filter(name => /^\.env(?:$|\.)/.test(name) && !/\.example$/.test(name));
if (unsafeEnvFiles.length) throw new Error('Run layout QA in a clean worktree with no .env files; do not copy production credentials.');
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-layout-fixture-only',
};
const fixture = createFixtureServer();
fixture.on('error', error => { console.error(error); process.exitCode = 1; });
fixture.listen(FIXTURE_PORT, '127.0.0.1', () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', '3124', '-H', '127.0.0.1'], { stdio: 'inherit', env });
  const stop = () => { child.kill('SIGTERM'); fixture.close(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  child.once('exit', code => { fixture.close(); process.exitCode = code || 0; });
});
