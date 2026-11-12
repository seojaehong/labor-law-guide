import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 🔴 261112 — /tools/work-rules 의 canonical 이 홈 주소였다. 페이지가 alternates 를 안 적으면
// 루트 layout 의 `canonical: SITE_URL` 을 물려받아 「이 페이지는 홈의 사본」이라고 검색엔진에 알린 셈이다.
// 그래서 홈 canonical 은 홈 page.tsx 로 옮겼고, 공개 페이지는 제 canonical 을 직접 적는다.
// 이 시험은 소스만 본다. 실제 출력 대조는 빌드 뒤 정적 주소를 받아 확인했다(PR 본문).

const APP = 'src/app';

function pages(dir = APP): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'api' || e.name === 'admin') continue; // API · 관리자 화면(robots 차단)
      out.push(...pages(full));
    } else if (e.name === 'page.tsx') out.push(full);
  }
  return out;
}

const read = (f: string) => fs.readFileSync(f, 'utf8');
const NOINDEX = /index:\s*false|noindex/;

/** 페이지 자신과 루트를 뺀 조상 layout 들 — 메타데이터를 물려주는 쪽은 layout 뿐이다 */
function chain(page: string): string[] {
  const files = [page];
  let dir = path.dirname(page);
  while (path.normalize(dir) !== path.normalize(APP)) {
    const layout = path.join(dir, 'layout.tsx');
    if (fs.existsSync(layout)) files.push(layout);
    dir = path.dirname(dir);
  }
  return files;
}

describe('canonical 은 제 주소다', () => {
  it('루트 layout 은 canonical 을 적지 않는다 — 안 적은 페이지가 홈을 물려받는다', () => {
    const layout = read(path.join(APP, 'layout.tsx'));
    const meta = layout.slice(layout.indexOf('export const metadata'), layout.indexOf('export default'));
    expect(meta).not.toMatch(/canonical\s*:/);
  });

  it('홈은 page.tsx 에서 제 canonical 을 적는다', () => {
    expect(read(path.join(APP, 'page.tsx'))).toMatch(/canonical:\s*SITE_URL/);
  });

  it('색인되는 공개 페이지는 페이지나 layout 에 canonical 이 있다', () => {
    const missing = pages()
      .filter((p) => !chain(p).some((f) => NOINDEX.test(read(f))))
      .filter((p) => !chain(p).some((f) => /canonical\s*:/.test(read(f))))
      .map((p) => p.replace(/\\/g, '/'));
    expect(missing).toEqual([]);
  });

  it('취업규칙 점검은 제 주소를 canonical 로 적는다', () => {
    expect(read(path.join(APP, 'tools/work-rules/page.tsx'))).toContain('`${SITE_URL}/tools/work-rules`');
  });
});
