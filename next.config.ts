import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async rewrites() {
    const DECISIONS_HOST = process.env.DECISIONS_HOST || 'https://labor-decisions-search.vercel.app';
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
      // labor-decisions-search 라우트 메인 도메인 프록시 (#45)
      { source: '/sanction', destination: `${DECISIONS_HOST}/sanction` },
      { source: '/sanction/:path*', destination: `${DECISIONS_HOST}/sanction/:path*` },
      { source: '/search', destination: `${DECISIONS_HOST}/search` },
      { source: '/search/:path*', destination: `${DECISIONS_HOST}/search/:path*` },
      { source: '/api/sanction', destination: `${DECISIONS_HOST}/api/sanction` },
      { source: '/api/sanction/:path*', destination: `${DECISIONS_HOST}/api/sanction/:path*` },
      { source: '/api/search', destination: `${DECISIONS_HOST}/api/search` },
      { source: '/api/search/:path*', destination: `${DECISIONS_HOST}/api/search/:path*` },
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
