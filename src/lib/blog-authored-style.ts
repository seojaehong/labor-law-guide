import type { CSSProperties } from 'react';

// 글 본문(DB 마크다운)에 필자가 박아 둔 inline 색을 테마 토큰으로 옮긴다 — 261124.
// 라이트용 고정 배경(#f5f2ea 강조 상자, #fff·#fef2f2 표 행) 위에 다크 글자(밝은 잉크)가 얹혀
// 대비 1.01:1 이 났다. 배경·글자색만 바꾸고 여백·정렬 같은 나머지 서식은 그대로 둔다.

type Style = Record<string, string | number | undefined>;
export type ThemedStyle = { className?: string; style?: CSSProperties };

function parseHex(value: string): [number, number, number] | null {
  const m = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(value);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function lightness([r, g, b]: [number, number, number]) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

// 색 하나를 의미색 잉크 토큰으로 — 붉은·주황·초록 계열만 가르고 나머지는 본문 잉크.
function inkToken(value: string): string {
  const c = parseHex(value);
  if (!c) return value;
  const [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 40) return lightness(c) > 0.3 ? 'var(--color-text-secondary)' : 'var(--color-text-primary)';
  if (r === max && g < r * 0.4) return 'var(--color-danger-ink)';
  if (r === max) return 'var(--color-warn-ink)';
  if (g === max) return 'var(--color-success-ink)';
  return 'var(--color-info-ink)';
}

function background(style: Style): string | undefined {
  const v = style.background ?? style.backgroundColor;
  return typeof v === 'string' ? v : undefined;
}

function withoutKeys(style: Style, keys: string[]): Style {
  const out: Style = {};
  for (const [k, v] of Object.entries(style)) if (!keys.includes(k)) out[k] = v;
  return out;
}

const BORDER_KEYS = ['border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight', 'borderColor'];

function tokenizeBorders(style: Style): Style {
  const out: Style = { ...style };
  for (const k of BORDER_KEYS) {
    const v = out[k];
    if (typeof v === 'string' && parseHex(v)) out[k] = v.replace(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi, 'var(--color-border)');
  }
  return out;
}

const done = (className: string | undefined, style: Style): ThemedStyle => {
  const r: ThemedStyle = {};
  if (className) r.className = className;
  if (Object.keys(style).length) r.style = style as CSSProperties;
  return r;
};

// react-markdown 이 넘기는 props 에서 hast node 를 빼고 style 을 토큰화해 돌려준다(colSpan 등 나머지 속성은 유지).
export function themedProps<P extends { style?: CSSProperties; node?: unknown }>(tag: 'div' | 'tr' | 'td' | 'th', props: P) {
  const rest: Record<string, unknown> = { ...props };
  delete rest.node;
  delete rest.style;
  return { ...rest, ...themeAuthoredStyle(tag, props.style) } as Omit<P, 'node' | 'style'> & ThemedStyle;
}

export function themeAuthoredStyle(tag: 'div' | 'tr' | 'td' | 'th', style: CSSProperties | undefined): ThemedStyle {
  if (!style) return {};
  const s = style as Style;
  const bg = background(s);

  if (tag === 'div') {
    // 강조 상자는 모양까지 .blog-callout 이 맡는다(한쪽 막대 + 둥근 상자는 쓰지 않는다).
    if (!bg) return done(undefined, typeof s.color === 'string' ? { ...s, color: inkToken(s.color) } : s);
    return done('blog-callout', withoutKeys(s, ['background', 'backgroundColor', 'color', 'margin', 'padding', 'borderRadius', ...BORDER_KEYS]));
  }

  if (tag === 'tr') {
    const c = bg ? parseHex(bg) : null;
    if (!c) return done(undefined, s);
    // 진한 머리 행(흰 글자) — 두 테마에서 같은 대비라 그대로 두고, 칸 글자가 행 색을 따르게 한다.
    if (lightness(c) < 0.5) return done('blog-row-inverse', s);
    const [r, g, b] = c;
    // 붉은 기(#fef2f2) → 위험 틴트, 노란 기(#fef3c7) → 주의 틴트, 나머지(흰·회·옅은 초록·파랑) → 중립
    const row = r - Math.min(g, b) <= 8 ? 'blog-row-muted' : g - b > 20 ? 'blog-row-warn' : 'blog-row-danger';
    return done(row, withoutKeys(s, ['background', 'backgroundColor', 'color']));
  }

  // td·th — 글자색은 의미색 잉크로, 고정 테두리 색은 경계 토큰으로.
  const out = tokenizeBorders(withoutKeys(s, ['background', 'backgroundColor']));
  if (typeof s.color === 'string') out.color = inkToken(s.color);
  return done(undefined, out);
}
