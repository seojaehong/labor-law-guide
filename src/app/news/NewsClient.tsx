'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, Loader2, Search, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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

interface Briefing {
  date: string;
  title: string;
  content: string;
  news_count: number;
  top_keywords: string[];
  created_at?: string;
}

interface NewsClientProps {
  initialNews: NewsItem[];
  initialTotalCount: number;
  initialBriefing: Briefing | null;
  initialLastUpdated: string | null;
}

const PAGE_SIZE = 20;

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 style="font-weight:700;font-size:14px;margin:12px 0 4px;color:var(--color-text-primary)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-weight:700;font-size:15px;margin:14px 0 6px;color:var(--color-text-primary)">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--color-text-primary)">$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:16px;list-style:disc;margin-bottom:2px">$1</li>')
    .replace(/\n\n/g, '<br/>')
    .replace(/\n/g, ' ');
}

const KEYWORD_CHIPS = [
  '노란봉투법', '노조법', '단체교섭', '부당노동행위', '파업',
  '손해배상', '가압류', '노동위원회', '쟁의행위', '원청',
  '하청', '파견', '도급', '노동조합',
];

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex gap-2 mb-2">
        <div className="h-5 w-16 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
        <div className="h-5 w-12 rounded-md" style={{ backgroundColor: 'var(--grey-100)' }} />
      </div>
      <div className="h-5 w-3/4 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="mt-2 h-4 w-full rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="mt-1 h-4 w-2/3 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
    </div>
  );
}

