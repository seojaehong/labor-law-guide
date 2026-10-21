// @rhwp/core 의 WASM 을 public/rhwp/ 로 복사한다. 저장소에는 올리지 않는다(.gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pkg = dirname(createRequire(import.meta.url).resolve('@rhwp/core/package.json'));
mkdirSync('public/rhwp', { recursive: true });
copyFileSync(join(pkg, 'rhwp_bg.wasm'), 'public/rhwp/rhwp_bg.wasm');
copyFileSync(join(pkg, 'LICENSE'), 'public/rhwp/LICENSE.txt');
