'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Search, ChevronLeft, ChevronRight, Calendar, Tag } from 'lucide-react';
import type { BlogArticle } from './page';

interface BlogClientProps {
  initialArticles: BlogArticle[];
}

const CATEGORIES = [
  { value: 'all', label: '종합' },
  { value: '노동법', label: '노동법' },
  { value: '판례분석', label: '판례분석' },
  { value: '뉴스해설', label: '뉴스해설' },
  { value: '실무가이드', label: '실무가이드' },
];

const PAGE_SIZE = 12;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function CategoryBadge({ category }: { category: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    '노동법': { bg: '#e8f3ff', text: '#1b64da' },
    '판례분석': { bg: '#f5f3ff', text: '#6d28d9' },
    '뉴스해설': { bg: '#fef3c7', text: '#92400e' },
    '실무가이드': { bg: '#ecfdf5', text: '#065f46' },
    'general': { bg: 'var(--grey-100)', text: 'var(--grey-600)' },
  };
  const color = colorMap[category] || colorMap['general'];
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {category === 'general' ? '일반' : category}
    </span>
  );
}

function ArticleCard({ article }: { article: BlogArticle }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="feature-card flex flex-col rounded-2xl border bg-white p-6 transition-shadow hover:shadow-md"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <CategoryBadge category={article.category} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let result = initialArticles;

    if (activeCategory !== 'all') {
      result = result.filter((a) => a.category === activeCategory);
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
  }, [initialArticles, activeCategory, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
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
          className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-[var(--color-accent)]"
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

      {/* Article Grid */}
      {initialArticles.length === 0 ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          검색 결과가 없습니다.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {paginated.map((article) => (
            <ArticleCard key={article.id} article={article} />
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