function formatLastUpdated(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

export default function NewsClient({ initialNews, initialTotalCount, initialBriefing, initialLastUpdated }: NewsClientProps) {
  const [news, setNews] = useState<NewsItem[]>(initialNews);
  const [briefing, setBriefing] = useState<Briefing | null>(initialBriefing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialNews.length >= PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialLastUpdated);

  const [briefingDates, setBriefingDates] = useState<string[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // 브리핑 날짜 목록 로드 + ISR 폴백
  useEffect(() => {
    supabase
      .from('news_briefings')
      .select('date')
      .order('date', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const dates = data.map((d) => d.date);
          setBriefingDates(dates);
          // ISR 캐시에 브리핑 없으면 최신 브리핑 로드
          if (!briefing && dates.length > 0) {
            fetchBriefing(dates[0]);
          }
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBriefing = async (date: string) => {
    setBriefingLoading(true);
    const { data } = await supabase
      .from('news_briefings')
      .select('*')
      .eq('date', date)
      .single();
    if (data) setBriefing(data as Briefing);
    setBriefingLoading(false);
  };

  const navigateBriefing = (direction: 'prev' | 'next') => {
    if (!briefing || briefingDates.length === 0) return;
    const idx = briefingDates.indexOf(briefing.date);
    const nextIdx = direction === 'prev' ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < briefingDates.length) {
      fetchBriefing(briefingDates[nextIdx]);
    }
  };

  const fetchNews = useCallback(async (p: number, q: string, keyword: string) => {
    setLoading(true);
    setError(null);
    const offset = (p - 1) * PAGE_SIZE;

    try {
      let query = supabase
        .from('news')
        .select('*', { count: 'exact' })
        .order('published_at', { ascending: false });

      if (q.trim()) {
        const pattern = `%${q.trim()}%`;
        query = query.or(`title.ilike.${pattern},summary.ilike.${pattern}`);
      }

      if (keyword) {
        query = query.contains('keywords_matched', [keyword]);
      }

      const { data, error: fetchError, count } = await query.range(offset, offset + PAGE_SIZE);

      if (fetchError) throw fetchError;

      if (data) {
        setHasMore(data.length > PAGE_SIZE);
        setNews(data.slice(0, PAGE_SIZE) as NewsItem[]);
        if (count !== null) setTotalCount(count);
        if (p === 1 && data.length > 0) {
          setLastUpdated(data[0].published_at);
        }
      }
    } catch (e) {
      setError('뉴스를 불러오지 못했습니다.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchQuery);
    setActiveKeyword('');
    fetchNews(1, searchQuery, '');
  };

  const handleKeywordClick = (kw: string) => {
    const next = activeKeyword === kw ? '' : kw;
    setActiveKeyword(next);
    setPage(1);
    setSearchQuery('');
    setActiveQuery('');
    fetchNews(1, '', next);
  };

  const handlePage = (p: number) => {
    setPage(p);
    fetchNews(p, activeQuery, activeKeyword);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRetry = () => {
    setError(null);
    fetchNews(page, activeQuery, activeKeyword);
  };

  const relativeDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff < 7) return `${diff}일 전`;
    return dateStr.slice(0, 10);
  };

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-10">
      <div className="flex items-center gap-2">
        <Newspaper size={24} style={{ color: 'var(--color-accent)' }} />
        <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
          최신 뉴스
        </h1>
        {totalCount > 0 && (
          <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
            {totalCount.toLocaleString()}건
          </span>
        )}
      </div>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        노동조합법·노란봉투법 관련 최신 뉴스를 매일 자동 업데이트합니다.
      </p>
      {lastUpdated && (
        <p className="mt-1 text-[12px]" style={{ color: 'var(--color-text-tertiary)' }}>
          최종 업데이트: {formatLastUpdated(lastUpdated)}
        </p>
      )}

      {/* 노동 브리핑 */}
      {briefing && (
        <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: 'var(--color-accent)', backgroundColor: 'color-mix(in srgb, var(--color-accent) 5%, var(--color-bg-surface))' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                노동 브리핑
              </h2>
              <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
                {briefing.news_count}건 종합
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateBriefing('prev')}
                disabled={briefingLoading || briefingDates.indexOf(briefing.date) >= briefingDates.length - 1}
                className="rounded-lg p-1.5 transition-colors hover:bg-[var(--grey-100)] disabled:opacity-30"
                title="이전 브리핑"
              >
                <ChevronLeft size={16} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
              <span className="text-[13px] font-medium min-w-[90px] text-center" style={{ color: 'var(--color-text-secondary)' }}>
                {briefing.date}
              </span>
              <button
                onClick={() => navigateBriefing('next')}
                disabled={briefingLoading || briefingDates.indexOf(briefing.date) <= 0}
                className="rounded-lg p-1.5 transition-colors hover:bg-[var(--grey-100)] disabled:opacity-30"
                title="다음 브리핑"
              >
                <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
            </div>
          </div>
          {briefingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            </div>
          ) : (
            <>
              <div
                className="briefing-content text-[14px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(briefing.content || '') }}
              />
              {briefing.top_keywords && briefing.top_keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                  {briefing.top_keywords.map((kw) => (
                    <span key={kw} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
                      #{kw}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 검색바 */}
      <form onSubmit={handleSearch} className="mt-5">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="뉴스 검색..."
            className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-[var(--color-accent)]"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
          />
        </div>
      </form>

      {/* 키워드 필터 칩 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {KEYWORD_CHIPS.map((kw) => (
          <button
            key={kw}
            onClick={() => handleKeywordClick(kw)}
            className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors border"
            style={activeKeyword === kw
              ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }
              : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)', borderColor: 'var(--color-border)' }
            }
          >
            {kw}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {/* 에러 fallback */}
        {error && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <RefreshCw size={14} />
              다시 시도
            </button>
          </div>
        )}

        {/* 스켈레톤 로딩 */}
        {loading && !error && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && !error && news.length === 0 && (
          <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            {activeQuery || activeKeyword ? '검색 결과가 없습니다.' : '뉴스가 없습니다.'}
          </div>
        )}

        {!loading && !error && news.length > 0 && (
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
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{relativeDate(item.published_at)}</span>
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
        {!loading && !error && news.length > 0 && (
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
              {page} / {Math.ceil((totalCount || 1) / PAGE_SIZE)} 페이지
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
