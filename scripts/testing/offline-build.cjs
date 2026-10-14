// CommonJS keeps these standalone Node harnesses independent of app transpilation.
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH,
    HOME: '/tmp',
    NODE_OPTIONS: `--require=${path.join(__dirname, 'offline-network.cjs')}`,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://offline-supabase.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-placeholder',
  },
});
process.exit(result.status ?? 1);
