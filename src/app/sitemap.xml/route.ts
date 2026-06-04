import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

export const revalidate = 3600;

const CHUNK_SIZE = 1_000;

async function getTableCount(table: string, quality: boolean = false): Promise<number> {
  try {
    let q = supabaseServer.from(table).select('id', { count: 'exact', head: true });
    if (quality) {
      q = q.in('tier', ['standard', 'premium']).not('is_non_labor', 'is', true).gte('confidence_level', 0.8);
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  const [casesCount, decisionsCount, lawgoCount] = await Promise.all([
    getTableCount('cases'),
    getTableCount('nlrc_decisions', true),
    getTableCount('lawgo_precedents'),
  ]);

  const casesChunks = Math.max(1, Math.ceil(casesCount / CHUNK_SIZE));
  const decisionsChunks = Math.max(1, Math.ceil(decisionsCount / CHUNK_SIZE));
  const lawgoChunks = Math.max(1, Math.ceil(lawgoCount / CHUNK_SIZE));
  const total = 1 + casesChunks + decisionsChunks + lawgoChunks;

  const entries = Array.from({ length: total }, (_, i) =>
    `  <sitemap><loc>${SITE_URL}/sitemap/${i}.xml</loc></sitemap>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
