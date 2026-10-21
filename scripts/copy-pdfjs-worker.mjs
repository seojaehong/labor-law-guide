// pdf.js 의 워커를 public/pdfjs/ 로 복사한다. 저장소에는 올리지 않는다(.gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pkg = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
mkdirSync('public/pdfjs', { recursive: true });
copyFileSync(join(pkg, 'build/pdf.worker.min.mjs'), 'public/pdfjs/pdf.worker.min.mjs');
copyFileSync(join(pkg, 'LICENSE'), 'public/pdfjs/LICENSE.txt');
