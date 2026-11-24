import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// globals.css 의 :root·.dark 토큰을 읽어 실제 값으로 대비를 잰다(261124 전역 다듬기).
const css = readFileSync('src/app/globals.css', 'utf8');

function block(selector: string): Record<string, string> {
  const re = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([\\s\\S]*?)\\n\\}`);
  const body = re.exec(css)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const ROOT = block(':root');
const DARK = block('.dark');

function resolve(name: string, theme: 'light' | 'dark', depth = 0): string {
  if (depth > 10) throw new Error('var 순환: ' + name);
  const v = (theme === 'dark' ? DARK[name] : undefined) ?? ROOT[name];
  if (!v) throw new Error('토큰 없음: ' + name);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(ref[1], theme, depth + 1) : v;
}
function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error('hex 아님: ' + hex);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const THEMES = ['light', 'dark'] as const;

describe('글 강조 상자(blog-callout) — 테마 토큰', () => {
  const rule = /\.blog-content \.blog-callout\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
  it('배경·글자를 토큰으로 쓴다', () => {
    expect(rule).toMatch(/background(-color)?:\s*var\(--grey-100\)/);
    expect(rule).toMatch(/color:\s*var\(--color-text-primary\)/);
  });
  it.each(THEMES)('%s: 상자 안 본문·소제목(blog-strong)·보조 글자 대비 ≥ 4.5:1', (t) => {
    const bg = resolve('--grey-100', t);
    expect(ratio(resolve('--color-text-primary', t), bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(resolve('--grey-900', t), bg)).toBeGreaterThanOrEqual(4.5); // .blog-strong
    expect(ratio(resolve('--color-text-secondary', t), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('입력칸 테두리 — 비텍스트 대비 3:1', () => {
  it.each(THEMES)('%s: --color-control-border 가 바탕·표면·띄운 표면 모두에 3:1 이상', (t) => {
    const border = resolve('--color-control-border', t);
    for (const s of ['--color-bg-primary', '--color-bg-surface', '--color-bg-elevated']) {
      expect(ratio(border, resolve(s, t)), `${t} ${s}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('입력 요소가 자기 --color-border·--border 를 입력 테두리 토큰으로 바꿔 끼운다(inline borderColor 도 따라온다)', () => {
    const rule = /:where\(input[^{]*\)\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('--color-border: var(--color-control-border)');
    expect(rule).toContain('--border: var(--color-control-border)');
  });
});

describe('다크 회색 램프 — 남색 잔재 없음', () => {
  it('다크 --grey-50…900 은 파랑이 초록보다 크지 않다(올리브 계열)', () => {
    for (const n of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      const [, g, b] = rgb(resolve(`--grey-${n}`, 'dark'));
      expect(b, `--grey-${n}`).toBeLessThanOrEqual(g);
    }
  });
  it('다크 --color-text-tertiary 도 올리브 계열이고 바탕 위 4.5:1', () => {
    const v = resolve('--color-text-tertiary', 'dark');
    const [, g, b] = rgb(v);
    expect(b).toBeLessThanOrEqual(g);
    expect(ratio(v, resolve('--color-bg-primary', 'dark'))).toBeGreaterThanOrEqual(4.5);
  });
  it('#1e2530·#191f28·#2a3140 이 토큰 값으로 남아 있지 않다', () => {
    const vals = Object.values(DARK).join(' ').toLowerCase();
    for (const navy of ['#1e2530', '#191f28', '#2a3140', '#3a4250']) expect(vals).not.toContain(navy);
  });
});

describe('제목 조판 — 웨이트 700·자간 -0.02em 상한(DESIGN.md §4.3)', () => {
  it('globals.css 에 -0.02em 보다 좁은 자간이 없다', () => {
    for (const m of css.matchAll(/letter-spacing:\s*(-?[0-9.]+)em/g)) {
      expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(-0.02);
    }
  });
  it('globals.css 에 700 을 넘는 font-weight 가 없다', () => {
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g)) expect(Number(m[1]), m[0]).toBeLessThanOrEqual(700);
  });
});

describe('Pretendard — 한글 분할(unicode-range) 자체 호스팅', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  it('layout 이 공식 dynamic-subset CSS 를 site-refactor.css 뒤에 불러온다', () => {
    const subset = layout.indexOf("pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css");
    expect(subset).toBeGreaterThan(-1);
    expect(subset).toBeGreaterThan(layout.indexOf('site-refactor.css'));
  });
  // 범위 없는 원본 면이 하나라도 남으면 Firefox(모든 화면)·WebKit(이모지 든 글)이 원본 2,010KB 를 조각과 함께 받는다(261124 실측).
  it('공용 CSS 에 범위 없는 2MB 원본 Pretendard @font-face 가 남아 있지 않다', () => {
    for (const f of ['src/app/globals.css', 'src/components/site-refactor.css']) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        if (/Pretendard/.test(m[1])) expect(m[1], f).toMatch(/unicode-range/);
      }
    }
  });
});
