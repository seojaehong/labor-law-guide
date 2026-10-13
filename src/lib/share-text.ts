import { BRAND_DESCRIPTION, BRAND_NAME, SITE_URL } from '@/lib/constants';
export function shareText(value: string | null | undefined): string {
  return (value || '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, ' ').replace(/^[🎯📌]\s*/u, '').replace(/\s+/g, ' ').trim();
}
export function shortShareText(value: string | null | undefined, limit = 95): string {
  const text = shareText(value); return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
}
export function articleShare(article: { title: string; subtitle?: string | null; seo_description?: string | null; summary?: string | null }) {
  return { title: shareText(article.title), description: shortShareText(article.subtitle || article.seo_description || article.summary) || BRAND_DESCRIPTION };
}
export const GENERAL_SHARE = { title: BRAND_NAME, description: BRAND_DESCRIPTION, images: [{ url: SITE_URL + '/opengraph-image', width: 1200, height: 630, alt: BRAND_NAME }] };
export function pageShare(title: string, description: string, path: string) {
  const image = SITE_URL + '/og/page?title=' + encodeURIComponent(shareText(title)) + '&description=' + encodeURIComponent(shortShareText(description));
  return { title: shareText(title), description: shortShareText(description), url: SITE_URL + path, siteName: BRAND_NAME, images: [{ url: image, width: 1200, height: 630, alt: shareText(title) }] };
}
