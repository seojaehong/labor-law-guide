import { ImageResponse } from 'next/og';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'edge';
export const revalidate = 86400; // 1일 캐시

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const CATEGORY_STYLE: Record<string, { bg: string; accent: string; label: string }> = {
  뉴스해설:   { bg: '#FAF7EF', accent: '#B8451F', label: 'NEWS' },
  뉴스브리핑: { bg: '#FFF7ED', accent: '#9A3412', label: 'DAILY' },
  노동법:     { bg: '#F5F2EA', accent: '#2F5D43', label: 'LAW' },
  판례분석:   { bg: '#F4F1EA', accent: '#5B3FA6', label: 'CASE' },
  실무가이드: { bg: '#ECFDF5', accent: '#065F46', label: 'GUIDE' },
};

const DEFAULT_STYLE = { bg: '#F4F1EA', accent: '#181816', label: 'YELLOW ENVELOPE' };

async function getArticle(slug: string) {
  const { data } = await supabaseServer
    .from('blog_articles')
    .select('slug, title, subtitle, category')
    .eq('slug', slug)
    .maybeSingle();
  return data;
}

function cleanTitle(raw: string): string {
  // 🎯 prefix, 날짜 prefix 제거
  let t = raw.replace(/^🎯\s*/, '').replace(/^📌\s*/, '').replace(/^\[\d+년?\s*\d+월\s*\d+일?\]\s*노동뉴스\s*브리핑\s*[—-]\s*/, '').trim();
  if (t.length > 80) t = t.slice(0, 78) + '…';
  return t;
}

function cleanSubtitle(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.replace(/^🎯\s*/, '').trim();
  return t.length > 100 ? t.slice(0, 98) + '…' : t;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { slug } = await params;
  const article = await getArticle(slug);

  const category = article?.category || '';
  const style = CATEGORY_STYLE[category] || DEFAULT_STYLE;
  const titleText = article ? cleanTitle(article.title || '') : '노란봉투법 가이드';
  const subtitleText = article ? cleanSubtitle(article.subtitle) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: style.bg,
          padding: 64,
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top: category badge + brand */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: '8px 18px',
              borderRadius: 999,
              background: style.accent,
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {style.label}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 20,
              color: '#85807A',
              letterSpacing: 2,
              fontWeight: 600,
            }}
          >
            YELLOWENVELOPE.KR
          </div>
        </div>

        {/* Center: title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            paddingRight: 40,
          }}
        >
          <div
            style={{
              fontSize: titleText.length > 50 ? 52 : 60,
              fontWeight: 800,
              color: '#181816',
              lineHeight: 1.15,
              letterSpacing: -1,
              wordBreak: 'keep-all',
            }}
          >
            {titleText}
          </div>
          {subtitleText && (
            <div
              style={{
                marginTop: 24,
                fontSize: 26,
                fontWeight: 500,
                color: '#3C3A33',
                lineHeight: 1.4,
                letterSpacing: -0.5,
                wordBreak: 'keep-all',
              }}
            >
              {subtitleText}
            </div>
          )}
        </div>

        {/* Bottom: author */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `2px solid ${style.accent}`,
            paddingTop: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 22, color: '#181816', fontWeight: 700 }}>
              노무법인 위너스
            </div>
            <div style={{ fontSize: 16, color: '#85807A', marginTop: 4 }}>
              공인노무사 서재홍
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: style.accent,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {category || 'BLOG'}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
