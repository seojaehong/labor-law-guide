'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Search, ChevronLeft, ChevronRight, Calendar, Tag, LayoutGrid, List } from 'lucide-react';
import type { BlogArticle } from './page';
import { getCategoryColor } from '@/lib/category-colors';

interface BlogClientProps {
  initialArticles: BlogArticle[];
}

const CATEGORIES = [
  { value: 'all', label: '종합' },
  { value: '노동법', label: '노동법' },
  { value: '판례분석', label: '판례분석' },
  { value: '뉴스해설', label: '뉴스해설' },
  { value: '뉴스브리핑', label: '뉴스브리핑' },
  { value: '실무가이드', label: '실무가이드' },
];

const PAGE_SIZE = 12;

function formatDate(dateStr: string) {
  // timezone 차이로 인한 hydration mismatch 방지 — Date 객체 대신 문자열 직접 파싱
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  return dateStr.slice(0, 10).replace(/-/g, '.');
}

function CategoryBadge({ category }: { category: string }) {
  const color = getCategoryColor(category);
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {category === 'general' ? '일반' : category}
    </span>
  );
}

function SubtypeBadge({ subtype }: { subtype: string | null }) {
  if (!subtype) return null;
  const labelMap: Record<string, { label: string; bg: string; text: string }> = {
    'deep-dive': { label: '딥다이브', bg: '#fff7ed', text: '#c2410c' },
    // briefing subtype은 카테고리=뉴스브리핑으로 통합되어 사용 중단 (2026-04-29)
  };
  const info = labelMap[subtype];
  if (!info) return null;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: info.bg, color: info.text }}
    >
      {info.label}
    </span>
  );
}

function ArticleCard({ article }: { article: BlogArticle }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="feature-card flex flex-col rounded-2xl border bg-[var(--color-bg-surface)] p-6 transition-shadow hover:shadow-md"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <CategoryBadge category={article.category} />
        <SubtypeBadge subtype={article.subtype} />
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <Calendar size={10} />
          {formatDate(article.published_at)}
        </span>
      </div>

      <h2 className="text-[16px] font-bold leading-snug mb-1" style={{ color: 'var(--color-text-primary)' }}>
        {article.title}
      </h2>

      {article.subtitle && (
        <p className="text-[13px] font-medium mb-2" style={{ color: 'var(--color-accent)' }}>
          {article.subtitle}
        </p>
      )}

      {article.summary && (
        <p className="text-[13px] leading-relaxed flex-1" style={{ color: 'var(--color-text-secondary)' }}>
          {article.summary}
        </p>
      )}

      {article.tags && article.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <Tag size={10} style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }} />
          {article.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              #{tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function ArticleRow({ article }: { article: BlogArticle }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="grid grid-cols-[100px_minmax(0,1fr)_120px] sm:grid-cols-[110px_120px_minmax(0,1fr)_140px] items-center gap-3 border-b py-3 px-2 transition-colors hover:bg-[var(--grey-50)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span className="text-[12px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
        {formatDate(article.published_at)}
      </span>
      <div className="hidden sm:block">
        <CategoryBadge category={article.category} />
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {article.title}
        </h3>
        {article.subtitle && (
          <p className="truncate text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            {article.subtitle}
          </p>
        )}
      </div>
      <div className="hidden sm:flex flex-wrap gap-1 justify-end overflow-hidden">
        {article.tags?.slice(0, 2).map((tag) => (
          <span key={tag} className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
            #{tag}
          </span>
        ))}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border p-6 animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
      <div className="flex gap-2 mb-3">
        <div className="h-5 w-16 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} />
        <div className="h-5 w-20 rounded-full" style={{ backgroundColor: 'var(--grey-100)' }} />
      </div>
      <div className="h-5 w-3/4 rounded mb-2" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="h-4 w-full rounded mb-1" style={{ backgroundColor: 'var(--grey-100)' }} />
      <div className="h-4 w-2/3 rounded" style={{ backgroundColor: 'var(--grey-100)' }} />
    </div>
  );
}

