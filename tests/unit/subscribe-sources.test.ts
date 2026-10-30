// 구독 폼의 `source` 허용목록이 **화면이 실제로 보내는 값과 어긋나지 않는지** 본다.
//
// 🔴 2026-10-30. 어긋나 있었다. 컴포넌트 타입은 `decision-footer` 를 받는데 API 허용목록에는
//   없어서, 판례·행정해석 상세의 구독 폼이 400 「잘못된 source 값입니다」로 전부 거절됐다.
//   `subscribers` 에 그 source 가 0건인 게 증거다. **타입은 컴파일 때, 허용목록은 런타임에**
//   보므로 둘이 갈려도 빌드와 시험이 통과한다 — 그래서 소스를 읽어 대조한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUBSCRIBE_SOURCES, isSubscribeSource } from '@/lib/subscribe-sources';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** `<SubscribeForm source="…">` 를 쓰는 화면에서 그 값을 뽑는다 */
function sourcesUsedInPages(): { file: string; source: string }[] {
  const files = [
    'src/app/HomeClient.tsx',
    'src/app/blog/[slug]/page.tsx',
    'src/app/decisions/[id]/page.tsx',
  ];
  const found: { file: string; source: string }[] = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/<SubscribeForm\b[^>]*?\bsource="([^"]+)"/g)) {
      found.push({ file: f, source: m[1] });
    }
  }
  return found;
}

describe('구독 source 허용목록', () => {
  it('화면이 쓰는 source 가 전부 허용목록에 있다', () => {
    const used = sourcesUsedInPages();
    expect(used.length).toBeGreaterThanOrEqual(3);   // 홈·글·판례 셋은 반드시 잡혀야 한다
    const missing = used.filter(u => !isSubscribeSource(u.source));
    expect(missing).toEqual([]);
  });

  it('판례·행정해석 상세의 폼이 허용된다 — 2026-10-30 에 여기가 막혀 있었다', () => {
    expect(isSubscribeSource('decision-footer')).toBe(true);
    const used = sourcesUsedInPages().map(u => u.source);
    expect(used).toContain('decision-footer');
  });

  it('API 라우트가 목록을 다시 적지 않고 공용 판정을 쓴다', () => {
    const route = read('src/app/api/subscribers/route.ts');
    expect(route).toContain('isSubscribeSource');
    // 배열 리터럴을 다시 적으면 또 갈린다
    expect(route).not.toMatch(/\[\s*'article-footer'/);
  });

  it('컴포넌트가 목록을 다시 적지 않고 공용 타입을 쓴다', () => {
    const form = read('src/components/SubscribeForm.tsx');
    expect(form).toContain('SubscribeSource');
    expect(form).not.toMatch(/'article-footer'\s*\|/);
  });

  it('목록에 중복이 없다', () => {
    expect(new Set(SUBSCRIBE_SOURCES).size).toBe(SUBSCRIBE_SOURCES.length);
  });

  it('허용목록 밖 값과 비문자열을 거른다', () => {
    for (const v of ['', 'footer', 'home', 'HOME-BOTTOM', null, undefined, 7, {}]) {
      expect(isSubscribeSource(v)).toBe(false);
    }
  });
});
