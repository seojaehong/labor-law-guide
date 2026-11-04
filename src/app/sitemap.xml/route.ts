import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { getSitemapLayout } from '@/lib/sitemap-config';

export const revalidate = 3600;

// 청크 수 계산은 src/lib/sitemap-config.ts 한 곳에서만 한다.
// 이 파일이 자체 조건을 들고 있던 탓에 /sitemap/[id] 와 어긋나
// 실재하는 /sitemap/53.xml(240건)이 인덱스에서 빠져 있었다.
// 🔴 2026-11-04. 청크가 하나뿐이면 **색인 파일을 쓰지 않고 바로 urlset 을 돌려준다.**
//   지금 판정례·판례를 사이트맵에서 빼 둔 탓에 청크가 0.xml 하나뿐이고,
//   그래서 /sitemap.xml 안에 <loc> 가 **한 줄만** 들어 있었다.
//   네이버 서치어드바이저는 색인 파일을 제대로 못 읽는 경우가 있고,
//   GSC 도 이 주소를 「제출 0」으로 잡고 있다. 자식이 하나면 색인 파일을 둘 이유가 없다.
//   청크가 둘 이상으로 늘면(SITEMAP_CASELAW=on 등) 종전대로 색인 파일을 돌려준다.
export async function GET() {
  const { total } = await getSitemapLayout();

  if (total === 1) {
    const upstream = await fetch(`${SITE_URL}/sitemap/0.xml`, {
      next: { revalidate: 3600 },
    });
    if (upstream.ok) {
      const body = await upstream.text();
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });
    }
    // 가져오지 못하면 종전대로 색인 파일을 돌려준다 — 빈 응답을 주지 않는다
  }

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
