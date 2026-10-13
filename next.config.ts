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
  async redirects() {
    return [
      // 🔴 `/search` 는 여기에 두지 않는다. **next.config 의 redirects 가 미들웨어보다 먼저 돈다.**
      // 여기 두면 미들웨어가 /search 를 보기도 전에 /decisions 로 넘어가,
      // 옛 `?category=` → `?reason=` 매핑이 영영 실행되지 않는다.
      // 그래서 /search 는 쿼리 유무와 무관하게 src/middleware.ts 가 전담한다.
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
