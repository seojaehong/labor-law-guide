import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { getSitemapLayout } from '@/lib/sitemap-config';

export const revalidate = 3600;

// 청크 수 계산은 src/lib/sitemap-config.ts 한 곳에서만 한다.
// 이 파일이 자체 조건을 들고 있던 탓에 /sitemap/[id] 와 어긋나
// 실재하는 /sitemap/53.xml(240건)이 인덱스에서 빠져 있었다.
export async function GET() {
  const { total } = await getSitemapLayout();

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
