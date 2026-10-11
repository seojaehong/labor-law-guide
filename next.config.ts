import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'react-markdown', 'remark-gfm'],
  },
  // 2026-09-12 — 검색 진입로 다섯을 /decisions 하나로 모았다.
  // /search 는 서버 렌더 본문이 240자뿐인 껍데기였고, /database 는 같은 일을 브라우저에서 했다.
  // 둘 다 영구 이동으로 넘긴다. **q 같은 질의 문자열은 Next 가 그대로 붙여 준다.**
  // /cases 는 남긴다 — 손으로 고른 핵심 판례 6건 요약이라 검색과 목적이 다르다.
  // /cases/:id · /decisions/:id · /interpretations/:id 상세는 건드리지 않는다(사이트맵에 실린 주소다).
  // 2026-10-11 — 옛 `?category=` 를 현재 `?reason=` 으로 옮긴다.
  // GSC 가 아직 긁고 있는 옛 주소 10개를 받아 확인했다(9/25~9/28 크롤).
  //   https://www.노란봉투법.com/search?category=sexual-harassment …
  // 종전에는 `/search` → `/decisions` 로만 넘겨서 **쿼리가 `category=` 인 채 그대로 따라붙었다.**
  // `/decisions` 는 `reason=` 만 읽으므로 그 값이 무시되고 **필터가 통째로 날아갔다**(실측:
  // /search?category=discrimination → /decisions?category=discrimination → 200, 전체 목록).
  //
  // 🔴 이름을 짐작해서 일괄 치환하지 않았다. src/lib/types.ts 의 REASON_LABELS 와 하나씩 대조했다.
  //   sexual-harassment      → sexual_harassment (성희롱)
  //   renewal-expectation    → contract_expiry   (갱신기대권/계약만료)
  //   management-dismissal   → redundancy        (경영상해고)
  //   dismissal-nonexistence → no_dismissal      (해고부존재/사직)
  //   misconduct · probation · embezzlement · discrimination 은 이름이 같다
  // 대응하는 reason 이 **없는 둘**(retirement · industrial-accident)은 억지로 끼워 맞추지 않고
  // 필터 없는 /decisions 허브로 보낸다. 홈으로 보내지 않는다 — 목적이 가장 가까운 곳이 허브다.
  async redirects() {
    const CATEGORY_TO_REASON: Record<string, string> = {
      'sexual-harassment': 'sexual_harassment',
      'renewal-expectation': 'contract_expiry',
      'management-dismissal': 'redundancy',
      'dismissal-nonexistence': 'no_dismissal',
      misconduct: 'misconduct',
      probation: 'probation',
      embezzlement: 'embezzlement',
      discrimination: 'discrimination',
    };
    const legacy = Object.entries(CATEGORY_TO_REASON).map(([category, reason]) => ({
      source: '/search',
      has: [{ type: 'query' as const, key: 'category', value: category }],
      destination: `/decisions?reason=${reason}`,
      permanent: true,
    }));
    return [
      // 구체적인 규칙이 먼저다. 아래 포괄 규칙이 위를 가리면 안 된다.
      ...legacy,
      { source: '/search', destination: '/decisions', permanent: true },
      { source: '/database', destination: '/decisions', permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: '/sitemap_index.xml', destination: '/sitemap.xml' },
      { source: '/wp-sitemap.xml', destination: '/sitemap.xml' },
      { source: '/mcp/server-card.json', destination: '/.well-known/mcp/server-card.json' },
      { source: '/agent-skills/index.json', destination: '/.well-known/agent-skills/index.json' },
      { source: '/agent-skills/:path*', destination: '/.well-known/agent-skills/:path*' },
      { source: '/api-catalog', destination: '/.well-known/api-catalog' },
      { source: '/openapi.json', destination: '/.well-known/openapi.json' },
      { source: '/oauth-authorization-server', destination: '/.well-known/oauth-authorization-server' },
      { source: '/oauth-protected-resource', destination: '/.well-known/oauth-protected-resource' },
      { source: '/agent-card.json', destination: '/.well-known/agent-card.json' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/api-catalog',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/oauth-authorization-server',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/oauth-protected-resource',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/.well-known/api-catalog',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/.well-known/oauth-authorization-server',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/.well-known/oauth-protected-resource',
        headers: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      },
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</.well-known/api-catalog>; rel="api-catalog", </.well-known/mcp/server-card.json>; rel="mcp-server", </.well-known/agent-card.json>; rel="agent-card", </llms.txt>; rel="llms-txt"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
