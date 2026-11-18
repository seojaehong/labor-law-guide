#!/usr/bin/env node
// npm run office:check -- <file...>  →  python tools/office-check/check.py <file...>
// Picks the first python that has the checker's dependencies (defusedxml, lxml, openpyxl, pypdf).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probe = 'import defusedxml, lxml, openpyxl, pypdf';
const candidates = [process.env.PYTHON, 'python3', 'python', 'py'].filter(Boolean);
const py = candidates.find((c) => spawnSync(c, ['-c', probe], { stdio: 'ignore' }).status === 0);
if (!py) {
  console.error('office-check: no python with defusedxml, lxml, openpyxl, pypdf found (set PYTHON=...)');
  process.exit(2);
}
const r = spawnSync(py, [join(here, 'check.py'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 2);
