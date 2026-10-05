import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
vi.mock('next/og', () => ({ ImageResponse: class {
  html: string;
  constructor(element: Parameters<typeof renderToStaticMarkup>[0]) { this.html = renderToStaticMarkup(element); }
} }));
import { shareCard } from '@/lib/share-card';
const original = readFileSync('public/brand/work-patterns-wordmark-original.svg', 'utf8');
const proposal = readFileSync('public/brand/work-patterns-wordmark-ink.svg', 'utf8');
async function logo(options: Parameters<typeof shareCard>[0]) {
  const image = await shareCard(options) as unknown as { html: string };
  const src = image.html.match(/<img[^>]*src="([^"]+)"/)![1];
  return Buffer.from(src.split(',')[1], 'base64').toString('utf8');
}
describe('approved original wordmark default', () => {
  it('uses the exact original outlines for general and content share cards', async () => {
    expect(await logo({ title: '일의 무늬' })).toBe(original);
    expect(await logo({ title: '법령 콘텐츠 제목' })).toBe(original);
  });
  it('retains the rejected proposal only when explicitly requested for comparison', async () => {
    expect(await logo({ title: '일의 무늬', wordmark: 'proposal' })).toBe(proposal);
  });
  it('uses original header paths with only a dark-theme fill change', () => {
    const nav = readFileSync('src/components/GlassNav.tsx', 'utf8');
    expect(nav).toContain('/brand/work-patterns-wordmark-original.svg');
    expect(nav).toContain('/brand/work-patterns-wordmark-original-dark.svg');
    expect(nav).not.toContain('/brand/work-patterns-wordmark-ink.svg');
    const dark = readFileSync('public/brand/work-patterns-wordmark-original-dark.svg', 'utf8');
    expect(dark.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="INK"')).toBe(original.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="INK"'));
  });
});
