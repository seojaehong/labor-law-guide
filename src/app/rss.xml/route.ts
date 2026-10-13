import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * RSS 2.0 피드 — 네이버 서치어드바이저 'RSS 제출'용.
 *
 * 네이버는 사이트맵보다 RSS를 더 적극적으로 수집한다(신규 글 감지 속도가 다름).
 * 구글은 사이트맵 경로를 쓰므로 이 피드는 주로 네이버·피드리더 대상이다.
 *
 * 전체가 아니라 최신 50건만 싣는다 — RSS는 "새 글 알림" 용도이고,
 * 전체 목록은 sitemap이 담당한다.
 */
export const revalidate = 3600;

const FEED_SIZE = 50;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 본문/요약에서 태그를 걷어내고 한 줄 설명으로 다듬는다. */
function toDescription(summary: string | null, content: string | null): string {
  const raw = (summary && summary.trim()) || content || '';
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from('blog_articles')
    .select('slug, title, summary, content, category, author, published_at')
    .order('published_at', { ascending: false })
    .limit(FEED_SIZE);

  if (error) {
    console.error('rss fetch error:', error);
  }

  const articles = data || [];
  const lastBuild = articles[0]?.published_at
    ? new Date(articles[0].published_at).toUTCString()
    : new Date().toUTCString();

  const items = articles
    .map((a) => {
      const link = `${SITE_URL}/blog/${a.slug}`;
      const pubDate = a.published_at ? new Date(a.published_at).toUTCString() : lastBuild;
      return `    <item>
      <title>${escapeXml(a.title ?? '')}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(toDescription(a.summary, a.content))}</description>
      ${a.category ? `<category>${escapeXml(a.category)}</category>` : ''}
      ${a.author ? `<author>${escapeXml(a.author)}</author>` : ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>노란봉투법 가이드 — 노동 딥다이브</title>
    <link>${SITE_URL}/blog</link>
    <description>노동법·판례·행정해석을 공인노무사가 검수해 매일 정리합니다. 노란봉투법(개정 노동조합법) 해석지침, 판례분석, 실무가이드.</description>
    <language>ko</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
