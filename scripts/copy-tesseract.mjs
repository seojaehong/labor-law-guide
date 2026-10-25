// 스캔 쪽 두 번째 판독(tesseract.js)의 워커·코어·한국어 자료를 public/tesseract/ 로 복사한다. 저장소에는 올리지 않는다(.gitignore).
// CDN(jsdelivr) 대신 같은 출처에서 내려받게 한다 — 브라우저가 이 사이트 밖으로 나가지 않는다.
// 코어는 브라우저가 고르는 세 가지(relaxedsimd·simd·기본, LSTM 전용)를 모두 둔다. 브라우저는 그중 하나(약 3.9MB)만 받는다.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const req = createRequire(import.meta.url);
const pkg = (name) => dirname(req.resolve(`${name}/package.json`));
const js = pkg('tesseract.js'), core = pkg('tesseract.js-core'), kor = pkg('@tesseract.js-data/kor');

mkdirSync('public/tesseract/core', { recursive: true });
mkdirSync('public/tesseract/lang', { recursive: true });
copyFileSync(join(js, 'dist/worker.min.js'), 'public/tesseract/worker.min.js');
copyFileSync(join(js, 'LICENSE.md'), 'public/tesseract/LICENSE.txt');
for (const v of ['tesseract-core-relaxedsimd-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-lstm']) copyFileSync(join(core, `${v}.wasm.js`), `public/tesseract/core/${v}.wasm.js`);
copyFileSync(join(core, 'LICENSE'), 'public/tesseract/core/LICENSE.txt');
// LSTM 전용 best_int(1.6MB) — 화면 기본값(oem 1)이 고르는 자료와 같다
copyFileSync(join(kor, '4.0.0_best_int/kor.traineddata.gz'), 'public/tesseract/lang/kor.traineddata.gz');
