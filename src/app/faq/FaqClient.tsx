'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, ChevronDown, ChevronRight, MessageCircleQuestion, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CATEGORY_GROUPS, categoryToSlug, type FaqCategory } from '@/lib/faq-categories';

interface FaqItem {
  id: number;
  unified_category: string;
  question: string;
  answer: string;
}

interface CategoryCount {
  unified_category: string;
  count: number;
}

interface FaqClientProps {
  initialFaqs: FaqItem[];
  categoryCounts: CategoryCount[];
  totalCount: number;
  initialCategory?: string;
}

const PAGE_SIZE = 20;

export default function FaqClient({ initialFaqs, categoryCounts, totalCount, initialCategory }: FaqClientProps) {
  const [faqs, setFaqs] = useState(initialFaqs);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(totalCount);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countMap = Object.fromEntries(categoryCounts.map((c) => [c.unified_category, c.count]));
  const totalFaqCount = categoryCounts.reduce((sum, c) => sum + c.count, 0);

  const fetchFaqs = useCallback(async (cat: string | null, query: string, pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (query) params.set('q', query);
      params.set('page', String(pageNum));
      params.set('size', String(PAGE_SIZE));
      const res = await fetch(`/api/faq?${params}`);
      const data = await res.json();
      setFaqs(data.faqs);
      setTotal(data.total);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCategoryChange = useCallback((cat: string | null) => {
    setActiveCategory(cat);
    setPage(1);
    setExpandedId(null);
    fetchFaqs(cat, searchQuery, 1);
  }, [searchQuery, fetchFaqs]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      fetchFaqs(activeCategory, q, 1);
    }, 400);
  }, [activeCategory, fetchFaqs]);

  const handlePage = useCallback((p: number) => {
    setPage(p);
    setExpandedId(null);
    fetchFaqs(activeCategory, searchQuery, p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategory, searchQuery, fetchFaqs]);

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircleQuestion size={24} style={{ color: 'var(--color-accent)' }} />
        <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
          노동법 FAQ
        </h1>
        <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
          {totalFaqCount.toLocaleString()}건
        </span>
      </div>
      <p className="mb-8 text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
        임금, 해고, 근로시간, 퇴직금 등 33개 카테고리별 노동법 FAQ를 검색하고 확인하세요.
      </p>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
            <button
              onClick={() => handleCategoryChange(null)}
              className="mb-3 w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
              style={{
                backgroundColor: !activeCategory ? 'var(--color-accent)' : 'transparent',
                color: !activeCategory ? 'white' : 'var(--color-text-primary)',
              }}
            >
              전체 ({totalFaqCount.toLocaleString()})
            </button>

            {Object.entries(CATEGORY_GROUPS).map(([group, cats]) => {
              const groupCount = cats.reduce((s, c) => s + (countMap[c] || 0), 0);
              if (groupCount === 0) return null;
              const isOpen = expandedGroups[group] ?? true;
              return (
                <div key={group} className="mb-1">
                  <button
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group]: !isOpen }))}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
                    style={{ color: 'var(--grey-400)' }}
                  >
                    {group}
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {isOpen && cats.map((cat) => {
                    const cnt = countMap[cat] || 0;
                    if (cnt === 0) return null;
                    return (
                      <button
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className="w-full rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors"
                        style={{
                          backgroundColor: activeCategory === cat ? 'var(--color-accent)' : 'transparent',
                          color: activeCategory === cat ? 'white' : 'var(--color-text-secondary)',
                          fontWeight: activeCategory === cat ? 600 : 400,
                        }}
                      >
                        {cat} <span style={{ opacity: 0.6 }}>({cnt.toLocaleString()})</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Mobile category pills */}
        <div className="flex flex-wrap gap-1.5 lg:hidden mb-4">
          <button
            onClick={() => handleCategoryChange(null)}
            className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
            style={!activeCategory
              ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }
              : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)', borderColor: 'var(--color-border)' }
            }
          >
            전체
          </button>
          {categoryCounts.map(({ unified_category: cat, count }) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
              style={activeCategory === cat
                ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }
                : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)', borderColor: 'var(--color-border)' }
              }
            >
              {cat} ({count})
            </button>
          ))}
        </div>

        {/* Main content */}
        <div>
          {/* Search */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="질문 또는 답변 내용으로 검색..."
              aria-label="FAQ 검색"
              className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
            />
          </div>

          {/* Active category heading */}
          {activeCategory && (
            <div className="mb-4 flex items-center gap-2">
              <button onClick={() => handleCategoryChange(null)} className="text-sm" style={{ color: 'var(--color-accent)' }}>
                <ArrowLeft size={14} className="inline" /> 전체
              </button>
              <span style={{ color: 'var(--grey-300)' }}>/</span>
              <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{activeCategory}</h2>
              <span className="text-sm" style={{ color: 'var(--grey-500)' }}>({total}건)</span>
            </div>
          )}

          {/* Results */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="h-4 w-3/4 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
                </div>
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <div className="py-16 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className="rounded-xl border overflow-hidden transition-colors"
                  style={{ borderColor: expandedId === faq.id ? 'var(--color-accent)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
                >
                  <button
                    onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                    className="flex w-full items-start gap-3 p-5 text-left"
                  >
                    <span className="mt-0.5 shrink-0 text-sm font-bold" style={{ color: 'var(--color-accent)' }}>Q</span>
                    <div className="flex-1">
                      <div className="text-[14px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {faq.question}
                      </div>
                      {!activeCategory && (
                        <Link
                          href={`/faq/${categoryToSlug(faq.unified_category)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium hover:underline"
                          style={{ backgroundColor: 'var(--blue-50)', color: 'var(--blue-600)' }}
                        >
                          {faq.unified_category}
                        </Link>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      className="mt-0.5 shrink-0 transition-transform"
                      style={{ color: 'var(--grey-400)', transform: expandedId === faq.id ? 'rotate(180deg)' : undefined }}
                    />
                  </button>
                  {expandedId === faq.id && (
                    <div className="border-t px-5 py-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--grey-50)' }}>
                      <div className="flex gap-3">
                        <span className="mt-0.5 shrink-0 text-sm font-bold" style={{ color: '#059669' }}>A</span>
                        <div className="whitespace-pre-line text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {faq.answer}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => handlePage(page - 1)}
                className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                이전
              </button>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => handlePage(page + 1)}
                className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
                style={{ borderColor: 'var(--color-border)' }}
              >
                다음
              </button>
            </div>
          )}

          {/* CTA */}
          <div className="mt-10 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--blue-50)' }}>
            <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              찾으시는 답변이 없으신가요?
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/ai" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
                AI에게 질문하기
              </Link>
              <Link href="/contact" className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>
                전문가 상담
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
