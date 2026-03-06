'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  published_at: string;
  url: string;
  summary: string;
  keywords_matched: string[];
}

const PAGE_SIZE = 20;

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchNews = useCallback(async (p: number) => {
    setLoading(true);
    const offset = (p - 1) * PAGE_SIZE;
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('published_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE);

    if (!error && data) {
      setHasMore(data.length > PAGE_SIZE);
      setNews(data.slice(0, PAGE_SIZE) as NewsItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNews(1);
  }, [fetchNews]);

  const handlePage = (p: number) => {
    setPage(p);
    fetchNews(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <div className="flex items-center gap-2">
        <Newspaper size={24} style={{ color: 'var(--color-accent)' }} />
        <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
          최신 뉴스
        </h1>
      </div>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        노동조합법·노란봉투법 관련 최신 뉴스를 매일 업데이트합니다.
      </p>

      <div className="mt-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>불러오는 중...</span>
          </div>
        )}

        {!loading && news.length === 0 && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            뉴스가 없습니다.
          </div>
        )}

        {!loading && news.length > 0 && (
          <div className="space-y-3">
            {news.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border p-4 transition-shadow hover:shadow-md"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md px-2 py-0.5 font-medium" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                    {item.source || '뉴스'}
                  </span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{item.published_at?.slice(0, 10)}</span>
                  <ExternalLink size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                </div>
                <h3 className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.summary.slice(0, 200)}{item.summary.length > 200 ? '...' : ''}
                  </p>
                )}
                {item.keywords_matched && item.keywords_matched.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.keywords_matched.slice(0, 5).map((kw) => (
                      <span key={kw} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {!loading && news.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)' }}
            >
              이전
            </button>
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {page} 페이지
            </span>
            <button
              disabled={!hasMore}
              onClick={() => handlePage(page + 1)}
              className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)' }}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
