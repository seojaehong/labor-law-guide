import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { AI_PACKAGES } from '@/content/ai-tools';

// /howto/* — 도구 안내 정적 페이지(261119). 두 페이지가 공통 디자인(howto.css·howto.js)을 함께 쓴다.
const PAGES = ['gov-login', 'k-labor'];
const read = (slug: string) => readFileSync(join(process.cwd(), 'public/howto', slug, 'index.html'), 'utf8');
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

describe('도구 안내 페이지', () => {
  it.each(PAGES)('%s — 공통 디자인 파일을 쓴다', (slug) => {
    const html = read(slug);
    expect(html).toContain('href="/howto/howto.css"');
    expect(html).toContain('src="/howto/howto.js"');
    expect(html).toContain(`<link rel="canonical" href="https://yellowenvelope.kr/howto/${slug}">`);
  });

  it.each(PAGES)('%s — 다른 도구 띠가 있고 자기 자신을 표시한다', (slug) => {
    const html = read(slug);
    for (const s of PAGES) expect(html).toContain(`href="/howto/${s}"`);
    expect(html).toContain(`<a href="/howto/${slug}" aria-current="page">`);
  });

  it.each(PAGES)('%s — 사이트 안 링크는 실제 주소다', (slug) => {
    const html = read(slug);
    const hrefs = [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]).filter((h) => h !== '/' && !h.startsWith('/howto/howto.'));
    for (const h of hrefs) {
      const ok = existsSync(join(process.cwd(), 'src/app', h, 'page.tsx')) || existsSync(join(process.cwd(), 'public', h, 'index.html'));
      expect(ok, h).toBe(true);
    }
  });

  it.each(PAGES)('%s — 목차의 #주소는 페이지 안에 있다', (slug) => {
    const html = read(slug);
    for (const [, id] of html.matchAll(/href="#([\w-]+)"/g)) expect(html, id).toContain(`id="${id}"`);
  });

  it.each(PAGES)('%s — 문구에 금지어가 없다', (slug) => {
    expect(bannedHits(text(read(slug)))).toEqual([]);
  });

  it('k-labor 묶음 키의 도구 수 합이 전체 47개·원격 25개와 맞는다', () => {
    const html = read('k-labor');
    const n = [...html.matchAll(/data-n="(\d+)"/g)].reduce((s, m) => s + Number(m[1]), 0);
    const r = [...html.matchAll(/data-r="(\d+)"/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(n).toBe(47);
    expect(r).toBe(AI_PACKAGES.find((p) => p.id === 'k-labor')!.remoteTools);
  });
});
