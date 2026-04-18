import { SITE_URL } from '@/lib/constants';

export async function GET() {
  const body = `# 노란봉투법 가이드 — robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/

# AI Search & Assistant Bots — Allowed
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: cohere-ai
Allow: /

# Blocked Bots
User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: SemrushBot
Disallow: /

# Content Signals (contentsignals.org)
Content-Signal: ai-train=yes, search=yes, ai-input=yes

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
