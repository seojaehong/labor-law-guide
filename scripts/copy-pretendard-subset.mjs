// 퇴직금 정적 페이지(public/tools/severance.html)용 Pretendard 조각 글꼴을 public/fonts/pretendard-subset/ 로 복사한다.
// Next 화면은 layout.tsx 가 npm 의 dynamic-subset CSS 를 import 하지만, 정적 html 은 그 경로를 쓸 수 없다.
// 저장소에는 올리지 않는다(.gitignore). CDN 대신 같은 출처에서 받는다(DESIGN.md §4.1).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const req = createRequire(import.meta.url);
const web = join(dirname(req.resolve('pretendard/package.json')), 'dist/web/variable');
const out = 'public/fonts/pretendard-subset';

mkdirSync(join(out, 'woff2-dynamic-subset'), { recursive: true });
// CSS 는 ./woff2-dynamic-subset/… 상대 경로를 쓰므로 폴더 구조를 그대로 둔다.
copyFileSync(join(web, 'pretendardvariable-dynamic-subset.css'), join(out, 'pretendardvariable-dynamic-subset.css'));
let n = 0;
for (const f of readdirSync(join(web, 'woff2-dynamic-subset'))) {
  if (!f.endsWith('.woff2')) continue;
  copyFileSync(join(web, 'woff2-dynamic-subset', f), join(out, 'woff2-dynamic-subset', f));
  n++;
}
console.log(`Pretendard 조각 ${n}개 → ${out}`);
