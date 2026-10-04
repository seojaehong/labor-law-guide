'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, ArrowRight, LayoutGrid, List } from 'lucide-react';
import type { BlogArticle } from './page';
import '@/components/editorial-home.css';
import { PAGE_SIZE } from '@/lib/blog-list';

interface BlogClientProps {
  /** 이 페이지 몫만 온다. 예전에는 960편 전부가 왔고 그게 1.5MB 였다. */
  articles: BlogArticle[];
  /** 필터를 적용한 전체 건수 (서버가 count=exact 로 센 값) */
  total: number;
  page: number;
  activeCategory: string;
  activeSubtype: string | null;
  query: string;
  /** 페이지를 넘길 때 머무를 경로. 카테고리 페이지에서는 그 경로에 그대로 있는다. */
  basePath?: string;
}

const CATEGORIES = [
  { value: 'all', label: '종합' },
  { value: '노동법', label: '노동법' },
  { value: '판례분석', label: '판례분석' },
  { value: '뉴스해설', label: '뉴스해설' },
  { value: '뉴스브리핑', label: '뉴스브리핑' },
  { value: '실무가이드', label: '실무가이드' },
];



function formatDate(dateStr: string) {
  // timezone 차이로 인한 hydration mismatch 방지 — Date 객체 대신 문자열 직접 파싱
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}.${match[2]}.${match[3]}`;
  return dateStr.slice(0, 10).replace(/-/g, '.');
}

function ArticleEntry({ article, card = false }: { article: BlogArticle; card?: boolean }) {
  return (
    <article className={card ? 'editorial-blog-card' : 'editorial-text-row'}>
      <div className="editorial-row-meta editorial-meta">
        <span className="editorial-category">{article.category === 'general' ? '일반' : article.category}</span>
        <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
        {article.subtype === 'deep-dive' && <span>딥다이브</span>}
      </div>
      <div className="editorial-row-content">
        <h2><Link href={`/blog/${article.slug}`}>{article.title}</Link></h2>
        {article.subtitle && <p className="editorial-row-subtitle">{article.subtitle}</p>}
        {article.summary && <p>{article.summary}</p>}
        {article.tags?.length > 0 && <div className="editorial-row-tags">{article.tags.slice(0, 4).map(tag => <span key={tag}>#{tag}</span>)}</div>}
      </div>
      <Link href={`/blog/${article.slug}`} className="editorial-row-arrow" aria-label={`${article.title} 읽기`}><ArrowRight size={19} aria-hidden="true" /></Link>
    </article>
  );
}

export default function BlogClient({
  articles, total, page, activeCategory, activeSubtype, query, basePath = '/blog',
}: BlogClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 검색어만 입력 중에는 로컬로 들고 있다가 멈추면 URL 로 밀어 넣는다.
  const [searchQuery, setSearchQuery] = useState(query);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');

  useEffect(() => setSearchQuery(query), [query]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('blog_view_mode');
      if (saved === 'list' || saved === 'card') setViewMode(saved);
    } catch { /* Restricted storage still permits an in-session display choice. */ }
  }, []);

  const handleViewMode = (mode: 'card' | 'list') => {
    setViewMode(mode);
    try { window.localStorage.setItem('blog_view_mode', mode); } catch { /* Keep the in-session choice. */ }
  };

  /** 필터·페이지는 전부 URL 이 정본이다. 뒤로가기와 링크 공유가 그대로 동작한다. */
  const go = (next: Partial<{ cat: string; sub: string | null; q: string; page: number }>) => {
    const sp = new URLSearchParams();
    const cat = next.cat ?? activeCategory;
    const sub = next.sub !== undefined ? next.sub : activeSubtype;
    const q = next.q ?? searchQuery;
    const p = next.page ?? 1;
    if (cat && cat !== 'all') sp.set('cat', cat);
    if (sub) sp.set('sub', sub);
    if (q.trim()) sp.set('q', q.trim());
    if (p > 1) sp.set('page', String(p));
    // 카테고리를 바꾸는 건 목록 전체로 나가는 일이라 항상 /blog 로 간다.
    // 페이지만 넘길 때는 지금 경로(카테고리 페이지 포함)에 머문다.
    const changingCategory = next.cat !== undefined && next.cat !== activeCategory;
    const base = changingCategory ? '/blog' : basePath;
    if (base !== '/blog') sp.delete('cat');
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${base}?${qs}` : base, { scroll: false }));
  };

  // 입력이 멈추면(300ms) 검색한다. 글자마다 서버를 때리지 않는다.
  useEffect(() => {
    if (searchQuery === query) return;
    const t = setTimeout(() => go({ q: searchQuery, page: 1 }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = articles;
  const handleCategoryChange = (cat: string) => go({ cat, sub: null, page: 1 });
  const handleSubtypeChange = (sub: string | null) => go({ sub, page: 1 });
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value);
  const handlePage = (p: number) => {
    go({ page: p });
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="layout-list editorial-blog">
      <header className="editorial-blog-heading">
        <p className="editorial-kicker">노동법 정보와 실무 해설</p>
        <h1>글</h1>
        <p>노동법, 판례분석, 뉴스해설, 실무가이드 등 깊이 있는 노동법 콘텐츠를 제공합니다.</p>
      </header>

      <form className="editorial-blog-search" role="search" onSubmit={event => { event.preventDefault(); go({ q: searchQuery, page: 1 }); }}>
        <label htmlFor="blog-search">글 검색</label>
        <input id="blog-search" type="search" value={searchQuery} onChange={handleSearch} placeholder="제목, 부제, 요약으로 검색" />
        <button type="submit">검색 <Search size={16} aria-hidden="true" /></button>
      </form>

      <div className="editorial-filters" role="group" aria-label="글 카테고리">
        {CATEGORIES.map(cat => (
          <button key={cat.value} onClick={() => handleCategoryChange(cat.value)} aria-pressed={activeCategory === cat.value}>{cat.label}</button>
        ))}
      </div>
      {activeCategory === '뉴스해설' && (
        <div className="editorial-subtype-filters" role="group" aria-label="뉴스해설 종류">
          {[{ value: null, label: '전체' }, { value: 'deep-dive', label: '딥다이브' }].map(sub => (
            <button key={sub.value ?? 'all'} onClick={() => handleSubtypeChange(sub.value)} aria-pressed={activeSubtype === sub.value}>{sub.label}</button>
          ))}
        </div>
      )}

      <div className="editorial-result-status">
        <p role="status" aria-live="polite">{pending ? '검색 중…' : `총 ${total.toLocaleString()}편`}{query && !pending ? ` · “${query}” 검색 결과` : ''}</p>
        <div className="editorial-view-toggle" role="group" aria-label="목록 표시 방식">
          <button onClick={() => handleViewMode('list')} aria-label="목록 보기" aria-pressed={viewMode === 'list'}><List size={15} aria-hidden="true" />목록</button>
          <button onClick={() => handleViewMode('card')} aria-label="카드 보기" aria-pressed={viewMode === 'card'}><LayoutGrid size={15} aria-hidden="true" />카드</button>
        </div>
      </div>

      <div aria-busy={pending} className={viewMode === 'card' && articles.length > 0 ? 'editorial-blog-grid' : 'editorial-results'}>
        {articles.length === 0 ? (
          <div className="editorial-empty">
            <h2>{query || activeCategory !== 'all' || activeSubtype ? '검색 결과가 없습니다' : '등록된 글이 없습니다'}</h2>
            <p>{query || activeCategory !== 'all' || activeSubtype ? '다른 검색어나 카테고리로 다시 찾아보세요.' : '새로운 콘텐츠가 곧 게시될 예정입니다.'}</p>
            {(query || activeCategory !== 'all' || activeSubtype) && <Link href="/blog">전체 글 보기 <ArrowRight size={15} aria-hidden="true" /></Link>}
          </div>
        ) : paginated.map(article => <ArticleEntry key={article.slug} article={article} card={viewMode === 'card'} />)}
      </div>

      {totalPages > 1 && (
        <nav className="editorial-pagination" aria-label="글 목록 페이지">
          <button disabled={currentPage <= 1} onClick={() => handlePage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />이전</button>
          <span>{currentPage} / {totalPages} 페이지</span>
          <button disabled={currentPage >= totalPages} onClick={() => handlePage(currentPage + 1)}>다음<ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
      )}
    </div>
  );
}
