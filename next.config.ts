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
