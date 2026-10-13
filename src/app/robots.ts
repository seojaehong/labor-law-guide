import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/constants';

// 🔴 2026-10-11 — `/_next/` 를 통째로 막으면 **구글이 화면을 그리지 못한다.**
// 이 사이트는 Next.js 라서 본문 렌더링에 /_next/static/chunks/*.js 와 css 가 필요한데,
// 종전 규칙은 그걸 크롤러에게 금지했다. 파일 자체는 200 으로 열려 있어(실측) 사람은 멀쩡히 보지만
// 크롤러만 못 가져간다 — 「크롤링됨 - 색인 생성되지 않음」이 쌓이는 전형적인 원인이다.
// 그래서 정적 자산만 명시적으로 연다. robots.txt 는 **더 긴 경로가 이긴다**(구글 규칙).
//   /_next/static/  (14자, allow)  >  /_next/  (7자, disallow)
// 데이터 라우트(/_next/data/ 등)는 종전대로 막힌 채로 남는다.
const NEXT_ASSETS = ['/_next/static/', '/_next/image'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', ...NEXT_ASSETS],
        disallow: ['/api/', '/_next/', '/admin/'],
      },
      // 네이버 Yeti. 이미 위의 '*' 규칙으로 허용되고 있어 **차단된 적은 없다**.
      // 명시하는 이유는 신호를 분명히 하려는 것뿐이다 — 기능상 변화는 없다.
      // 2026-10-01 실측에서 네이버가 유일하게 작동하는 검색 채널이었다(/ ·/blog ·/cases ·/decisions 노출).
      { userAgent: 'Yeti', allow: ['/', ...NEXT_ASSETS], disallow: ['/api/', '/_next/', '/admin/'] },
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
