import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/', '/admin/'],
      },
      // 네이버 Yeti. 이미 위의 '*' 규칙으로 허용되고 있어 **차단된 적은 없다**.
      // 명시하는 이유는 신호를 분명히 하려는 것뿐이다 — 기능상 변화는 없다.
      // 2026-10-01 실측에서 네이버가 유일하게 작동하는 검색 채널이었다(/ ·/blog ·/cases ·/decisions 노출).
      { userAgent: 'Yeti', allow: '/', disallow: ['/api/', '/_next/', '/admin/'] },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
      { userAgent: 'cohere-ai', allow: '/' },
      { userAgent: 'Bytespider', disallow: '/' },
      { userAgent: 'CCBot', disallow: '/' },
      { userAgent: 'SemrushBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
