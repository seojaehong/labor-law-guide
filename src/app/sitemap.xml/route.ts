import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

const CHUNK_SIZE = 10_000;

async function getTableCount(table: 'cases' | 'nlrc_decisions'): Promise<number> {
  const { count } = await supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function GET() {
  const [casesCount, decisionsCount] = await Promise.all([
    getTableCount('cases'),
    getTableCount('nlrc_decisions'),
  ]);

  const casesChunks = Math.max(1, Math.ceil(casesCount / CHUNK_SIZE));
  const decisionsChunks = Math.max(1, Math.ceil(decisionsCount / CHUNK_SIZE));
  const total = 1 + casesChunks + decisionsChunks;

  const entries = Array.from({ length: total }, (_, i) =>
    `  <sitemap><loc>${SITE_URL}/sitemap/${i}.xml</loc></sitemap>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
