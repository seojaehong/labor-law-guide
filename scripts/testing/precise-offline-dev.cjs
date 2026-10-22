// Local UI regression harness: no real keys, all server outbound calls blocked.
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '-p', '3189'], {
  cwd: root, stdio: 'inherit',
  env: { PATH: process.env.PATH, NODE_OPTIONS: `--require=${path.join(__dirname, 'offline-network.cjs')}`,
    NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://offline-supabase.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-placeholder', NEXT_PUBLIC_WORK_RULES_PRECISE: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