export default function BlogClient({ initialArticles }: BlogClientProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeSubtype, setActiveSubtype] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('blog_view_mode') : null;
    if (saved === 'list' || saved === 'card') setViewMode(saved);
  }, []);

  const handleViewMode = (mode: 'card' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') window.localStorage.setItem('blog_view_mode', mode);
  };

  const filtered = useMemo(() => {
    let result = initialArticles;

    if (activeCategory !== 'all') {
      result = result.filter((a) => a.category === activeCategory);
    }

    if (activeSubtype) {
      result = result.filter((a) => a.subtype === activeSubtype);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.subtitle?.toLowerCase().includes(q) ?? false) ||
          (a.summary?.toLowerCase().includes(q) ?? false)
      );
    }

    return result;
  }, [initialArticles, activeCategory, activeSubtype, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setActiveSubtype(null);
    setPage(1);
  };

  const handleSubtypeChange = (sub: string | null) => {
    setActiveSubtype(sub);
    setPage(1);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  const handlePage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={24} style={{ color: 'var(--color-accent)' }} />
          <h1 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--color-text-primary)' }}>
            노동 딥다이브
          </h1>
          {initialArticles.length > 0 && (
            <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--grey-100)', color: 'var(--grey-600)' }}>
              {initialArticles.length}편
            </span>
          )}
        </div>
        <p className="text-[15px]" style={{ color: 'var(--color-text-secondary)' }}>
          노동법, 판례분석, 뉴스해설, 실무가이드 등 깊이 있는 노동법 콘텐츠를 제공합니다.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--grey-400)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="제목, 요약으로 검색..."
          aria-label="블로그 글 검색"
          className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-[14px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 focus:border-[var(--color-accent)]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}
        />
      </div>

      {/* Category Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => handleCategoryChange(cat.value)}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors border"
            style={
              activeCategory === cat.value
                ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }
                : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)', borderColor: 'var(--color-border)' }
            }
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Subtype Filter (뉴스해설 only) — 브리핑 카테고리 분리 후 딥다이브만 노출 */}
      {activeCategory === '뉴스해설' && (
        <div className="flex gap-2 mb-6 -mt-4">
          {[
            { value: null, label: '전체' },
            { value: 'deep-dive', label: '딥다이브' },
          ].map((sub) => (
            <button
              key={sub.value ?? 'all'}
              onClick={() => handleSubtypeChange(sub.value)}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors border"
              style={
                activeSubtype === sub.value
                  ? { backgroundColor: '#92400e', color: '#fff', borderColor: '#92400e' }
                  : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-500)', borderColor: 'var(--color-border)' }
              }
            >
              {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* View mode toggle (카드 ↔ 표) + 결과 카운트 */}
      {filtered.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
            총 {filtered.length}편
          </span>
          <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => handleViewMode('card')}
              aria-label="카드 보기"
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={
                viewMode === 'card'
                  ? { backgroundColor: 'var(--color-accent)', color: '#fff' }
                  : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)' }
              }
            >
              <LayoutGrid size={13} />
              카드
            </button>
            <button
              onClick={() => handleViewMode('list')}
              aria-label="표 보기"
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium transition-colors border-l"
              style={
                viewMode === 'list'
                  ? { backgroundColor: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }
                  : { backgroundColor: 'var(--color-bg-surface)', color: 'var(--grey-600)', borderColor: 'var(--color-border)' }
              }
            >
              <List size={13} />
              표
            </button>
          </div>
        </div>
      )}

      {/* Article Grid / List */}
      {initialArticles.length === 0 ? (
        <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          <p className="text-lg font-medium mb-1">등록된 글이 없습니다</p>
          <p className="text-sm">새로운 콘텐츠가 곧 게시될 예정입니다.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          검색 결과가 없습니다.
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {paginated.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
          <div className="hidden sm:grid grid-cols-[110px_120px_minmax(0,1fr)_140px] items-center gap-3 border-b px-2 py-2 text-[11px] font-semibold uppercase tracking-wide"
               style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', backgroundColor: 'var(--grey-50)' }}>
            <span>날짜</span>
            <span>카테고리</span>
            <span>제목</span>
            <span className="text-right">태그</span>
          </div>
          {paginated.map((article) => (
            <ArticleRow key={article.slug} article={article} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            disabled={currentPage <= 1}
            onClick={() => handlePage(currentPage - 1)}
            className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <ChevronLeft size={14} />
            이전
          </button>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {currentPage} / {totalPages} 페이지
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => handlePage(currentPage + 1)}
            className="flex items-center gap-1 rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--grey-50)] disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)' }}
          >
            다음
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
